/**
 * Mulligan boot splash SFX — addictive “reward” sting (golf nod + celebration).
 * Inspired by short dating-app match celebrations: whoosh → hit → ascending sparkle.
 *
 * Run: node scripts/generate-mulligan-boot-sound.js
 * Output: mobile/assets/mulligan-boot-sound-v3.wav
 *
 * Rollback options:
 *   v2: assets/sound-archive/mulligan-boot-sound-v2.wav
 *   pre: assets/sound-archive/mulligan-boot-sound.pre-addictive.wav
 */

const fs = require('fs');
const path = require('path');

const TAU = 2 * Math.PI;

/** Peak of the reward (sync splash timing to this). */
const REWARD_PEAK_SEC = 0.34;

function encodeWav(rawFloat, sampleRate = 44100) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const numSamples = rawFloat.length;
  const duration = numSamples / sampleRate;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);

  const tailLen = 0.12;
  const tailStart = duration - tailLen;
  const samples = [];
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let master = 1;
    if (t > tailStart) {
      const x = (duration - t) / tailLen;
      master = x * x;
    }
    let s = Math.tanh(rawFloat[i] * 1.18) * master;
    s = Math.max(-1, Math.min(1, s));
    const int16 = Math.floor(s * 32767);
    samples.push(int16 & 0xff);
    samples.push((int16 >> 8) & 0xff);
  }

  const header = Buffer.alloc(44);
  let o = 0;
  header.write('RIFF', o); o += 4;
  header.writeUInt32LE(36 + samples.length, o); o += 4;
  header.write('WAVE', o); o += 4;
  header.write('fmt ', o); o += 4;
  header.writeUInt32LE(16, o); o += 4;
  header.writeUInt16LE(1, o); o += 2;
  header.writeUInt16LE(numChannels, o); o += 2;
  header.writeUInt32LE(sampleRate, o); o += 4;
  header.writeUInt32LE(byteRate, o); o += 4;
  header.writeUInt16LE(blockAlign, o); o += 2;
  header.writeUInt16LE(bitsPerSample, o); o += 2;
  header.write('data', o); o += 4;
  header.writeUInt32LE(samples.length, o); o += 4;

  return Buffer.concat([header, Buffer.from(samples)]);
}

function softReverb(raw, sampleRate) {
  const d1 = Math.floor(0.022 * sampleRate);
  const d2 = Math.floor(0.031 * sampleRate);
  const buf1 = new Float32Array(d1);
  const buf2 = new Float32Array(d2);
  let i1 = 0;
  let i2 = 0;
  const out = new Float32Array(raw.length);
  const g = 0.32;
  const wet = 0.18;
  for (let i = 0; i < raw.length; i++) {
    const x = raw[i];
    const r1 = buf1[i1];
    const r2 = buf2[i2];
    buf1[i1] = x + g * r1;
    buf2[i2] = x + g * r2;
    i1 = (i1 + 1) % d1;
    i2 = (i2 + 1) % d2;
    out[i] = (1 - wet) * x + wet * ((r1 + r2) * 0.5);
  }
  return out;
}

/**
 * Brief golf whoosh → soft thwack → ascending celebration sparkle.
 * Built to feel rewarding on every cold start (Tinder-match energy, Mulligan DNA).
 */
