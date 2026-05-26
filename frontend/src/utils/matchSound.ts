/**
 * Match celebration / notification audio for the web app.
 * Browsers block delayed playback unless audio was unlocked during a user gesture.
 */

export function matchSoundPublicUrl(): string {
  const base = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  return `${base}match-sound.wav`;
}

let preloadedAudio: HTMLAudioElement | null = null;
let audioContext: AudioContext | null = null;

function ensureAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  }
  return audioContext;
}

function getPreloadedAudio(): HTMLAudioElement {
  if (!preloadedAudio) {
    preloadedAudio = new Audio(matchSoundPublicUrl());
    preloadedAudio.preload = "auto";
    preloadedAudio.load();
  }
  return preloadedAudio;
}

/** Call on Connect / any tap so delayed celebration playback is allowed (~7s reveal). */
export function unlockMatchAudio(): void {
  if (typeof window === "undefined") return;

  void ensureAudioContext().resume().catch(() => {});

  const audio = getPreloadedAudio();
  const previousVolume = audio.volume;
  audio.volume = 0.001;
  void audio
    .play()
    .then(() => {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = previousVolume > 0 ? previousVolume : 0.55;
    })
    .catch(() => {
      audio.volume = previousVolume > 0 ? previousVolume : 0.55;
    });
}

/** One-time unlock on first interaction after login (helps socket toast for User B). */
export function installMatchAudioUnlockOnFirstGesture(): () => void {
  if (typeof document === "undefined") return () => {};

  const onGesture = () => {
    unlockMatchAudio();
    document.removeEventListener("pointerdown", onGesture, true);
    document.removeEventListener("keydown", onGesture, true);
  };

  document.addEventListener("pointerdown", onGesture, { capture: true });
  document.addEventListener("keydown", onGesture, { capture: true });

  return () => {
    document.removeEventListener("pointerdown", onGesture, true);
    document.removeEventListener("keydown", onGesture, true);
  };
}

function playSyntheticMatchSound(): void {
  try {
    const ctx = ensureAudioContext();
    void ctx.resume().catch(() => {});

    const duration = 0.6;
    const sampleRate = ctx.sampleRate;
    const frameCount = sampleRate * duration;
    const buffer = ctx.createBuffer(1, frameCount, sampleRate);
    const data = buffer.getChannelData(0);
    const frequencies = [523.25, 659.25, 783.99];
    for (let freq = 0; freq < frequencies.length; freq++) {
      const frequency = frequencies[freq];
      for (let i = 0; i < frameCount; i++) {
        const t = i / sampleRate;
        const delay = freq * 0.1;
        const envelope = Math.exp(-t * 2) * (1 - Math.min(t / 0.3, 1));
        const phase = 2 * Math.PI * frequency * Math.max(0, t - delay);
        const wave =
          Math.sin(phase) * 0.5 + Math.sin(phase * 2) * 0.3 + Math.sin(phase * 3) * 0.2;
        if (t >= delay) {
          data[i] += wave * envelope * 0.15;
        }
      }
    }
    const source = ctx.createBufferSource();
    const gainNode = ctx.createGain();
    source.buffer = buffer;
    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    source.start();
    source.stop(ctx.currentTime + duration);
  } catch {
    /* autoplay blocked or Web Audio unavailable */
  }
}

export function playMatchSound(volume = 0.45): void {
  if (typeof window === "undefined") return;

  const audio = getPreloadedAudio();
  audio.volume = volume;
  audio.currentTime = 0;

  void ensureAudioContext()
    .resume()
    .catch(() => {})
    .then(() => audio.play())
    .catch(() => {
      playSyntheticMatchSound();
    });
}

/** Same asset as mobile `match-sound.wav`; used when celebration card is revealed. */
export function playMatchCelebrationSound(): void {
  playMatchSound(0.55);
}
