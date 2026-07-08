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

export const MIN_BPM = 40;
export const MAX_BPM = 240;

export type PlayMode = "arpeggio" | "block";

export interface PlaybackSettings {
  bpm: number;
  mode: PlayMode;
}

export const DEFAULT_PLAYBACK: PlaybackSettings = {
  bpm: 120,
  mode: "arpeggio",
};
