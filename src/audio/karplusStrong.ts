/**
 * Karplus-Strong plucked-string voice, ported from ../ChordTraining's
 * GuitarInstrument/KarplusStrongVoice (same AudioWorkletProcessor asset).
 * Unlike that project's persistent one-voice-per-string design, ChordPad has
 * no fixed string layout, so each pluck gets its own short-lived worklet
 * node that self-disconnects once the string has rung out.
 */

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

/** Thicker/lower strings are damped less (ring out longer), like a real guitar. */
function dampingForFrequency(frequency: number): number {
  const t = Math.min(1, Math.max(0, Math.log2(frequency / 82.41) / Math.log2(1000 / 82.41)));
  return 0.997 - t * 0.006;
}

const VOICE_LIFETIME_MS = 8000;

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

  setTimeout(() => {
    node.port.postMessage({ type: "mute" });
    node.disconnect();
    tone.disconnect();
    voiceGain.disconnect();
  }, delayMs + VOICE_LIFETIME_MS);
}
