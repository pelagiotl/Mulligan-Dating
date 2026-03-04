/**
 * Match celebration sounds — two designs (bass → uptone).
 * Run: node scripts/generate-match-sound.js
 * Output: match-sound.wav (design A), match-sound-b.wav (design B).
 * Use whichever you prefer; rename to match-sound.wav or point the app at the chosen file.
 */

const fs = require('fs');
const path = require('path');

const TAU = 2 * Math.PI;

function encodeWav(rawFloat, sampleRate = 44100) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const numSamples = rawFloat.length;
  const duration = numSamples / sampleRate;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);

  const tailLen = 0.4;
  const tailStart = duration - tailLen;
  const samples = [];
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let master = 1;
    if (t > tailStart) {
      const x = (duration - t) / tailLen;
      master = x * x;
    }
    let sample = Math.max(-1, Math.min(1, rawFloat[i] * master));
    const int16 = Math.floor(sample * 32767);
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

function reverb(raw, sampleRate, combMs = [28, 35], combG = 0.45, wet = 0.22) {
  const numSamples = raw.length;
  const [d1, d2] = combMs.map((ms) => Math.floor((ms / 1000) * sampleRate));
  const buf1 = new Float32Array(d1);
  const buf2 = new Float32Array(d2);
  let i1 = 0, i2 = 0;
  const out = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const x = raw[i];
    const r1 = buf1[i1], r2 = buf2[i2];
    buf1[i1] = x + combG * r1;
    buf2[i2] = x + combG * r2;
    i1 = (i1 + 1) % d1;
    i2 = (i2 + 1) % d2;
    out[i] = (1 - wet) * x + wet * (r1 + r2) / 2;
  }
  return out;
}

// ——— Design A: Bass hit → rising sweep → high resolve ———
function generateDesignA(sampleRate = 44100, duration = 1.8) {
  const numSamples = Math.floor(sampleRate * duration);
  const raw = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let sample = 0;

    const bassFreq = 55;
    const bassLen = 0.35;
    if (t < bassLen) {
      const local = t;
      const attack = 1 - Math.exp(-local * 80);
      const decay = Math.exp(-local * 8);
      const env = attack * decay * 0.65;
      const phase = TAU * bassFreq * t;
      sample += (Math.sin(phase) + 0.25 * Math.sin(2 * phase)) * env;
    }

    const sweepStart = 0.25;
    const sweepEnd = 1.15;
    const sweepT = sweepEnd - sweepStart;
    const f0 = 165;
    const f1 = 330;
    if (t >= sweepStart && t < sweepEnd) {
      const localT = t - sweepStart;
      const phase = TAU * (f0 * localT + (f1 - f0) * localT * localT / (2 * sweepT));
      const swell = 1 - Math.exp(-localT * 6);
      const decay = Math.exp(-localT * 1.8);
      sample += Math.sin(phase) * swell * decay * 0.28;
    }

    const highFreq = 523.25;
    const highStart = 1.0;
    const highLen = 0.35;
    if (t >= highStart && t < highStart + highLen) {
      const local = t - highStart;
      sample += Math.sin(TAU * highFreq * t) * Math.exp(-local * 12) * 0.2;
    }

    raw[i] = Math.max(-1, Math.min(1, sample * 0.85));
  }

  return encodeWav(reverb(raw, sampleRate), sampleRate);
}

// ——— Design B: Deeper bass → two-note “ta-dah” (perfect fifth) → soft shimmer ———
function generateDesignB(sampleRate = 44100, duration = 1.65) {
  const numSamples = Math.floor(sampleRate * duration);
  const raw = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let sample = 0;

    // Deeper bass (42 Hz), rounder and a bit longer
    const bassFreq = 42;
    const bassLen = 0.45;
    if (t < bassLen) {
      const local = t;
      const attack = 1 - Math.exp(-local * 50);
      const decay = Math.exp(-local * 5);
      const env = attack * decay * 0.6;
      const phase = TAU * bassFreq * t;
      sample += (Math.sin(phase) + 0.3 * Math.sin(2 * phase)) * env;
    }

    // First note: C4 (262 Hz), 0.4s – 0.75s
    const note1Freq = 261.63;
    const note1Start = 0.4;
    const note1Len = 0.38;
    if (t >= note1Start && t < note1Start + note1Len) {
      const local = t - note1Start;
      const env = (1 - Math.exp(-local * 30)) * Math.exp(-local * 6) * 0.32;
      sample += Math.sin(TAU * note1Freq * t) * env;
    }

    // Second note: G4 (392 Hz), 0.72s – 1.15s — “resolution” uptone
    const note2Freq = 392;
    const note2Start = 0.72;
    const note2Len = 0.45;
    if (t >= note2Start && t < note2Start + note2Len) {
      const local = t - note2Start;
      const env = (1 - Math.exp(-local * 25)) * Math.exp(-local * 5) * 0.3;
      sample += Math.sin(TAU * note2Freq * t) * env;
    }

    // Soft high shimmer (E5) at the end
    const highFreq = 659.25;
    const highStart = 1.05;
    const highLen = 0.4;
    if (t >= highStart && t < highStart + highLen) {
      const local = t - highStart;
      sample += Math.sin(TAU * highFreq * t) * Math.exp(-local * 10) * 0.12;
    }

    raw[i] = Math.max(-1, Math.min(1, sample * 0.88));
  }

  return encodeWav(reverb(raw, sampleRate, [32, 40], 0.48, 0.26), sampleRate);
}