function generateBootReward(sampleRate = 44100, duration = 0.82) {
  const numSamples = Math.floor(sampleRate * duration);
  const raw = new Float32Array(numSamples);

  let seed = 777001;
  const noise = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return (seed / 0xffffffff) * 2 - 1;
  };

  let slow = 0;
  let mid = 0;
  let bright = 0;

  const impact = 0.2;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const n = noise();

    let speed = t < impact ? Math.pow(t / impact, 1.7) : Math.exp(-(t - impact) * 10);
    slow += (0.04 + speed * 0.03) * (n - slow);
    mid += (0.14 + speed * 0.1) * (n - mid);
    bright += (0.32 + speed * 0.25) * (n - bright);

    let sample = 0;

    // 1) Short addictive whoosh into the hit
    let whoosh = 0;
    if (t < impact + 0.12) {
      const x = Math.min(1, t / impact);
      const env =
        t < impact
          ? Math.pow(x, 2.2) * 0.7 + (x > 0.5 ? Math.pow((x - 0.5) / 0.5, 1.3) * 0.45 : 0)
          : Math.exp(-(t - impact) * 14) * 0.55;
      const tone = 120 + Math.pow(Math.min(1, t / impact), 1.8) * 580;
      whoosh += slow * env * 0.55;
      whoosh += mid * env * 0.95;
      whoosh += bright * env * speed * 0.35;
      whoosh += Math.sin(TAU * tone * t) * env * 0.2;
      sample += whoosh;
    }

    // 2) Soft satisfying body hit (not metallic)
    if (t >= impact && t < impact + 0.08) {
      const local = t - impact;
      const hit = (1 - Math.exp(-local * 650)) * Math.exp(-local * 40);
      sample += Math.sin(TAU * 150 * t) * hit * 0.55;
      sample += Math.sin(TAU * 240 * t) * hit * 0.28;
      sample += mid * Math.exp(-local * 160) * 0.25;
    }

    // 3) Ascending celebration — the dopamine (C5 → E5 → G5)
    // Staggered like a tiny match fanfare; warm + slightly detuned for organic feel
    const notes = [
      { f: 523.25, start: impact + 0.05, len: 0.32, amp: 0.34 },
      { f: 659.25, start: impact + 0.12, len: 0.34, amp: 0.3 },
      { f: 783.99, start: impact + 0.19, len: 0.38, amp: 0.26 },
    ];
    for (const note of notes) {
      if (t >= note.start && t < note.start + note.len) {
        const local = t - note.start;
        const env =
          (1 - Math.exp(-local * 55)) * Math.exp(-local * 5.5) * note.amp;
        const detune = note.f * 1.003;
        sample += Math.sin(TAU * note.f * t) * env;
        sample += Math.sin(TAU * detune * t) * env * 0.35;
        sample += Math.sin(TAU * note.f * 2 * t) * env * 0.08;
      }
    }

    // 4) Soft shimmer / sparkle dust on top of the resolve
    const shimmerStart = impact + 0.22;
    if (t >= shimmerStart && t < shimmerStart + 0.4) {
      const local = t - shimmerStart;
      const env = Math.exp(-local * 6) * (1 - Math.exp(-local * 40)) * 0.1;
      sample += Math.sin(TAU * 1046.5 * t) * env;
      sample += bright * env * 0.45;
    }

    // 5) Low “warmth” under the celebration so it feels premium on phone speakers
    if (t >= impact && t < impact + 0.45) {
      const local = t - impact;
      const env = Math.exp(-local * 4.5) * (1 - Math.exp(-local * 30)) * 0.22;
      sample += Math.sin(TAU * 82 * t) * env;
      sample += Math.sin(TAU * 110 * t) * env * 0.4;
    }

    raw[i] = sample;
  }

  const wet = softReverb(raw, sampleRate);

  let peak = 0;
  for (let i = 0; i < wet.length; i++) peak = Math.max(peak, Math.abs(wet[i]));
  const gain = peak > 0 ? 0.9 / peak : 1;
  for (let i = 0; i < wet.length; i++) wet[i] *= gain;

  return encodeWav(wet, sampleRate);
}

const assetsDir = path.join(__dirname, '../assets');
const wav = generateBootReward();
const mobilePath = path.join(assetsDir, 'mulligan-boot-sound-v3.wav');
fs.writeFileSync(mobilePath, wav);
console.log('✅ Mulligan boot sound →', mobilePath);
console.log(`   Reward peak ~${REWARD_PEAK_SEC}s`);
