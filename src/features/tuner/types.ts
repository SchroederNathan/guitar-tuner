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

export interface TunerSnapshot {
  status: TunerStatus;
  selectedString: StringId | null;
  targetFrequency: number | null;
  detectedFrequency: number | null;
  detectedNote: string | null;
  centsToTarget: number | null;
  confidence: number;
  isInTune: boolean;
  isStableInTune: boolean;
  completedStrings: StringId[];
  errorMessage: string | null;
}
