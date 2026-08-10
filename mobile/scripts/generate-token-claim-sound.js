/**
 * Warm coin / reward chime for weekly token claim.
 * Run: node scripts/generate-token-claim-sound.js
 * Output: mobile/assets/token-claim-sound.wav (copy to frontend/public for web).
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

  const tailLen = 0.14;
  const tailStart = duration - tailLen;
  const samples = [];
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let master = 1;
    if (t > tailStart) {
      const x = (duration - t) / tailLen;
      master = x * x;
    }
    // Soft saturation — round, not robotic square edges
    let sample = Math.tanh(rawFloat[i] * 1.05) * master;
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

/**
 * Soft body thud + two warm mid-range coin tones (no bright digital ping).
 * Tuned for phone speakers — cozy reward, not arcade cha-ching.
 */
function generateWarmClaim(sampleRate = 44100, duration = 0.52) {
  const numSamples = Math.floor(sampleRate * duration);
  const raw = new Float32Array(numSamples);
  let noiseSeed = 90210;
  let lp = 0;

  const noise = () => {
    noiseSeed = (noiseSeed * 1103515245 + 12345) & 0x7fffffff;
    return (noiseSeed / 0x7fffffff) * 2 - 1;
  };

  // Soft bell partials (fundamental-heavy, muted overtones)
  const bell = (freq, t, env, weight = 1) => {
    const p = TAU * freq * t;
    return (
      Math.sin(p) * 0.72 +
      Math.sin(p * 2.01) * 0.18 +
      Math.sin(p * 2.76) * 0.06
    ) * env * weight;
  };

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const n = noise();
    lp += 0.18 * (n - lp);
    let sample = 0;

    // Soft leather / drawer body — low, not clicky plastic
    if (t < 0.045) {
      const env = Math.exp(-t * 55) * (1 - Math.exp(-t * 280));
      sample += Math.sin(TAU * 110 * t) * env * 0.35;
      sample += lp * env * 0.2;
    }

    // First coin — warm G4 (~392 Hz)
    const c1Start = 0.018;
    if (t >= c1Start && t < c1Start + 0.28) {
      const local = t - c1Start;
      const env =
        (1 - Math.exp(-local * 90)) * Math.exp(-local * 9) * 0.42;
      sample += bell(392.0, t, env);
      sample += bell(493.88, t, env, 0.35); // soft B4 under
      sample += lp * Math.exp(-local * 60) * 0.08;
    }

    // Second coin — warmer lift to C5/E5, slightly delayed
    const c2Start = 0.11;
    if (t >= c2Start && t < c2Start + 0.38) {
      const local = t - c2Start;
      const env =
        (1 - Math.exp(-local * 75)) * Math.exp(-local * 7.5) * 0.48;
      sample += bell(523.25, t, env);
      sample += bell(659.25, t, env, 0.55);
      // Tiny shimmer — still mid, not piercing
      sample += Math.sin(TAU * 784 * t) * env * 0.08;
      sample += lp * Math.exp(-local * 45) * 0.06;
    }

    // Soft low “reward” settle under the chime
    if (t >= 0.05 && t < 0.4) {
      const local = t - 0.05;
      const env = Math.exp(-local * 5) * (1 - Math.exp(-local * 25)) * 0.16;
      sample += Math.sin(TAU * (165 - local * 40) * t) * env;
    }

    raw[i] = sample;
  }

  let peak = 0;
  for (let i = 0; i < numSamples; i++) peak = Math.max(peak, Math.abs(raw[i]));
  const gain = peak > 0 ? 0.86 / peak : 1;
  for (let i = 0; i < numSamples; i++) raw[i] *= gain;

  return encodeWav(raw, sampleRate);
}

const assetsDir = path.join(__dirname, '../assets');
const publicDir = path.join(__dirname, '../../frontend/public');

try {
  const wav = generateWarmClaim();
  const mobilePath = path.join(assetsDir, 'token-claim-sound.wav');
  fs.writeFileSync(mobilePath, wav);
  console.log('✅ Token claim sound →', mobilePath);

  if (fs.existsSync(publicDir)) {
    const webPath = path.join(publicDir, 'token-claim-sound.wav');
    fs.writeFileSync(webPath, wav);
    console.log('✅ Token claim sound →', webPath);
  }
} catch (err) {
  console.error('Error:', err);
  process.exit(1);
}
