/**
 * Generates a WaveShaper curve for a warm, tube-like overdrive. Uses a tanh
 * soft-clip (rather than a hard/fuzz-style clip) so even the top of the
 * range stays smooth and musical instead of buzzy. amount: 0-100.
 */
export function makeOverdriveCurve(amount: number): Float32Array<ArrayBuffer> {
  const samples = 1024;
  const curve = new Float32Array(samples);
  const drive = 1 + (amount / 100) * 9; // 1 (near-clean) .. 10 (warm overdrive)
  const normalize = Math.tanh(drive);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = Math.tanh(drive * x) / normalize;
  }
  return curve;
}

/** Post-gain compensation so higher drive doesn't blow out the master level. */
export function overdriveMakeupGain(amount: number): number {
  return 1 / (1 + (amount / 100) * 0.4);
}
