import { startTransition } from "react";
import { Platform } from "react-native";
import {
  AudioManager,
  AudioRecorder,
} from "react-native-audio-api";

import {
  ANALYSIS_BUFFER_LENGTH,
  AUDIO_SAMPLE_RATE,
  CONFIDENCE_THRESHOLD,
  IN_TUNE_CENTS,
  MAX_GUITAR_FREQUENCY,
  MIN_GUITAR_FREQUENCY,
  PITCH_HISTORY_WINDOW_MS,
  RMS_NOISE_GATE,
  STABLE_IN_TUNE_MS,
  STALE_DETECTION_MS,
  TARGET_FREQUENCIES,
  WORKLET_BUFFER_LENGTH,
} from "@/features/tuner/constants";
import {
  centsBetween,
  clampCents,
  detectPitchYin,
  frequencyToDetectedNote,
  isWithinTune,
} from "@/features/tuner/pitch";
import {
  PitchHistoryPoint,
  StringId,
  TunerSnapshot,
  WorkletPitchPacket,
} from "@/features/tuner/types";

type Listener = () => void;

const INITIAL_SNAPSHOT: TunerSnapshot = {
  status: "idle",
  selectedString: null,
  targetFrequency: null,
  detectedFrequency: null,
  detectedNote: null,
  nearestNote: null,
  centsToTarget: null,
  displayCents: null,
  confidence: 0,
  signalState: "idle",
  pitchHistory: [],
  isInTune: false,
  isStableInTune: false,
  completedStrings: [],
  errorMessage: null,
};

export class TunerEngine {
  private listeners = new Set<Listener>();
  private snapshot: TunerSnapshot = INITIAL_SNAPSHOT;
  private recorder: AudioRecorder | null = null;
  private startPromise: Promise<void> | null = null;
  private completedStrings = new Set<StringId>();
  private stableSince: number | null = null;
  private lastReliablePacketAt = 0;
  private rollingBuffer = new Float32Array(ANALYSIS_BUFFER_LENGTH);
  private rollingIndex = 0;

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.snapshot;

  selectString = async (stringId: StringId) => {
    if (this.snapshot.selectedString !== stringId) {
      this.stableSince = null;
    }

    this.setSnapshot({
      selectedString: stringId,
      targetFrequency: TARGET_FREQUENCIES[stringId],
      detectedFrequency: null,
      detectedNote: null,
      nearestNote: null,
      centsToTarget: null,
      displayCents: null,
      signalState: "idle",
      pitchHistory: [],
      isStableInTune: false,
      errorMessage:
        this.snapshot.status === "permission-denied"
          ? "Microphone access is still blocked. Enable it in Settings and tap a string again."
          : null,
    });

    await this.ensureStarted();
  };

  cleanup = async () => {
    this.startPromise = null;
    this.stableSince = null;
    this.lastReliablePacketAt = 0;
    this.rollingBuffer = new Float32Array(ANALYSIS_BUFFER_LENGTH);
    this.rollingIndex = 0;

    const recorder = this.recorder;

    this.recorder = null;

    try {
      recorder?.disconnect();
    } catch {}

    try {
      if (recorder?.isRecording()) {
        recorder.stop();
      }
    } catch {}

    try {
      recorder?.clearOnAudioReady();
    } catch {}

    try {
      recorder?.clearOnError();
    } catch {}

    try {
      await AudioManager.setAudioSessionActivity(false);
    } catch {}

    this.setSnapshot({
      status: "idle",
      detectedFrequency: null,
      detectedNote: null,
      nearestNote: null,
      centsToTarget: null,
      displayCents: null,
      confidence: 0,
      signalState: "idle",
      pitchHistory: [],
      isInTune: false,
      isStableInTune: false,
      errorMessage: null,
    });
  };

  private ensureStarted = async () => {
    if (Platform.OS === "web") {
      this.setSnapshot({
        status: "error",
        errorMessage:
          "This tuner MVP targets iOS and Android development builds. Open it on a device or simulator with a native dev build.",
      });
      return;
    }

    if (this.snapshot.status === "listening" && this.recorder) {
      return;
    }

    if (this.startPromise) {
      return this.startPromise;
    }

    const startTask = this.startListening().finally(() => {
      this.startPromise = null;
    });
    this.startPromise = startTask;
    return startTask;
  };

