/**
 * Mulligan boot splash SFX v8 — whoosh → ascending bell chime (G4 → D5 → G5).
 * Crest still lands on “Just missed…”; the rising bells are the mulligan payoff.
 *
 * Run: node scripts/generate-mulligan-boot-sound.js
 * Output: mobile/assets/mulligan-boot-sound-v8.wav
 *
 * Rollback to v7 (single soft chime):
 *   cp assets/sound-archive/mulligan-boot-sound-v7.wav assets/mulligan-boot-sound-v7.wav
 *   point sounds.ts require back to mulligan-boot-sound-v7.wav
 *   (generator backup: scripts/generate-mulligan-boot-sound.v7.js)
 *
 * Older rollbacks:
 *   v6: assets/sound-archive/mulligan-boot-sound-v6.wav (whoosh only)
 *   v5: assets/sound-archive/mulligan-boot-sound-v5.wav
 *   v4: assets/sound-archive/mulligan-boot-sound-v4.wav
 *   v3: assets/sound-archive/mulligan-boot-sound-v3.wav
 *   v2: assets/sound-archive/mulligan-boot-sound-v2.wav
 *   pre: assets/sound-archive/mulligan-boot-sound.pre-addictive.wav
 */

const fs = require('fs');
const path = require('path');

const TAU = 2 * Math.PI;

/** Whoosh crest (sync splash timing to this). */
const REWARD_PEAK_SEC = 0.22;

/**
 * Rising G-major arpeggio after the whoosh decay.
 * Ascending pitch + shortening gaps reads as "reward" without a game-y jingle.
 */
const CHIME_NOTES = [
  { at: 0.3, freq: 392.0, gain: 0.5, decay: 8.5 }, // G4
  { at: 0.4, freq: 587.33, gain: 0.56, decay: 7.0 }, // D5
  { at: 0.485, freq: 783.99, gain: 0.36, decay: 6.0 }, // G5
];

/** Inharmonic bell partials: higher ones fade faster, like struck metal. */
const BELL_PARTIALS = [
  { mult: 1, gain: 1, decay: 1 },
  { mult: 2.01, gain: 0.42, decay: 1.7 },
  { mult: 2.76, gain: 0.22, decay: 2.5 },
  { mult: 4.07, gain: 0.1, decay: 3.4 },
];

function encodeWav(rawFloat, sampleRate = 44100) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const numSamples = rawFloat.length;
  const duration = numSamples / sampleRate;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);

  const tailLen = 0.16;
  const tailStart = duration - tailLen;
  const samples = [];
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let master = 1;
    if (t > tailStart) {
      const x = (duration - t) / tailLen;
      master = x * x;
    }
    let s = Math.tanh(rawFloat[i] * 1.1) * master;
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

/** Longer bloom than v7 so the bells ring into the app instead of stopping dead. */
function softReverb(raw, sampleRate) {
  const taps = [0.023, 0.031, 0.047, 0.061];
  const bufs = taps.map((d) => new Float32Array(Math.floor(d * sampleRate)));
  const idx = taps.map(() => 0);
  const out = new Float32Array(raw.length);
  const g = 0.36;
  const wet = 0.2;
  for (let i = 0; i < raw.length; i++) {
    const x = raw[i];
    let sum = 0;
    for (let b = 0; b < bufs.length; b++) {
      const buf = bufs[b];
      const r = buf[idx[b]];
      buf[idx[b]] = x + g * r;
      idx[b] = (idx[b] + 1) % buf.length;
      sum += r;
    }
    out[i] = (1 - wet) * x + wet * (sum / bufs.length);
  }
  return out;
}

/** Struck-bell voice with a touch of detune shimmer. */
function bellVoice(t, local, freq, decay) {
  const attack = 1 - Math.exp(-local * 220);
  let sample = 0;
  for (const p of BELL_PARTIALS) {
    const env = attack * Math.exp(-local * decay * p.decay);
    if (env < 0.0005) continue;
    const f = freq * p.mult;
    sample += Math.sin(TAU * f * t) * env * p.gain;
    // Slight detune pair widens the ring without sounding out of tune
    sample += Math.sin(TAU * f * 1.004 * t) * env * p.gain * 0.35;
  }
  return sample;
}

/**
 * Golf whoosh crest + rising bell payoff.
 */
function generateBootReward(sampleRate = 44100, duration = 1.05) {
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
  let air = 0;
  let airPrev = 0;

  const crest = REWARD_PEAK_SEC;
  const sparkleAt = CHIME_NOTES[1].at;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const n = noise();

    const speed = t < crest ? Math.pow(t / crest, 1.65) : Math.exp(-(t - crest) * 8);
    slow += (0.04 + speed * 0.03) * (n - slow);
    mid += (0.14 + speed * 0.1) * (n - mid);
    bright += (0.3 + speed * 0.22) * (n - bright);

    let sample = 0;

    // 1) Whoosh — crest on “Just missed…”
    if (t < crest + 0.22) {
      const x = Math.min(1, t / crest);
      const env =
        t < crest
          ? Math.pow(x, 2.1) * 0.75 + (x > 0.45 ? Math.pow((x - 0.45) / 0.55, 1.25) * 0.5 : 0)
          : Math.exp(-(t - crest) * 9) * 0.72;
      const tone = 100 + Math.pow(Math.min(1, t / crest), 1.7) * 180;
      sample += slow * env * 0.65;
      sample += mid * env * 1.15;
      sample += bright * env * speed * 0.32;
      sample += Math.sin(TAU * tone * t) * env * 0.1;
    }

    // 2) Rising bell arpeggio — the payoff
    let chime = 0;
    for (const note of CHIME_NOTES) {
      if (t < note.at) continue;
      const local = t - note.at;
      chime += bellVoice(t, local, note.freq, note.decay) * note.gain;
    }
    sample += chime * 0.32;

    // 3) Breath of air over the middle bell so the ring feels lit, not synthetic
    if (t >= sparkleAt && t < sparkleAt + 0.3) {
      const local = t - sparkleAt;
      air += 0.55 * (n - air);
      const hp = air - airPrev;
      airPrev = air;
      const env = (1 - Math.exp(-local * 120)) * Math.exp(-local * 16);
      sample += hp * env * 0.14;
    }

    // 4) Warm low pad under the bells — keeps the tail from feeling thin
    if (t >= CHIME_NOTES[0].at) {
      const local = t - CHIME_NOTES[0].at;
      const env = (1 - Math.exp(-local * 40)) * Math.exp(-local * 5.5) * 0.075;
      sample += Math.sin(TAU * 196 * t) * env;
      sample += Math.sin(TAU * 98 * t) * env * 0.5;
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
const mobilePath = path.join(assetsDir, 'mulligan-boot-sound-v8.wav');
fs.writeFileSync(mobilePath, wav);
fs.writeFileSync(path.join(assetsDir, 'mulligan-boot-sound.wav'), wav);
console.log('✅ Mulligan boot sound →', mobilePath);
console.log(`   Whoosh crest ~${REWARD_PEAK_SEC}s`);
console.log(`   Bells: ${CHIME_NOTES.map((c) => `${c.at}s`).join(' → ')} (G4 → D5 → G5)`);
console.log('   Rollback: sound-archive/mulligan-boot-sound-v7.wav + sounds.ts → v7');
