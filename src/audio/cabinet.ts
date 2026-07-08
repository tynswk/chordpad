/**
 * Synthesizes a placeholder guitar-cabinet impulse response (band-limited,
 * fast-decaying noise burst) so the cabinet stage works with no external IR
 * assets. This approximates the general roll-off/resonance character of a
 * mic'd speaker cabinet; swapping in a real recorded IR file later is a
 * drop-in replacement (see SPEC.md section 15).
 */
export function createCabinetImpulseResponse(ctx: AudioContext): AudioBuffer {
  const duration = 0.12;
  const length = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < length; i++) {
    const t = i / ctx.sampleRate;
    const decay = Math.exp(-t * 45);
    // A couple of resonant partials in the 1.5-3kHz "speaker honk" range.
    const resonance =
      Math.sin(2 * Math.PI * 1800 * t) * 0.6 + Math.sin(2 * Math.PI * 2800 * t) * 0.4;
    const noise = (Math.random() * 2 - 1) * 0.5;
    data[i] = (resonance * 0.6 + noise * 0.4) * decay;
  }

  return buffer;
}
