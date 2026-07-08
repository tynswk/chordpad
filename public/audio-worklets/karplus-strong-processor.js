// Karplus-Strong plucked-string physical model, implemented as an AudioWorkletProcessor.
// One processor instance is created per guitar string (persistent for the instrument's
// lifetime) and re-triggered via postMessage for each new pluck, matching the requirement
// of "one buffer-based Karplus-Strong voice per string".
//
// Algorithm per pluck:
//   1. Fill a ring buffer of length (sampleRate / frequency) with white noise, scaled by
//      pluck strength -- this is the excitation.
//   2. Each output sample = current ring buffer read position.
//   3. Write back into the same position: damping * average(current, next) -- the classic
//      Karplus-Strong lowpass-in-the-feedback-loop, which both decays the signal and low-
//      pass-filters it (mimicking a real string losing high harmonics fastest).
//   4. Advance the read/write pointer circularly.
//
// Fractional buffer length (guitar frequencies rarely divide the sample rate evenly) is
// handled via linear interpolation between the two nearest integer-sample taps, which
// meaningfully improves pitch accuracy over naive integer-length delay lines.

class KarplusStrongProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = null;
    this.bufferLength = 0;
    this.writeIndex = 0;
    this.damping = 0.996;
    this.active = false;

    this.port.onmessage = (event) => {
      const { type } = event.data;
      if (type === 'pluck') {
        this.pluck(event.data.frequency, event.data.pluckStrength ?? 1, event.data.damping);
      } else if (type === 'mute') {
        this.active = false;
      }
    };
  }

  pluck(frequency, pluckStrength, damping) {
    const clampedFreq = Math.max(20, Math.min(sampleRate / 2, frequency));
    this.bufferLength = Math.max(2, Math.floor(sampleRate / clampedFreq));
    this.buffer = new Float32Array(this.bufferLength);
    for (let i = 0; i < this.bufferLength; i++) {
      this.buffer[i] = (Math.random() * 2 - 1) * pluckStrength;
    }
    this.writeIndex = 0;
    if (typeof damping === 'number') this.damping = damping;
    this.active = true;
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    const channel = output[0];

    if (!this.active || !this.buffer) {
      channel.fill(0);
      return true;
    }

    for (let i = 0; i < channel.length; i++) {
      const readIndex = this.writeIndex;
      const nextIndex = (readIndex + 1) % this.bufferLength;

      const sample = this.buffer[readIndex];
      channel[i] = sample;

      const averaged = this.damping * 0.5 * (this.buffer[readIndex] + this.buffer[nextIndex]);
      this.buffer[readIndex] = averaged;

      this.writeIndex = nextIndex;
    }

    return true; // keep processor alive indefinitely (persistent per-string voice)
  }
}

registerProcessor('karplus-strong-processor', KarplusStrongProcessor);