  private startListening = async () => {
    this.setSnapshot({
      status: "requesting-permission",
      errorMessage: null,
    });

    const permission = await AudioManager.requestRecordingPermissions();
    if (permission !== "Granted") {
      this.setSnapshot({
        status: "permission-denied",
        detectedFrequency: null,
        detectedNote: null,
        centsToTarget: null,
        confidence: 0,
        isInTune: false,
        isStableInTune: false,
        errorMessage:
          "Microphone access is required to tune your guitar. Enable it in Settings, then tap a string again.",
      });
      return;
    }

    AudioManager.setAudioSessionOptions({
      iosCategory: "record",
      iosMode: "measurement",
      iosOptions: [],
    });

    const canActivateSession = await AudioManager.setAudioSessionActivity(true);
    if (!canActivateSession) {
      this.setSnapshot({
        status: "error",
        errorMessage:
          "The audio session could not be activated. Close other recording apps and try again.",
      });
      return;
    }

    try {
      const recorder = new AudioRecorder();

      recorder.onError((event) => {
        console.error("[tuner] recorder error", event.message);
        this.setSnapshot({
          status: "error",
          errorMessage: event.message,
        });
      });

      const callbackResult = recorder.onAudioReady(
        {
          sampleRate: AUDIO_SAMPLE_RATE,
          bufferLength: WORKLET_BUFFER_LENGTH,
          channelCount: 1,
        },
        (event) => {
          const samples = event.buffer.getChannelData(0);
          this.pushSamples(samples);

          const analysisWindow = this.getAnalysisWindow();
          const pitch = detectPitchYin(
            analysisWindow,
            event.buffer.sampleRate,
            MIN_GUITAR_FREQUENCY,
            MAX_GUITAR_FREQUENCY
          );

          this.handleWorkletPacket({
            confidence: pitch?.confidence ?? 0,
            frequency:
              pitch && pitch.rms >= RMS_NOISE_GATE && pitch.confidence >= CONFIDENCE_THRESHOLD
                ? pitch.frequency
                : null,
            rms: pitch?.rms ?? 0,
          });
        }
      );

      if (callbackResult.status === "error") {
        throw new Error(callbackResult.message);
      }

      const recorderResult = recorder.start();
      if (recorderResult.status === "error") {
        throw new Error(recorderResult.message);
      }

      this.recorder = recorder;

      this.setSnapshot({
        status: "listening",
        errorMessage: null,
      });
    } catch (error) {
      console.error("[tuner] failed to start", error);
      const message =
        error instanceof Error
          ? error.message
          : "The tuner could not start listening.";

      await this.cleanup();
      this.setSnapshot({
        status: "error",
        errorMessage: message,
      });
    }
  };

  private handleWorkletPacket = (packet: WorkletPitchPacket) => {
    const now = Date.now();
    const selectedString = this.snapshot.selectedString;
    const targetFrequency = selectedString
      ? TARGET_FREQUENCIES[selectedString]
      : null;

    if (!selectedString || !targetFrequency) {
      this.setSnapshot({
        confidence: packet.confidence,
        signalState: "idle",
        pitchHistory: [],
      });
      return;
    }

    if (packet.frequency) {
      this.lastReliablePacketAt = now;
      const detectedNote = frequencyToDetectedNote(packet.frequency);
      const centsToTarget = centsBetween(packet.frequency, targetFrequency);
      const isInTune = isWithinTune(centsToTarget);
      const pitchHistory = this.pushPitchHistory({
        at: now,
        frequency: packet.frequency,
        cents: centsToTarget,
        confidence: packet.confidence,
      });
      let isStableInTune = false;

      if (isInTune) {
        this.stableSince ??= now;
        isStableInTune = now - this.stableSince >= STABLE_IN_TUNE_MS;
      } else {
        this.stableSince = null;
      }

      if (isStableInTune) {
        this.completedStrings.add(selectedString);
      }

      this.setSnapshot({
        status: "listening",
        detectedFrequency: packet.frequency,
        detectedNote: detectedNote.label,
        nearestNote: detectedNote.label,
        centsToTarget,
        displayCents: centsToTarget,
        confidence: packet.confidence,
        signalState: "live",
        pitchHistory,
        isInTune,
        isStableInTune,
        completedStrings: [...this.completedStrings],
        errorMessage: null,
      });
      return;
    }

    const shouldFreezeLastGoodReading =
      this.snapshot.detectedFrequency !== null &&
      now - this.lastReliablePacketAt < STALE_DETECTION_MS;

    if (shouldFreezeLastGoodReading) {
      this.setSnapshot({
        confidence: packet.confidence,
        signalState: "holding",
        pitchHistory: this.trimPitchHistory(this.snapshot.pitchHistory, now),
      });
      return;
    }

    this.stableSince = null;
    this.setSnapshot({
      confidence: packet.confidence,
      detectedFrequency: null,
      detectedNote: null,
      nearestNote: null,
      centsToTarget: null,
      displayCents: null,
      signalState: "idle",
      pitchHistory: this.trimPitchHistory(this.snapshot.pitchHistory, now),
      isInTune: false,
      isStableInTune: false,
    });
  };

  private pushSamples(samples: Float32Array) {
    for (let index = 0; index < samples.length; index += 1) {
      this.rollingBuffer[this.rollingIndex] = samples[index] ?? 0;
      this.rollingIndex = (this.rollingIndex + 1) % ANALYSIS_BUFFER_LENGTH;
    }
  }

  private getAnalysisWindow() {
    const window = new Float32Array(ANALYSIS_BUFFER_LENGTH);

    for (let index = 0; index < ANALYSIS_BUFFER_LENGTH; index += 1) {
      window[index] =
        this.rollingBuffer[(this.rollingIndex + index) % ANALYSIS_BUFFER_LENGTH] ?? 0;
    }

    return window;
  }

  private pushPitchHistory(point: PitchHistoryPoint) {
    return this.trimPitchHistory([...this.snapshot.pitchHistory, point], point.at);
  }

  private trimPitchHistory(history: PitchHistoryPoint[], now: number) {
    return history.filter((point) => now - point.at <= PITCH_HISTORY_WINDOW_MS);
  }

  private setSnapshot = (partial: Partial<TunerSnapshot>) => {
    const nextSnapshot: TunerSnapshot = {
      ...this.snapshot,
      ...partial,
    };

    if (
      nextSnapshot.centsToTarget !== null &&
      Number.isFinite(nextSnapshot.centsToTarget)
    ) {
      nextSnapshot.centsToTarget = clampCents(nextSnapshot.centsToTarget);
      nextSnapshot.isInTune =
        partial.isInTune ?? Math.abs(nextSnapshot.centsToTarget) <= IN_TUNE_CENTS;
    }

    this.snapshot = nextSnapshot;
    startTransition(() => {
      this.listeners.forEach((listener) => {
        listener();
      });
    });
  };
}

export const tunerEngine = new TunerEngine();
