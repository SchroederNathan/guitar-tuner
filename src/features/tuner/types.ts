import { STANDARD_TUNING } from "@/features/tuner/constants";

export type StringId = (typeof STANDARD_TUNING)[number]["id"];

export type TunerStatus =
  | "idle"
  | "requesting-permission"
  | "listening"
  | "permission-denied"
  | "error";

export interface DetectedNote {
  midi: number;
  name: string;
  octave: number;
  label: string;
  frequency: number;
}

export interface WorkletPitchPacket {
  confidence: number;
  frequency: number | null;
  rms: number;
}

export type SignalState = "live" | "holding" | "idle";

export interface PitchHistoryPoint {
  at: number;
  frequency: number;
  cents: number;
  confidence: number;
}

export interface TunerSnapshot {
  status: TunerStatus;
  selectedString: StringId | null;
  targetFrequency: number | null;
  detectedFrequency: number | null;
  detectedNote: string | null;
  nearestNote: string | null;
  centsToTarget: number | null;
  displayCents: number | null;
  confidence: number;
  signalState: SignalState;
  pitchHistory: PitchHistoryPoint[];
  isInTune: boolean;
  isStableInTune: boolean;
  completedStrings: StringId[];
  errorMessage: string | null;
}