// ——— Design C: Tinder-style — short, punchy, addictive ———
// Quick thump + bright "ding" (major third) + subtle sparkle tail; minimal reverb
function generateDesignC(sampleRate = 44100, duration = 0.68) {
  const numSamples = Math.floor(sampleRate * duration);
  const raw = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let sample = 0;

    if (t < 0.12) {
      const attack = 1 - Math.exp(-t * 140);
      const decay = Math.exp(-t * 22);
      const phase = TAU * 65 * t;
      sample += (Math.sin(phase) + 0.18 * Math.sin(2 * phase)) * attack * decay * 0.52;
    }

    const c5 = 523.25;
    const e5 = 659.25;
    const dingStart = 0.05;
    const dingLen = 0.58;
    if (t >= dingStart && t < dingStart + dingLen) {
      const local = t - dingStart;
      const attack = 1 - Math.exp(-local * 90);
      const decay = Math.exp(-local * 6.2);
      const env = attack * decay * 0.4;
      sample += Math.sin(TAU * c5 * t) * env;
      sample += Math.sin(TAU * e5 * t) * env;
    }

    const g5 = 783.99;
    const sparkStart = 0.18;
    const sparkLen = 0.28;
    if (t >= sparkStart && t < sparkStart + sparkLen) {
      const local = t - sparkStart;
      sample += Math.sin(TAU * g5 * t) * Math.exp(-local * 16) * 0.11;
    }

    raw[i] = Math.max(-1, Math.min(1, sample * 0.9));
  }

  return encodeWav(reverb(raw, sampleRate, [18, 24], 0.35, 0.14), sampleRate);
}

// ——— Design D: Two ascending chimes + sparkle — compelling & appealing (default) ———
function generateDesignD(sampleRate = 44100, duration = 0.72) {
  const numSamples = Math.floor(sampleRate * duration);
  const raw = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let sample = 0;

    // First chime: G5 — warm, inviting; rounded attack + 2nd harmonic
    const n1Freq = 783.99;
    const n1Len = 0.3;
    if (t < n1Len) {
      const local = t;
      const attack = 1 - Math.exp(-local * 50);
      const decay = Math.exp(-local * 9);
      const env = attack * decay * 0.35;
      sample += Math.sin(TAU * n1Freq * t) * env;
      sample += Math.sin(TAU * n1Freq * 2 * t) * env * 0.12;
    }

    // Second chime: B5 — the "answer"; slight bloom after attack so it feels rewarding
    const n2Freq = 987.77;
    const n2Start = 0.11;
    const n2Len = 0.48;
    if (t >= n2Start && t < n2Start + n2Len) {
      const local = t - n2Start;
      const attack = 1 - Math.exp(-local * 55);
      const bloom = 0.7 + 0.3 * Math.exp(-local * 8);
      const decay = Math.exp(-local * 6);
      const env = attack * bloom * decay * 0.42;
      sample += Math.sin(TAU * n2Freq * t) * env;
      sample += Math.sin(TAU * n2Freq * 2 * t) * env * 0.1;
    }

    // Subtle high resolution (D6) — tiny "ting" that makes the phrase feel complete
    const n3Freq = 1174.66;
    const n3Start = 0.28;
    const n3Len = 0.32;
    if (t >= n3Start && t < n3Start + n3Len) {
      const local = t - n3Start;
      const env = Math.exp(-local * 12) * 0.14;
      sample += Math.sin(TAU * n3Freq * t) * env;
    }

    raw[i] = Math.max(-1, Math.min(1, sample * 0.88));
  }

  // Fuller reverb — more space so it feels premium and appealing
  return encodeWav(reverb(raw, sampleRate, [22, 35], 0.42, 0.18), sampleRate);
}

const assetsDir = path.join(__dirname, '../assets');
try {
  fs.writeFileSync(path.join(assetsDir, 'match-sound.wav'), generateDesignD());
  console.log('✅ Match sound → mobile/assets/match-sound.wav');
  console.log('   Two chimes + sparkle (~0.72s)');
} catch (err) {
  console.error('Error:', err);
  process.exit(1);
}
