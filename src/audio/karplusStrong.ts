/**
 * Karplus-Strong plucked-string voice, ported from ../ChordTraining's
 * GuitarInstrument/KarplusStrongVoice (same AudioWorkletProcessor asset).
 * Unlike that project's persistent one-voice-per-string design, ChordPad has
 * no fixed string layout, so each pluck gets its own short-lived worklet
 * node that self-disconnects once the string has rung out.
 */

import { registerVoice } from "./voiceRegistry";

let workletModuleLoaded: Promise<void> | null = null;

function loadWorkletModule(ctx: AudioContext): Promise<void> {
  if (!workletModuleLoaded) {
    workletModuleLoaded = ctx.audioWorklet.addModule(
      `${import.meta.env.BASE_URL}audio-worklets/karplus-strong-processor.js`,
    );
  }
  return workletModuleLoaded;
}

/** Kick off worklet module loading early so the first pad tap isn't delayed. */
export function preloadKarplusStrongWorklet(ctx: AudioContext): void {
  void loadWorkletModule(ctx);
}

/**
 * Thicker/lower strings are damped less (ring out longer), like a real guitar.
 * Because decay time = periodsToDecay / frequency, even a small damping delta
 * compounds a lot at higher pitches -- so the band here intentionally matches
 * ../ChordTraining's real per-string range (0.9945-0.997, low E to high e)
 * rather than a wider one, which was cutting high notes off in well under a
 * second.
 */
function dampingForFrequency(frequency: number): number {
  const t = Math.min(1, Math.max(0, Math.log2(frequency / 82.41) / Math.log2(659.25 / 82.41)));
  return 0.997 - t * 0.0025;
}

const VOICE_LIFETIME_MS = 12000;
const FADE_OUT_MS = 120;
const STEAL_FADE_MS = 25;

/** Plucks a one-shot Karplus-Strong string voice, routed into `destination`. */
export async function pluckKarplusString(
  ctx: AudioContext,
  destination: AudioNode,
  frequency: number,
  startTime: number,
  velocity: number,
): Promise<void> {
  await loadWorkletModule(ctx);

  const node = new AudioWorkletNode(ctx, "karplus-strong-processor", {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [1],
  });

  // Smooths the raw noise-burst excitation into a warmer plucked-string tone.
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 3500;
  tone.Q.value = 0.5;

  const voiceGain = ctx.createGain();
  voiceGain.gain.value = velocity;

  node.connect(tone);
  tone.connect(voiceGain);
  voiceGain.connect(destination);

  let stopped = false;
  let fadeTimeout: ReturnType<typeof setTimeout> | null = null;
  let cleanupTimeout: ReturnType<typeof setTimeout> | null = null;

  const disconnectAll = () => {
    node.disconnect();
    tone.disconnect();
    voiceGain.disconnect();
  };

  const delayMs = Math.max(0, (startTime - ctx.currentTime) * 1000);
  const fire = () => {
    node.port.postMessage({
      type: "pluck",
      frequency,
      pluckStrength: 1,
      damping: dampingForFrequency(frequency),
    });
  };
  if (delayMs <= 1) fire();
  else setTimeout(fire, delayMs);

  // Fade out just before cleanup so a still-ringing low string doesn't click off.
  const fadeStart = delayMs + VOICE_LIFETIME_MS - FADE_OUT_MS;
  fadeTimeout = setTimeout(() => {
    const t = ctx.currentTime;
    voiceGain.gain.setValueAtTime(voiceGain.gain.value, t);
    voiceGain.gain.linearRampToValueAtTime(0, t + FADE_OUT_MS / 1000);
  }, Math.max(0, fadeStart));

  cleanupTimeout = setTimeout(() => {
    stopped = true;
    node.port.postMessage({ type: "mute" });
    disconnectAll();
  }, delayMs + VOICE_LIFETIME_MS);

  registerVoice({
    stop: () => {
      if (stopped) return;
      stopped = true;
      if (fadeTimeout) clearTimeout(fadeTimeout);
      if (cleanupTimeout) clearTimeout(cleanupTimeout);

      const t = ctx.currentTime;
      voiceGain.gain.cancelScheduledValues(t);
      voiceGain.gain.setValueAtTime(voiceGain.gain.value, t);
      voiceGain.gain.linearRampToValueAtTime(0, t + STEAL_FADE_MS / 1000);
      node.port.postMessage({ type: "mute" });
      setTimeout(disconnectAll, STEAL_FADE_MS + 20);
    },
  });
}
