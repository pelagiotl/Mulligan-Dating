export type LaunchFireworkBurstSpec = {
  leftPct: number;
  topPct: number;
  delayMs: number;
  particleCount: number;
  hues: string[];
};

export type LaunchRocketSpec = {
  leftPct: number;
  delayMs: number;
  explodeAtPct: number;
};

export type LaunchFloaterSpec = {
  leftPct: number;
  emoji: string;
  delayMs: number;
  durationMs: number;
  sizePx: number;
};

const BURST_HUES = ["#f472b6", "#a78bfa", "#c4b5fd", "#fbbf24", "#fb7185", "#e879f9"];

export const LAUNCH_FIREWORK_BURSTS: LaunchFireworkBurstSpec[] = [
  { leftPct: 8, topPct: 14, delayMs: 0, particleCount: 18, hues: BURST_HUES },
  { leftPct: 78, topPct: 10, delayMs: 280, particleCount: 20, hues: BURST_HUES },
  { leftPct: 42, topPct: 8, delayMs: 520, particleCount: 22, hues: BURST_HUES },
  { leftPct: 22, topPct: 28, delayMs: 760, particleCount: 16, hues: BURST_HUES },
  { leftPct: 88, topPct: 32, delayMs: 1040, particleCount: 18, hues: BURST_HUES },
  { leftPct: 55, topPct: 22, delayMs: 1320, particleCount: 24, hues: BURST_HUES },
  { leftPct: 12, topPct: 48, delayMs: 1580, particleCount: 16, hues: BURST_HUES },
  { leftPct: 68, topPct: 44, delayMs: 1860, particleCount: 20, hues: BURST_HUES },
  { leftPct: 35, topPct: 38, delayMs: 2140, particleCount: 18, hues: BURST_HUES },
  { leftPct: 92, topPct: 18, delayMs: 2420, particleCount: 14, hues: BURST_HUES },
  { leftPct: 48, topPct: 52, delayMs: 2700, particleCount: 22, hues: BURST_HUES },
  { leftPct: 18, topPct: 62, delayMs: 2980, particleCount: 16, hues: BURST_HUES },
];

export const LAUNCH_ROCKETS: LaunchRocketSpec[] = [
  { leftPct: 6, delayMs: 120, explodeAtPct: 38 },
  { leftPct: 24, delayMs: 480, explodeAtPct: 32 },
  { leftPct: 44, delayMs: 860, explodeAtPct: 42 },
  { leftPct: 62, delayMs: 1240, explodeAtPct: 36 },
  { leftPct: 80, delayMs: 1620, explodeAtPct: 40 },
  { leftPct: 92, delayMs: 2000, explodeAtPct: 34 },
];

export const LAUNCH_FLOATERS: LaunchFloaterSpec[] = [
  { leftPct: 10, emoji: "🎆", delayMs: 0, durationMs: 4200, sizePx: 28 },
  { leftPct: 28, emoji: "🧨", delayMs: 600, durationMs: 3800, sizePx: 26 },
  { leftPct: 52, emoji: "🎇", delayMs: 300, durationMs: 4500, sizePx: 30 },
  { leftPct: 72, emoji: "💥", delayMs: 900, durationMs: 3600, sizePx: 32 },
  { leftPct: 88, emoji: "✨", delayMs: 150, durationMs: 4000, sizePx: 24 },
  { leftPct: 38, emoji: "🚀", delayMs: 1100, durationMs: 4300, sizePx: 28 },
  { leftPct: 64, emoji: "🎆", delayMs: 1400, durationMs: 3900, sizePx: 26 },
];

export function buildBurstParticles(count: number, hues: string[]): Array<{
  tx: number;
  ty: number;
  color: string;
  size: number;
  delayMs: number;
}> {
  const particles: Array<{ tx: number; ty: number; color: string; size: number; delayMs: number }> =
    [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
    const dist = 52 + Math.random() * 88;
    particles.push({
      tx: Math.cos(angle) * dist,
      ty: Math.sin(angle) * dist,
      color: hues[i % hues.length],
      size: 4 + Math.random() * 5,
      delayMs: Math.random() * 80,
    });
  }
  return particles;
}
