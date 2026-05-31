/**
 * Cash-register "cha-ching" when weekly tokens are claimed (web).
 * Unlock on the claim button pointerdown so playback works after the async API call.
 */

let claimAudio: HTMLAudioElement | null = null;

export function tokenClaimSoundPublicUrl(): string {
  const base = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  return `${base}token-claim-sound.wav`;
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

function playSyntheticChaChing(): void {
  try {
    const ctx = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    void ctx.resume().catch(() => {});

    const duration = 0.36;
    const sampleRate = ctx.sampleRate;
    const frameCount = Math.floor(sampleRate * duration);
    const buffer = ctx.createBuffer(1, frameCount, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < frameCount; i++) {
      const t = i / sampleRate;
      let s = 0;
      if (t < 0.03) s += (Math.random() * 2 - 1) * Math.exp(-t * 100) * 0.15;
      if (t >= 0.05 && t < 0.14) {
        const local = t - 0.05;
        s += Math.sin(2 * Math.PI * 988 * t) * Math.exp(-local * 25) * 0.25;
      }
      if (t >= 0.1 && t < 0.34) {
        const local = t - 0.1;
        s +=
          (Math.sin(2 * Math.PI * 1568 * t) + Math.sin(2 * Math.PI * 1976 * t) * 0.85) *
          Math.exp(-local * 10) *
          0.3;
      }
      data[i] = s;
    }

    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    source.buffer = buffer;
    gain.gain.setValueAtTime(0.45, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start();
    source.stop(ctx.currentTime + duration);
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
    playSyntheticChaChing();
  });
}
