import { chordPitchClasses, chordToMidiNotes, type ChordDef } from "../music/theory";

// Standard guitar tuning, low string to high string (E2 A2 D3 G3 B3 E4).
const STANDARD_TUNING_MIDI = [40, 45, 50, 55, 59, 64];

/**
 * Approximates how a guitarist actually voices a chord: for each of the 6
 * strings (standard tuning), find the lowest fret (0-12) whose pitch class
 * belongs to the chord and sound that. This naturally spreads the chord
 * across ~2 octaves and doubles common tones (root/fifth especially), which
 * is much closer to a real strummed chord than a single close-position
 * triad/seventh stacked in one octave.
 */
export function voiceForGuitar(chord: ChordDef): number[] {
  const pitchClasses = chordPitchClasses(chord);
  const notes: number[] = [];
  for (const openStringMidi of STANDARD_TUNING_MIDI) {
    for (let fret = 0; fret <= 12; fret++) {
      const midi = openStringMidi + fret;
      if (pitchClasses.has(midi % 12)) {
        notes.push(midi);
        break;
      }
    }
  }
  return notes;
}

/**
 * Spreads the chord wider for piano: a bass note an octave below the root
 * (left-hand style) plus the top note doubled an octave up, bracketing the
 * close-position voicing.
 */
export function voiceForPiano(chord: ChordDef): number[] {
  const close = chordToMidiNotes(chord);
  const bass = close[0] - 12;
  const top = close[close.length - 1] + 12;
  return [bass, ...close, top];
}
