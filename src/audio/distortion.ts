/** Generates a WaveShaper curve for guitar-style overdrive/distortion. amount: 0-100. */
export function makeDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
  const samples = 1024;
  const curve = new Float32Array(samples);
  const k = (amount / 100) * 45; // drive strength
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return curve;
}

/** Post-gain compensation so higher drive doesn't blow out the master level. */
export function distortionMakeupGain(amount: number): number {
  return 1 / (1 + (amount / 100) * 0.8);
}
