/**
 * Match celebration sound — polished and clear.
 * 1) Two chimes (E5, B5) + one soft high sparkle after
 * 2) Warm E major chord + low E3, subtle chorus + light vibrato
 * 3) Reverb + time-varying low-pass (stays bright longer, then recedes)
 * Run with: node scripts/generate-match-sound.js
 */

const fs = require('fs');
const path = require('path');

const TAU = 2 * Math.PI;

function generateWavFile(sampleRate = 44100, duration = 3.0) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);

  const numSamples = Math.floor(sampleRate * duration);
  const raw = new Float32Array(numSamples);

  // ——— 1) Generate dry signal ———
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let sample = 0;

    const chimes = [
      { freq: 659.25, start: 0, len: 0.16, gain: 0.32 },
      { freq: 987.77, start: 0.08, len: 0.2, gain: 0.28 },
    ];
    chimes.forEach((n) => {
      if (t >= n.start && t < n.start + n.len) {
        const local = t - n.start;
        const attack = 1 - Math.exp(-local * 40);
        const decay = Math.exp(-local * 10);
        const env = attack * decay;
        const phase = TAU * n.freq * t;
        sample += (Math.sin(phase) + 0.15 * Math.sin(2 * phase)) * env * n.gain;
      }
    });

    const chordFreqs = [329.63, 415.30, 493.88];
    const lowE = 164.81;
    const chordStart = 0.12;
    const chordLen = duration - chordStart - 0.05;
    if (t >= chordStart && t < chordStart + chordLen) {
      const local = t - chordStart;
      const swell = 1 - Math.exp(-local * 5);
      const decay = Math.exp(-local * 1.1);
      const env = swell * decay * 0.26;
      const vib = 0.0006 * (1 - Math.cos(TAU * 3.5 * t));
      chordFreqs.forEach((freq) => {
        const phase = TAU * freq * (t + vib);
        sample += Math.sin(phase) * env;
        sample += Math.sin(TAU * freq * 1.003 * t) * env * 0.06;
        sample += Math.sin(TAU * freq * 0.998 * t) * env * 0.05;
      });
      sample += Math.sin(TAU * lowE * (t + vib)) * env * 0.15;
    }

    // Soft high sparkle (E6) right after the chimes
    const sparkleFreq = 1318.51;
    const sparkleStart = 0.24;
    const sparkleLen = 0.22;
    if (t >= sparkleStart && t < sparkleStart + sparkleLen) {
      const local = t - sparkleStart;
      const env = Math.exp(-local * 14) * 0.09;
      sample += Math.sin(TAU * sparkleFreq * t) * env;
    }

    raw[i] = Math.max(-1, Math.min(1, sample * 0.9));
  }

  // ——— 2) Reverb (3 combs for a bit more body), dry + wet ———
  const combD1 = Math.floor(0.032 * sampleRate);
  const combD2 = Math.floor(0.041 * sampleRate);
  const combD3 = Math.floor(0.047 * sampleRate);
  const combG = 0.5;
  const wet = 0.32;
  const buf1 = new Float32Array(combD1);
  const buf2 = new Float32Array(combD2);
  const buf3 = new Float32Array(combD3);
  let i1 = 0, i2 = 0, i3 = 0;
  const withReverb = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const x = raw[i];
    const d1 = buf1[i1], d2 = buf2[i2], d3 = buf3[i3];
    buf1[i1] = x + combG * d1;
    buf2[i2] = x + combG * d2;
    buf3[i3] = x + combG * d3;
    i1 = (i1 + 1) % combD1;
    i2 = (i2 + 1) % combD2;
    i3 = (i3 + 1) % combD3;
    const rev = (d1 + d2 + d3) / 3;
    withReverb[i] = (1 - wet) * x + wet * rev;
  }

  // ——— 3) Time-varying low-pass: stay bright ~1s, then gently darken into the tail ———
  const fcBright = 5200;
  const fcEnd = 550;
  let lpfPrev = 0;
  const filtered = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const rampStart = 1.0;
    const fc = t < rampStart ? fcBright : fcBright + (fcEnd - fcBright) * ((t - rampStart) / (duration - rampStart));
    const coef = Math.exp(-TAU * fc / sampleRate);
    lpfPrev = (1 - coef) * withReverb[i] + coef * lpfPrev;
    filtered[i] = lpfPrev;
  }

  // ——— 4) Master fade (slightly curved for a softer end) and encode to 16-bit ———
  const tailLen = 0.55;
  const tailStart = duration - tailLen;
  const samples = [];
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let master = 1;
    if (t > tailStart) {
      const x = (duration - t) / tailLen;
      master = x * x;
    }
    let sample = filtered[i] * master;
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

const wavPath = path.join(__dirname, '../assets/match-sound.wav');
try {
  fs.writeFileSync(wavPath, generateWavFile());
  console.log('✅ Match sound → mobile/assets/match-sound.wav');
  console.log('   Chimes + sparkle + chord (chorus/vib) + reverb + LPF fade (~3s)');
} catch (err) {
  console.error('Error:', err);
  process.exit(1);
}
