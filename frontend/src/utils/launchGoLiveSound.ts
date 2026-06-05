/**
 * Staggered firework pops when Mulligan goes live (web).
 */

let lastPlayedAt = 0;
const COOLDOWN_MS = 4000;

function ensureAudioContext(): AudioContext {
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  return new Ctx();
}

function playPop(ctx: AudioContext, startAt: number, baseHz: number, gainPeak: number): void {
  const duration = 0.55;
  const sampleRate = ctx.sampleRate;
  const frameCount = Math.floor(sampleRate * duration);
  const buffer = ctx.createBuffer(1, frameCount, sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < frameCount; i++) {
    const t = i / sampleRate;
    const env = Math.exp(-t * 9);
    const crack = (Math.random() * 2 - 1) * Math.exp(-t * 40) * 0.35;
    const tone =
      Math.sin(2 * Math.PI * baseHz * t) * 0.22 +
      Math.sin(2 * Math.PI * (baseHz * 1.5) * t) * 0.12;
    data[i] = (crack + tone) * env;
  }

  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  source.buffer = buffer;
  gain.gain.setValueAtTime(gainPeak, startAt);
  gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
  source.connect(gain);
  gain.connect(ctx.destination);
  source.start(startAt);
  source.stop(startAt + duration);
}

export function playLaunchGoLiveSound(): void {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (now - lastPlayedAt < COOLDOWN_MS) return;
  lastPlayedAt = now;

  try {
    const ctx = ensureAudioContext();
    void ctx.resume().catch(() => {});
    const t0 = ctx.currentTime + 0.05;
    const pops = [
      { at: 0, hz: 520, gain: 0.42 },
      { at: 0.22, hz: 680, gain: 0.38 },
      { at: 0.45, hz: 440, gain: 0.5 },
      { at: 0.72, hz: 820, gain: 0.35 },
      { at: 0.95, hz: 560, gain: 0.4 },
    ];
    for (const pop of pops) {
      playPop(ctx, t0 + pop.at, pop.hz, pop.gain);
    }
  } catch {
    /* autoplay blocked */
  }
}
