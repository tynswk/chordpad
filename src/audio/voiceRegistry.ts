/**
 * Tracks currently-sounding voices (piano oscillators, guitar Karplus-Strong
 * plucks) so a new pad trigger can cut off whatever was still ringing from
 * the previous one, instead of chords piling up on top of each other.
 */

export interface Voice {
  stop: () => void;
}

let activeVoices: Voice[] = [];

export function registerVoice(voice: Voice): void {
  activeVoices.push(voice);
}

/** Immediately fades out and disconnects every currently tracked voice. */
export function stopAllVoices(): void {
  for (const voice of activeVoices) {
    try {
      voice.stop();
    } catch {
      // Voice may have already finished/disconnected naturally; ignore.
    }
  }
  activeVoices = [];
}
