/**
 * Golf swing whoosh for Mulligan boot splash (addictive v2).
 * Run: node scripts/generate-mulligan-boot-sound.js
 * Output: mobile/assets/mulligan-boot-sound-v2.wav
 *
 * Rollback:
 *   cp assets/sound-archive/mulligan-boot-sound.pre-addictive.wav assets/mulligan-boot-sound.wav
 *   point sounds.ts require back to mulligan-boot-sound.wav
 *   restore generate-mulligan-boot-sound.pre-addictive.js if needed
 */

const fs = require('fs');
const path = require('path');

const TAU = 2 * Math.PI;

/** Keep in sync with MulliganBootSplash MISS_SOUND_AT_MS offset. */
const IMPACT_SEC = 0.26;

function encodeWav(rawFloat, sampleRate = 44100) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const numSamples = rawFloat.length;
  const duration = numSamples / sampleRate;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);

  const tailLen = 0.07;
  const tailStart = duration - tailLen;
  const samples = [];
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let master = 1;
    if (t > tailStart) {
      const x = (duration - t) / tailLen;
      master = x * x;
    }
    let s = Math.tanh(rawFloat[i] * 1.25) * master;
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

/**
 * Clearly snappier than v1: earlier impact, bigger thwack, audible warm “bling” after.
 */
function generateGolfSwing(sampleRate = 44100, duration = 0.58) {
  const numSamples = Math.floor(sampleRate * duration);
  const raw = new Float32Array(numSamples);

  let seed = 424242;
  const noise = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return (seed / 0xffffffff) * 2 - 1;
  };

  let slow = 0;
  let mid = 0;
  let bright = 0;
  let hiss = 0;
  const impact = IMPACT_SEC;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const n = noise();

    let speed = 0;
    if (t < impact) {
      speed = Math.pow(t / impact, 1.85);
    } else {
      speed = Math.exp(-(t - impact) * 11);
    }

    slow += (0.035 + speed * 0.03) * (n - slow);
    mid += (0.12 + speed * 0.1) * (n - mid);
    bright += (0.28 + speed * 0.25) * (n - bright);
    hiss += (0.5 + speed * 0.3) * (n - hiss);

    let env = 0;
    if (t < impact) {
      const x = t / impact;
      env = Math.pow(x, 2.4) * 0.85;
      if (x > 0.45) {
        const surge = (x - 0.45) / 0.55;
        env += Math.pow(surge, 1.2) * 0.5;
      }
    } else if (t < impact + 0.22) {
      env = Math.exp(-(t - impact) * 14) * 0.95;
    }

    let tone;
    if (t < impact) {
      tone = 110 + Math.pow(t / impact, 1.9) * 620;
    } else {
      tone = Math.max(80, 730 - (t - impact) * 1600);
    }

    const flutter = 1 + 0.1 * Math.sin(TAU * (22 + speed * 50) * t);

    let sample = 0;
    sample += slow * env * 0.55 * flutter;
    sample += mid * env * 1.05 * flutter;
    sample += bright * env * (0.32 + speed * 0.3);
    sample += hiss * env * speed * 0.16;
    sample += Math.sin(TAU * tone * t) * env * 0.24;
    sample += Math.sin(TAU * tone * 1.4 * t) * env * 0.09;

    if (t < impact + 0.09) {
      const rumbleEnv = t < impact ? env * 0.75 : Math.exp(-(t - impact) * 18) * 0.45;
      sample += Math.sin(TAU * (52 + speed * 55) * t) * rumbleEnv * 0.34;
      sample += Math.sin(TAU * (88 + speed * 35) * t) * rumbleEnv * 0.16;
    }

    // Bigger thwack — clearly different from the soft original
    if (t >= impact && t < impact + 0.09) {
      const local = t - impact;
      const hitBody = (1 - Math.exp(-local * 700)) * Math.exp(-local * 38);
      const hitClick = Math.exp(-local * 180) * (1 - Math.exp(-local * 1400));
      sample += Math.sin(TAU * 160 * t) * hitBody * 0.9;
      sample += Math.sin(TAU * 270 * t) * hitBody * 0.48;
      sample += Math.sin(TAU * 400 * t) * hitBody * 0.18;
      sample += mid * hitClick * 0.5;
    }

    // Audible warm reward bling (major third) — the “addictive” hook
    const stingStart = impact + 0.04;
    if (t >= stingStart && t < stingStart + 0.28) {
      const local = t - stingStart;
      const stingEnv = (1 - Math.exp(-local * 70)) * Math.exp(-local * 9) * 0.28;
      sample += Math.sin(TAU * 392.0 * t) * stingEnv;
      sample += Math.sin(TAU * 493.88 * t) * stingEnv * 0.85;
      sample += Math.sin(TAU * 587.33 * t) * stingEnv * 0.25;
    }

    if (t > impact + 0.012 && t < impact + 0.2) {
      const local = t - (impact + 0.012);
      const flight = Math.exp(-local * 10) * 0.08;
      sample += slow * flight;
    }

    raw[i] = sample;
  }

  let peak = 0;
  for (let i = 0; i < numSamples; i++) peak = Math.max(peak, Math.abs(raw[i]));
  const gain = peak > 0 ? 0.92 / peak : 1;
  for (let i = 0; i < numSamples; i++) raw[i] *= gain;

  return encodeWav(raw, sampleRate);
}

const assetsDir = path.join(__dirname, '../assets');
const wav = generateGolfSwing();
const mobilePath = path.join(assetsDir, 'mulligan-boot-sound-v2.wav');
fs.writeFileSync(mobilePath, wav);
console.log('✅ Mulligan boot sound →', mobilePath);
console.log(`   Impact at ${IMPACT_SEC}s`);
