/**
 * ARCHIVE — Mulligan boot splash SFX v6 — whoosh only.
 * Active generator is generate-mulligan-boot-sound.js (v7).
 *
 * Restore:
 *   cp assets/sound-archive/mulligan-boot-sound-v6.wav assets/mulligan-boot-sound-v6.wav
 *   point sounds.ts require to mulligan-boot-sound-v6.wav
 */

const fs = require('fs');
const path = require('path');

const TAU = 2 * Math.PI;

/** Whoosh crest (sync splash timing to this). */
const REWARD_PEAK_SEC = 0.22;

function encodeWav(rawFloat, sampleRate = 44100) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const numSamples = rawFloat.length;
  const duration = numSamples / sampleRate;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);

  const tailLen = 0.1;
  const tailStart = duration - tailLen;
  const samples = [];
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let master = 1;
    if (t > tailStart) {
      const x = (duration - t) / tailLen;
      master = x * x;
    }
    let s = Math.tanh(rawFloat[i] * 1.12) * master;
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
  const d1 = Math.floor(0.02 * sampleRate);
  const d2 = Math.floor(0.028 * sampleRate);
  const buf1 = new Float32Array(d1);
  const buf2 = new Float32Array(d2);
  let i1 = 0;
  let i2 = 0;
  const out = new Float32Array(raw.length);
  const g = 0.26;
  const wet = 0.12;
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
 * Pure golf whoosh — crest at REWARD_PEAK_SEC, then soft decay.
 */
function generateBootReward(sampleRate = 44100, duration = 0.48) {
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

  const crest = REWARD_PEAK_SEC;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const n = noise();

    let speed = t < crest ? Math.pow(t / crest, 1.65) : Math.exp(-(t - crest) * 8);
    slow += (0.04 + speed * 0.03) * (n - slow);
    mid += (0.14 + speed * 0.1) * (n - mid);
    bright += (0.3 + speed * 0.22) * (n - bright);

    let sample = 0;

    if (t < crest + 0.22) {
      const x = Math.min(1, t / crest);
      const env =
        t < crest
          ? Math.pow(x, 2.1) * 0.75 + (x > 0.45 ? Math.pow((x - 0.45) / 0.55, 1.25) * 0.5 : 0)
          : Math.exp(-(t - crest) * 9) * 0.72;
      // Low body only — no bright ascending pitch or hit
      const tone = 100 + Math.pow(Math.min(1, t / crest), 1.7) * 180;
      sample += slow * env * 0.65;
      sample += mid * env * 1.15;
      sample += bright * env * speed * 0.32;
      sample += Math.sin(TAU * tone * t) * env * 0.1;
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
const mobilePath = path.join(assetsDir, 'mulligan-boot-sound-v6.wav');
fs.writeFileSync(mobilePath, wav);
fs.writeFileSync(path.join(assetsDir, 'mulligan-boot-sound.wav'), wav);
console.log('✅ Mulligan boot sound →', mobilePath);
console.log(`   Whoosh crest ~${REWARD_PEAK_SEC}s`);
console.log('   Rollback: sound-archive/mulligan-boot-sound-v5.wav + sounds.ts → v5');
