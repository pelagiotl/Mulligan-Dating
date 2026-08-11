/**
 * Weekly Mulligan token-claim SFX — warm ascending “refill” chime.
 * Soft major cascade (not a cash-register cha-ching): body thud → rising bells → settle.
 *
 * Run: node scripts/generate-token-claim-sound.js
 * Output: mobile/assets/token-claim-sound-v2.wav (+ frontend/public)
 *
 * Rollback: assets/sound-archive/token-claim-sound.v1.wav
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
    let sample = Math.tanh(rawFloat[i] * 1.12) * master;
    sample = Math.max(-1, Math.min(1, sample));
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

function softReverb(raw, sampleRate) {
  const d1 = Math.floor(0.024 * sampleRate);
  const d2 = Math.floor(0.037 * sampleRate);
  const d3 = Math.floor(0.053 * sampleRate);
  const buf1 = new Float32Array(d1);
  const buf2 = new Float32Array(d2);
  const buf3 = new Float32Array(d3);
  let i1 = 0;
  let i2 = 0;
  let i3 = 0;
  const out = new Float32Array(raw.length);
  const g = 0.28;
  const wet = 0.22;
  for (let i = 0; i < raw.length; i++) {
    const x = raw[i];
    const r1 = buf1[i1];
    const r2 = buf2[i2];
    const r3 = buf3[i3];
    buf1[i1] = x + g * r1;
    buf2[i2] = x + g * r2;
    buf3[i3] = x + g * r3;
    i1 = (i1 + 1) % d1;
    i2 = (i2 + 1) % d2;
    i3 = (i3 + 1) % d3;
    out[i] = x * (1 - wet) + (r1 * 0.42 + r2 * 0.33 + r3 * 0.25) * wet;
  }
  return out;
}

/** Soft FM-ish bell — round, phone-speaker friendly. */
function bell(freq, t, env, weight = 1) {
  const mod = Math.sin(TAU * freq * 1.4 * t) * 0.35 * Math.exp(-t * 8);
  const p = TAU * freq * t + mod;
  return (
    Math.sin(p) * 0.7 +
    Math.sin(p * 2.002) * 0.2 +
    Math.sin(p * 2.99) * 0.07 +
    Math.sin(p * 4.02) * 0.03
  ) * env * weight;
}

/**
 * Ascending C-major refill cascade — cozy “tokens landing” feel.
 */
function generateWarmClaim(sampleRate = 44100, duration = 0.72) {
  const numSamples = Math.floor(sampleRate * duration);
  const raw = new Float32Array(numSamples);
  let noiseSeed = 424242;
  let lp = 0;

  const noise = () => {
    noiseSeed = (noiseSeed * 1103515245 + 12345) & 0x7fffffff;
    return (noiseSeed / 0x7fffffff) * 2 - 1;
  };

  // Three rising “token drops” + a soft resolving chord
  const hits = [
    { start: 0.02, freq: 392.0, harm: 493.88, amp: 0.38, decay: 10 }, // G4
    { start: 0.12, freq: 523.25, harm: 659.25, amp: 0.44, decay: 8.5 }, // C5
    { start: 0.235, freq: 659.25, harm: 783.99, amp: 0.5, decay: 7.2 }, // E5
    { start: 0.36, freq: 783.99, harm: 1046.5, amp: 0.42, decay: 6.2 }, // G5 sparkle
  ];

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const n = noise();
    lp += 0.14 * (n - lp);
    let sample = 0;

    // Soft velvet body — like a token pouch opening
    if (t < 0.055) {
      const env = Math.exp(-t * 48) * (1 - Math.exp(-t * 220));
      sample += Math.sin(TAU * 98 * t) * env * 0.32;
      sample += Math.sin(TAU * 148 * t) * env * 0.12;
      sample += lp * env * 0.16;
    }

    for (const hit of hits) {
      if (t < hit.start || t > hit.start + 0.42) continue;
      const local = t - hit.start;
      const env =
        (1 - Math.exp(-local * 110)) * Math.exp(-local * hit.decay) * hit.amp;
      sample += bell(hit.freq, local, env);
      sample += bell(hit.harm, local, env, 0.45);
      sample += lp * Math.exp(-local * 55) * 0.05;
    }

    // Warm resolving C-major pad under the cascade
    if (t >= 0.08 && t < 0.62) {
      const local = t - 0.08;
      const env = Math.exp(-local * 3.2) * (1 - Math.exp(-local * 18)) * 0.14;
      sample += Math.sin(TAU * 261.63 * t) * env; // C4
      sample += Math.sin(TAU * 329.63 * t) * env * 0.7; // E4
      sample += Math.sin(TAU * 392.0 * t) * env * 0.55; // G4
    }

    // Gentle air shimmer on the peak (not piercing)
    if (t >= 0.34 && t < 0.58) {
      const local = t - 0.34;
      const env = Math.exp(-local * 9) * (1 - Math.exp(-local * 40)) * 0.07;
      sample += Math.sin(TAU * 1174.7 * t) * env;
      sample += lp * env * 0.35;
    }

    raw[i] = sample;
  }

  const wet = softReverb(raw, sampleRate);

  let peak = 0;
  for (let i = 0; i < wet.length; i++) peak = Math.max(peak, Math.abs(wet[i]));
  const gain = peak > 0 ? 0.88 / peak : 1;
  for (let i = 0; i < wet.length; i++) wet[i] *= gain;

  return encodeWav(wet, sampleRate);
}

const assetsDir = path.join(__dirname, '../assets');
const publicDir = path.join(__dirname, '../../frontend/public');
const outName = 'token-claim-sound-v2.wav';

try {
  const wav = generateWarmClaim();
  const mobilePath = path.join(assetsDir, outName);
  fs.writeFileSync(mobilePath, wav);
  console.log('✅ Token claim sound →', mobilePath);

  // Keep legacy filename as a copy for any hard-coded paths
  fs.writeFileSync(path.join(assetsDir, 'token-claim-sound.wav'), wav);

  if (fs.existsSync(publicDir)) {
    fs.writeFileSync(path.join(publicDir, outName), wav);
    fs.writeFileSync(path.join(publicDir, 'token-claim-sound.wav'), wav);
    console.log('✅ Token claim sound → frontend/public');
  }
} catch (err) {
  console.error('Error:', err);
  process.exit(1);
}
