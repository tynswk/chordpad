export type InstrumentType = "piano" | "guitar";

export interface Timbre {
  type: InstrumentType;
  distortionAmount: number; // guitar only, 0-100 ("Overdrive" knob)
  ampEQ: { low: number; mid: number; high: number }; // guitar only, -12..+12 dB
  masterVolume: number; // 0-1
}

export const DEFAULT_TIMBRE: Timbre = {
  type: "piano",
  distortionAmount: 35,
  ampEQ: { low: 2, mid: 0, high: 2 },
  masterVolume: 0.9,
};

export type PlayMode = "block" | "strum";

export type StrumDirection = "down" | "up";

export interface StrumStep {
  beat: number; // offset in beats from the tap
  direction: StrumDirection;
  velocity: number; // 0-1
}

export interface StrokePattern {
  id: string;
  name: string;
  steps: StrumStep[];
}

export const STROKE_PRESETS: StrokePattern[] = [
  {
    id: "eighthDown",
    name: "8分ジャカジャカ",
    steps: [
      { beat: 0, direction: "down", velocity: 0.95 },
      { beat: 0.5, direction: "down", velocity: 0.8 },
      { beat: 1, direction: "down", velocity: 0.95 },
      { beat: 1.5, direction: "down", velocity: 0.8 },
    ],
  },
  {
    id: "eighthDownUp",
    name: "8分ダウンアップ",
    steps: [
      { beat: 0, direction: "down", velocity: 0.95 },
      { beat: 0.5, direction: "up", velocity: 0.55 },
      { beat: 1, direction: "down", velocity: 0.9 },
      { beat: 1.5, direction: "up", velocity: 0.55 },
    ],
  },
  {
    id: "quarter",
    name: "4つ打ち",
    steps: [
      { beat: 0, direction: "down", velocity: 0.9 },
      { beat: 1, direction: "down", velocity: 0.9 },
    ],
  },
  {
    id: "syncopated",
    name: "タン・タタン",
    steps: [
      { beat: 0, direction: "down", velocity: 0.95 },
      { beat: 0.75, direction: "down", velocity: 0.7 },
      { beat: 1, direction: "down", velocity: 0.85 },
    ],
  },
];

export interface PlaybackSettings {
  bpm: number;
  mode: PlayMode;
  strokePatternId: string;
}

export const DEFAULT_PLAYBACK: PlaybackSettings = {
  bpm: 120,
  mode: "block",
  strokePatternId: STROKE_PRESETS[0].id,
};
