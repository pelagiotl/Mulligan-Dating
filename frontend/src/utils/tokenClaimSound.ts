/**
 * Warm ascending refill chime when monthly tokens are claimed (web).
 * Unlock on the claim button pointerdown so playback works after the async API call.
 */

let claimAudio: HTMLAudioElement | null = null;

export function tokenClaimSoundPublicUrl(): string {
  const base = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  // v2 filename busts browser cache vs the old cha-ching asset
  return `${base}token-claim-sound-v2.wav`;
}

function getClaimAudio(): HTMLAudioElement {
  if (!claimAudio) {
    claimAudio = new Audio(tokenClaimSoundPublicUrl());
    claimAudio.preload = "auto";
    claimAudio.load();
  }
  return claimAudio;
}

/** Call on claim button pointerdown before the async claim request. */
export function unlockTokenClaimAudio(): void {
  if (typeof window === "undefined") return;
  const audio = getClaimAudio();
  const previousVolume = audio.volume;
  audio.muted = true;
  audio.volume = 0;
  void audio
    .play()
    .then(() => {
      audio.pause();
      audio.currentTime = 0;
      audio.muted = false;
      audio.volume = previousVolume > 0 ? previousVolume : 0.5;
    })
    .catch(() => {
      audio.muted = false;
      audio.volume = previousVolume > 0 ? previousVolume : 0.5;
    });
}

/** Fallback if the wav fails — soft ascending major cascade. */
function playSyntheticRefillChime(): void {
  try {
    const ctx = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    void ctx.resume().catch(() => {});

    const notes = [
      { freq: 392.0, at: 0.02, dur: 0.28, gain: 0.22 },
      { freq: 523.25, at: 0.12, dur: 0.3, gain: 0.24 },
      { freq: 659.25, at: 0.235, dur: 0.34, gain: 0.26 },
      { freq: 783.99, at: 0.36, dur: 0.36, gain: 0.2 },
    ];

    for (const note of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = note.freq;
      const t0 = ctx.currentTime + note.at;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(note.gain, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + note.dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + note.dur + 0.02);
    }
  } catch {
    /* autoplay blocked */
  }
}

export function playTokenClaimSound(volume = 0.5): void {
  if (typeof window === "undefined") return;

  const audio = getClaimAudio();
  audio.pause();
  audio.currentTime = 0;
  audio.muted = false;
  audio.volume = volume;

  void audio.play().catch(() => {
    playSyntheticRefillChime();
  });
}
