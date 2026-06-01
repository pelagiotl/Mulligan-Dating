/**
 * Match celebration / notification audio for the web app.
 * Browsers block delayed playback unless audio was unlocked during a user gesture.
 */

export function matchSoundPublicUrl(): string {
  return assetPublicUrl("match-sound.wav");
}

export function messageSoundPublicUrl(): string {
  return assetPublicUrl("message-sound.mp3");
}

/** Playback instance — primed on unlock, used for celebrations. */
let celebrationAudio: HTMLAudioElement | null = null;
let messageAudio: HTMLAudioElement | null = null;
let audioContext: AudioContext | null = null;
let suppressMatchSoundUntil = 0;
let lastCelebrationPlayedAt = 0;
let lastMessagePlayedAt = 0;

const CELEBRATION_COOLDOWN_MS = 3000;
const MESSAGE_SOUND_COOLDOWN_MS = 1500;

function assetPublicUrl(filename: string): string {
  const base = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  return `${base}${filename}`;
}

/** Skip match audio briefly after login / session restore (not live Connect celebrations). */
export function suppressMatchSoundFor(ms: number): void {
  suppressMatchSoundUntil = Date.now() + ms;
}

function isMatchSoundSuppressed(): boolean {
  return Date.now() < suppressMatchSoundUntil;
}

function ensureAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  }
  return audioContext;
}

function getCelebrationAudio(): HTMLAudioElement {
  if (!celebrationAudio) {
    celebrationAudio = new Audio(matchSoundPublicUrl());
    celebrationAudio.preload = "auto";
    celebrationAudio.load();
  }
  return celebrationAudio;
}

/** Inaudible Web Audio tick — unlocks autoplay without playing match-sound.wav. */
function playSilentUnlockTick(): void {
  try {
    const ctx = ensureAudioContext();
    const buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start();
    source.stop(ctx.currentTime + 0.001);
  } catch {
    /* ignore */
  }
}

/** Call on Connect / Complete Profile tap so delayed celebration playback is allowed. */
export function unlockMatchAudio(): void {
  if (typeof window === "undefined") return;

  clearMatchSoundSuppression();
  void ensureAudioContext().resume().catch(() => {});
  playSilentUnlockTick();

  const audio = getCelebrationAudio();
  const previousVolume = audio.volume;
  audio.muted = true;
  audio.volume = 0;
  void audio
    .play()
    .then(() => {
      audio.pause();
      audio.currentTime = 0;
      audio.muted = false;
      audio.volume = previousVolume > 0 ? previousVolume : 0.55;
    })
    .catch(() => {
      audio.muted = false;
      audio.volume = previousVolume > 0 ? previousVolume : 0.55;
    });
}

function clearMatchSoundSuppression(): void {
  suppressMatchSoundUntil = 0;
}

function playSyntheticMatchSound(): void {
  if (isMatchSoundSuppressed()) return;
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
  if (isMatchSoundSuppressed()) return;

  const audio = getCelebrationAudio();
  audio.pause();
  audio.currentTime = 0;
  audio.muted = false;
  audio.volume = volume;

  void ensureAudioContext()
    .resume()
    .catch(() => {})
    .then(() => audio.play())
    .catch(() => {
      playSyntheticMatchSound();
    });
}

/** Same asset as mobile `match-sound.wav`; deduped to avoid double fire on profile complete. */
export function playMatchCelebrationSound(): void {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (now - lastCelebrationPlayedAt < CELEBRATION_COOLDOWN_MS) return;
  lastCelebrationPlayedAt = now;
  clearMatchSoundSuppression();
  playMatchSound(0.55);
}

function getMessageAudio(): HTMLAudioElement {
  if (!messageAudio) {
    messageAudio = new Audio(messageSoundPublicUrl());
    messageAudio.preload = "auto";
    messageAudio.load();
  }
  return messageAudio;
}

function playSyntheticMessageChime(): void {
  try {
    const ctx = ensureAudioContext();
    void ctx.resume().catch(() => {});
    const duration = 0.12;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch {
    /* autoplay blocked */
  }
}

/** New message alert — bundled message-sound.mp3 when available (in-app or background tab via SW). */
export function playMessageNotificationSound(): void {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (now - lastMessagePlayedAt < MESSAGE_SOUND_COOLDOWN_MS) return;
  lastMessagePlayedAt = now;

  const audio = getMessageAudio();
  audio.pause();
  audio.currentTime = 0;
  audio.muted = false;
  audio.volume = 0.5;

  void ensureAudioContext()
    .resume()
    .catch(() => {})
    .then(() => audio.play())
    .catch(() => {
      playSyntheticMessageChime();
    });
}

/** Short chime for in-app new message toasts (visible tab). */
export function playMessageChime(): void {
  playMessageNotificationSound();
}
