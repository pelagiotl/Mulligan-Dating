/**
 * Cash-register style "cha-ching" for weekly token claim.
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

/** Short register click + two bright coin strikes. */
function generateChaChing(sampleRate = 44100, duration = 0.38) {
  const numSamples = Math.floor(sampleRate * duration);
  const raw = new Float32Array(numSamples);
  let noiseSeed = 12345;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let sample = 0;

    // Drawer / latch click
    if (t < 0.028) {
      noiseSeed = (noiseSeed * 1103515245 + 12345) & 0x7fffffff;
      const n = (noiseSeed / 0x7fffffff) * 2 - 1;
      const env = Math.exp(-t * 120) * (1 - Math.exp(-t * 400));
      sample += n * env * 0.22;
    }

    // "Cha" — lower metallic ping
    const chaFreq = 987.77;
    const chaStart = 0.02;
    const chaLen = 0.1;
    if (t >= chaStart && t < chaStart + chaLen) {
      const local = t - chaStart;
      const attack = 1 - Math.exp(-local * 120);
      const decay = Math.exp(-local * 28);
      const env = attack * decay * 0.38;
      const phase = TAU * chaFreq * t;
      sample += (Math.sin(phase) + 0.35 * Math.sin(phase * 2.76)) * env;
    }

    // "Ching" — bright coin pair (major third)
    const c1 = 1567.98;
    const c2 = 1975.53;
    const chingStart = 0.09;
    const chingLen = 0.26;
    if (t >= chingStart && t < chingStart + chingLen) {
      const local = t - chingStart;
      const attack = 1 - Math.exp(-local * 95);
      const decay = Math.exp(-local * 11);
      const env = attack * decay * 0.44;
      sample += Math.sin(TAU * c1 * t) * env;
      sample += Math.sin(TAU * c2 * t) * env * 0.85;
      sample += Math.sin(TAU * c2 * 2 * t) * env * 0.08;
    }

    raw[i] = Math.max(-1, Math.min(1, sample * 0.92));
  }

  return encodeWav(raw, sampleRate);
}

const assetsDir = path.join(__dirname, '../assets');
const publicDir = path.join(__dirname, '../../frontend/public');

try {
  const wav = generateChaChing();
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
