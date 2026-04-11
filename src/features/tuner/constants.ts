export const STANDARD_TUNING = [
  {
    id: "E2",
    label: "Low E",
    frequency: 82.41,
  },
  {
    id: "A2",
    label: "A",
    frequency: 110,
  },
  {
    id: "D3",
    label: "D",
    frequency: 146.83,
  },
  {
    id: "G3",
    label: "G",
    frequency: 196,
  },
  {
    id: "B3",
    label: "B",
    frequency: 246.94,
  },
  {
    id: "E4",
    label: "High E",
    frequency: 329.63,
  },
] as const;

export const TARGET_FREQUENCIES = Object.fromEntries(
  STANDARD_TUNING.map((item) => [item.id, item.frequency])
) as Record<(typeof STANDARD_TUNING)[number]["id"], number>;

export const TARGET_LABELS = Object.fromEntries(
  STANDARD_TUNING.map((item) => [item.id, item.label])
) as Record<(typeof STANDARD_TUNING)[number]["id"], string>;

export const AUDIO_SAMPLE_RATE = 16000;
export const WORKLET_BUFFER_LENGTH = 1024;
export const ANALYSIS_BUFFER_LENGTH = 4096;
export const MIN_GUITAR_FREQUENCY = 70;
export const MAX_GUITAR_FREQUENCY = 400;
export const RMS_NOISE_GATE = 0.0025;
export const CONFIDENCE_THRESHOLD = 0.45;
export const STALE_DETECTION_MS = 150;
export const IN_TUNE_CENTS = 5;
export const STABLE_IN_TUNE_MS = 250;
