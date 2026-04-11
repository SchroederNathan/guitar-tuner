import {
  IN_TUNE_CENTS,
  MAX_GUITAR_FREQUENCY,
  MIN_GUITAR_FREQUENCY,
} from "@/features/tuner/constants";
import { DetectedNote } from "@/features/tuner/types";

const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;

export interface PitchReading {
  confidence: number;
  frequency: number;
  rms: number;
}

export function calculateRms(samples: ArrayLike<number>): number {
  if (samples.length === 0) {
    return 0;
  }

  let sum = 0;

  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index] ?? 0;
    sum += sample * sample;
  }

  return Math.sqrt(sum / samples.length);
}

export function detectPitchYin(
  samples: ArrayLike<number>,
  sampleRate: number,
  minFrequency: number = MIN_GUITAR_FREQUENCY,
  maxFrequency: number = MAX_GUITAR_FREQUENCY,
  threshold: number = 0.12
): PitchReading | null {
  const sampleCount = samples.length;
  if (sampleCount < 2) {
    return null;
  }

  const rms = calculateRms(samples);
  const tauMin = Math.max(2, Math.floor(sampleRate / maxFrequency));
  const tauMax = Math.min(
    sampleCount - 2,
    Math.floor(sampleRate / minFrequency)
  );

  if (tauMax <= tauMin) {
    return null;
  }

  const difference = new Float32Array(tauMax + 1);
  const cumulative = new Float32Array(tauMax + 1);

  for (let tau = tauMin; tau <= tauMax; tau += 1) {
    let sum = 0;
    const limit = sampleCount - tau;

    for (let index = 0; index < limit; index += 1) {
      const delta = (samples[index] ?? 0) - (samples[index + tau] ?? 0);
      sum += delta * delta;
    }

    difference[tau] = sum;
  }

  cumulative[0] = 1;
  let runningSum = 0;

  for (let tau = 1; tau <= tauMax; tau += 1) {
    runningSum += difference[tau];
    cumulative[tau] =
      runningSum === 0 ? 1 : (difference[tau] * tau) / runningSum;
  }

  let bestTau = -1;
  let bestValue = 1;

  for (let tau = tauMin; tau <= tauMax; tau += 1) {
    const value = cumulative[tau];
    if (value < bestValue) {
      bestValue = value;
      bestTau = tau;
    }

    if (value < threshold) {
      let currentTau = tau;
      while (
        currentTau + 1 <= tauMax &&
        cumulative[currentTau + 1] < cumulative[currentTau]
      ) {
        currentTau += 1;
      }

      bestTau = currentTau;
      bestValue = cumulative[currentTau];
      break;
    }
  }

  if (bestTau < 0) {
    return null;
  }

  let refinedTau = bestTau;
  if (bestTau > tauMin && bestTau < tauMax) {
    const previous = cumulative[bestTau - 1] ?? cumulative[bestTau];
    const current = cumulative[bestTau];
    const next = cumulative[bestTau + 1] ?? cumulative[bestTau];
    const denominator = 2 * (2 * current - next - previous);

    if (denominator !== 0) {
      refinedTau = bestTau + (next - previous) / denominator;
    }
  }

  const frequency = sampleRate / refinedTau;
  if (
    !Number.isFinite(frequency) ||
    frequency < minFrequency ||
    frequency > maxFrequency
  ) {
    return null;
  }

  return {
    frequency,
    confidence: Math.max(0, Math.min(1, 1 - bestValue)),
    rms,
  };
}

export function frequencyToMidi(frequency: number): number {
  return 69 + 12 * Math.log2(frequency / 440);
}

export function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function frequencyToDetectedNote(frequency: number): DetectedNote {
  const midi = Math.round(frequencyToMidi(frequency));
  const name = NOTE_NAMES[((midi % 12) + 12) % 12] ?? "C";
  const octave = Math.floor(midi / 12) - 1;

  return {
    midi,
    name,
    octave,
    label: `${name}${octave}`,
    frequency: midiToFrequency(midi),
  };
}

export function centsBetween(frequency: number, targetFrequency: number): number {
  return 1200 * Math.log2(frequency / targetFrequency);
}

export function clampCents(cents: number): number {
  return Math.max(-50, Math.min(50, cents));
}

export function isWithinTune(cents: number): boolean {
  return Math.abs(cents) <= IN_TUNE_CENTS;
}
