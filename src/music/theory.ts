export const NOTE_NAMES = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
] as const;

export type NoteName = (typeof NOTE_NAMES)[number];

export type ScaleType = "major" | "minor";

export type ChordQuality =
  | "major"
  | "minor"
  | "dim"
  | "aug"
  | "sus2"
  | "sus4"
  | "7"
  | "maj7"
  | "m7"
  | "m7b5"
  | "6"
  | "add9";

export type ChordFunction = "tonic" | "subdominant" | "dominant" | "nonDiatonic";

export interface ChordDef {
  root: NoteName;
  quality: ChordQuality;
  octave: number;
}

export interface DiatonicChord {
  degree: number; // 0-6
  romanLabel: string;
  chord: ChordDef;
  function: ChordFunction;
}

const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
const MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10];

const MAJOR_TRIAD_QUALITIES: ChordQuality[] = [
  "major", "minor", "minor", "major", "major", "minor", "dim",
];
const MINOR_TRIAD_QUALITIES: ChordQuality[] = [
  "minor", "dim", "major", "minor", "minor", "major", "major",
];

const MAJOR_SEVENTH_QUALITIES: ChordQuality[] = [
  "maj7", "m7", "m7", "maj7", "7", "m7", "m7b5",
];
const MINOR_SEVENTH_QUALITIES: ChordQuality[] = [
  "m7", "m7b5", "maj7", "m7", "m7", "maj7", "7",
];

const MAJOR_FUNCTIONS: ChordFunction[] = [
  "tonic", "subdominant", "tonic", "subdominant", "dominant", "tonic", "dominant",
];
const MINOR_FUNCTIONS: ChordFunction[] = [
  "tonic", "subdominant", "tonic", "subdominant", "dominant", "subdominant", "dominant",
];

const MAJOR_ROMAN = ["I", "ii", "iii", "IV", "V", "vi", "vii°"];
const MINOR_ROMAN = ["i", "ii°", "III", "iv", "v", "VI", "VII"];

export interface ScaleConfig {
  root: NoteName;
  type: ScaleType;
  useHarmonicMinorDominant: boolean;
  use7thChords: boolean;
}

export function transposeNote(root: NoteName, semitones: number): NoteName {
  const rootIndex = NOTE_NAMES.indexOf(root);
  const index = (rootIndex + semitones + 1200) % 12;
  return NOTE_NAMES[index];
}

export function getDiatonicChords(scale: ScaleConfig): DiatonicChord[] {
  const steps = scale.type === "major" ? MAJOR_STEPS : MINOR_STEPS;
  const triadQualities = scale.type === "major" ? MAJOR_TRIAD_QUALITIES : MINOR_TRIAD_QUALITIES;
  const seventhQualities = scale.type === "major" ? MAJOR_SEVENTH_QUALITIES : MINOR_SEVENTH_QUALITIES;
  const functions = scale.type === "major" ? MAJOR_FUNCTIONS : MINOR_FUNCTIONS;
  const romans = scale.type === "major" ? MAJOR_ROMAN : MINOR_ROMAN;

  return steps.map((step, degree) => {
    const root = transposeNote(scale.root, step);
    let quality = scale.use7thChords ? seventhQualities[degree] : triadQualities[degree];
    let romanLabel = romans[degree];

    // Harmonic-minor-borrowed dominant: raise degree-v to a major/dominant chord.
    if (scale.type === "minor" && scale.useHarmonicMinorDominant && degree === 4) {
      quality = scale.use7thChords ? "7" : "major";
      romanLabel = "V";
    }

    return {
      degree,
      romanLabel,
      chord: { root, quality, octave: 4 },
      function: functions[degree],
    };
  });
}

/** Interval structure (semitones from chord root) per quality. */
const QUALITY_INTERVALS: Record<ChordQuality, number[]> = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  "7": [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  m7b5: [0, 3, 6, 10],
  "6": [0, 4, 7, 9],
  add9: [0, 4, 7, 14],
};

export function chordToMidiNotes(chord: ChordDef): number[] {
  const rootIndex = NOTE_NAMES.indexOf(chord.root);
  const rootMidi = 12 * (chord.octave + 1) + rootIndex;
  return QUALITY_INTERVALS[chord.quality].map((interval) => rootMidi + interval);
}

/**
 * Determines the functional-harmony label for an arbitrary chord relative to
 * the current scale, by matching root+quality against the diatonic set.
 */
export function getChordFunction(chord: ChordDef, scale: ScaleConfig): ChordFunction {
  const diatonicChords = getDiatonicChords(scale);
  const match = diatonicChords.find(
    (d) => d.chord.root === chord.root && d.chord.quality === chord.quality,
  );
  return match ? match.function : "nonDiatonic";
}

export const FUNCTION_LABELS: Record<ChordFunction, string> = {
  tonic: "T",
  subdominant: "SD",
  dominant: "D",
  nonDiatonic: "—",
};

export const CHORD_QUALITIES: ChordQuality[] = [
  "major", "minor", "dim", "aug", "sus2", "sus4",
  "7", "maj7", "m7", "m7b5", "6", "add9",
];

export const CHORD_QUALITY_SUFFIX: Record<ChordQuality, string> = {
  major: "",
  minor: "m",
  dim: "dim",
  aug: "aug",
  sus2: "sus2",
  sus4: "sus4",
  "7": "7",
  maj7: "maj7",
  m7: "m7",
  m7b5: "m7b5",
  "6": "6",
  add9: "add9",
};

export function chordLabel(chord: ChordDef): string {
  return `${chord.root}${CHORD_QUALITY_SUFFIX[chord.quality]}`;
}
