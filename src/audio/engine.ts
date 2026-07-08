import { makeOverdriveCurve, overdriveMakeupGain } from "./distortion";
import { pluckKarplusString, preloadKarplusStrongWorklet } from "./karplusStrong";
import { voiceForGuitar, voiceForPiano } from "./voicing";
import { registerVoice, stopAllVoices } from "./voiceRegistry";
import type { PlaybackSettings, StrokePattern, Timbre } from "../state/types";
import { STROKE_PRESETS } from "../state/types";
import type { ChordDef } from "../music/theory";

const STEAL_FADE_MS = 25;

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
    preloadKarplusStrongWorklet(audioContext);
  }
  if (audioContext.state === "suspended") {
    void audioContext.resume();
  }
  return audioContext;
}

function midiToFrequency(midiNote: number): number {
  return 440 * Math.pow(2, (midiNote - 69) / 12);
}

/** Builds the timbre signal chain and returns its input node (pre-connected to destination). */
function buildTimbreChain(ctx: AudioContext, timbre: Timbre): AudioNode {
  const input = ctx.createGain();
  input.gain.value = 1;

  const masterGain = ctx.createGain();
  masterGain.gain.value = timbre.masterVolume;
  masterGain.connect(ctx.destination);

  if (timbre.type === "piano") {
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 5200;
    input.connect(tone);
    tone.connect(masterGain);
    return input;
  }

  // Guitar: PreGain -> WaveShaper (soft-clip overdrive) -> Amp EQ (low/mid/high) -> PostGain
  const preGain = ctx.createGain();
  preGain.gain.value = 1.4;

  const shaper = ctx.createWaveShaper();
  shaper.curve = makeOverdriveCurve(timbre.distortionAmount);
  shaper.oversample = "4x";

  const low = ctx.createBiquadFilter();
  low.type = "lowshelf";
  low.frequency.value = 200;
  low.gain.value = timbre.ampEQ.low;

  const mid = ctx.createBiquadFilter();
  mid.type = "peaking";
  mid.frequency.value = 900;
  mid.Q.value = 0.7;
  mid.gain.value = timbre.ampEQ.mid;

  const high = ctx.createBiquadFilter();
  high.type = "highshelf";
  high.frequency.value = 3200;
  high.gain.value = timbre.ampEQ.high;

  const postGain = ctx.createGain();
  postGain.gain.value = overdriveMakeupGain(timbre.distortionAmount);

  input.connect(preGain);
  preGain.connect(shaper);
  shaper.connect(low);
  low.connect(mid);
  mid.connect(high);
  high.connect(postGain);

  postGain.connect(masterGain);
  return input;
}

function playNote(
  ctx: AudioContext,
  destination: AudioNode,
  frequency: number,
  startTime: number,
  instrument: Timbre["type"],
  velocity: number,
): void {
  if (instrument === "guitar") {
    void pluckKarplusString(ctx, destination, frequency, startTime, velocity);
    return;
  }

  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = frequency;

  const envelope = ctx.createGain();
  const peak = 0.28 * velocity;
  const attack = 0.005;
  const decay = 0.35;
  const sustainLevel = peak * 0.25;
  const releaseEnd = 1.6;

  envelope.gain.setValueAtTime(0, startTime);
  envelope.gain.linearRampToValueAtTime(peak, startTime + attack);
  envelope.gain.exponentialRampToValueAtTime(Math.max(sustainLevel, 0.0001), startTime + attack + decay);
  envelope.gain.exponentialRampToValueAtTime(0.0001, startTime + releaseEnd);

  osc.connect(envelope);
  envelope.connect(destination);

  osc.start(startTime);
  osc.stop(startTime + releaseEnd + 0.05);

  let stopped = false;
  registerVoice({
    stop: () => {
      if (stopped) return;
      stopped = true;
      const t = ctx.currentTime;
      envelope.gain.cancelScheduledValues(t);
      envelope.gain.setValueAtTime(envelope.gain.value, t);
      envelope.gain.linearRampToValueAtTime(0.0001, t + STEAL_FADE_MS / 1000);
      try {
        osc.stop(t + STEAL_FADE_MS / 1000 + 0.01);
      } catch {
        // Already stopped/scheduled to stop; ignore.
      }
    },
  });
}

/** Voices the chord appropriately for the instrument: real guitar-style
 * fretboard spread for guitar, wide bass+treble-doubled spread for piano. */
function voiceChord(chord: ChordDef, timbre: Timbre): number[] {
  return timbre.type === "guitar" ? voiceForGuitar(chord) : voiceForPiano(chord);
}

/** Plays a full chord as a single block at "now" through the given timbre. */
export function playChordBlock(chord: ChordDef, timbre: Timbre): void {
  const ctx = getAudioContext();
  const destination = buildTimbreChain(ctx, timbre);
  const startTime = ctx.currentTime + 0.01;
  for (const note of voiceChord(chord, timbre)) {
    playNote(ctx, destination, midiToFrequency(note), startTime, timbre.type, 1);
  }
}

/** Plays a chord following a strum pattern, timed against the given BPM. */
export function playChordStrum(
  chord: ChordDef,
  timbre: Timbre,
  playback: PlaybackSettings,
): void {
  const pattern: StrokePattern =
    STROKE_PRESETS.find((p) => p.id === playback.strokePatternId) ?? STROKE_PRESETS[0];
  const ctx = getAudioContext();
  const destination = buildTimbreChain(ctx, timbre);
  const secondsPerBeat = 60 / playback.bpm;
  const baseTime = ctx.currentTime + 0.01;
  const strumSpreadMs = 10; // delay between adjacent strings within one strum

  const sortedNotes = voiceChord(chord, timbre).sort((a, b) => a - b);

  for (const step of pattern.steps) {
    const stepTime = baseTime + step.beat * secondsPerBeat;
    const orderedNotes = step.direction === "down" ? sortedNotes : [...sortedNotes].reverse();
    orderedNotes.forEach((note, index) => {
      const noteTime = stepTime + (index * strumSpreadMs) / 1000;
      playNote(ctx, destination, midiToFrequency(note), noteTime, timbre.type, step.velocity);
    });
  }
}

/** Plays a pad according to the current playback mode (block or strum). Cuts
 * off whatever was still ringing from the previously played pad first. */
export function playPad(chord: ChordDef, timbre: Timbre, playback: PlaybackSettings): void {
  stopAllVoices();
  if (playback.mode === "strum") {
    playChordStrum(chord, timbre, playback);
  } else {
    playChordBlock(chord, timbre);
  }
}
