/**
 * Match celebration sound — simple, warm, satisfying.
 * Four-note ascending phrase (C E G C) with a soft bell tone, then a brief bloom.
 * Run with: node scripts/generate-match-sound.js
 */

const fs = require('fs');
const path = require('path');

const TAU = 2 * Math.PI;

function generateWavFile(sampleRate = 44100, duration = 1.05) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);

  // Four notes: C5, E5, G5, C6 — clear rhythm, no overlap
  const notes = [
    { freq: 523.25, start: 0, len: 0.28, gain: 0.28 },
    { freq: 659.25, start: 0.14, len: 0.28, gain: 0.26 },
    { freq: 783.99, start: 0.28, len: 0.28, gain: 0.27 },
    { freq: 1046.5, start: 0.42, len: 0.36, gain: 0.25 },
  ];

  // Short bloom after the phrase: soft G5+B5 (adds a satisfying "ah")
  const bloomFreqs = [783.99, 987.77];
  const bloomStart = 0.5;
  const bloomLen = 0.4;
  const bloomGain = 0.14;

  const samples = [];
  const numSamples = Math.floor(sampleRate * duration);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let sample = 0;

    notes.forEach((n) => {
      if (t >= n.start && t < n.start + n.len) {
        const local = t - n.start;
        const attack = Math.min(1, local * 120);
        const decay = Math.exp(-local * 7);
        const env = attack * decay;
        const f = n.freq * t;
        // Warm bell: fundamental + a bit of 2nd and 3rd harmonic
        sample += (Math.sin(TAU * f) + 0.14 * Math.sin(TAU * 2 * f) + 0.06 * Math.sin(TAU * 3 * f)) * env * n.gain;
      }
    });

    bloomFreqs.forEach((freq) => {
      if (t >= bloomStart && t < bloomStart + bloomLen) {
        const local = t - bloomStart;
        const attack = Math.min(1, local * 35);
        const decay = Math.exp(-local * 5);
        const env = attack * decay;
        sample += Math.sin(TAU * freq * t) * env * bloomGain;
      }
    });

    // Smooth master fade out
    const tailStart = duration - 0.2;
    const master = t > tailStart ? (duration - t) / 0.2 : 1;
    sample *= master;

    sample = Math.max(-1, Math.min(1, sample * 0.95));
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
  console.log('   Simple phrase + warm bell tone + short bloom');
} catch (err) {
  console.error('Error:', err);
  process.exit(1);
}
