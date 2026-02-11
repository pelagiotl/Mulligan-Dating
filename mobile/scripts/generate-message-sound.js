/**
 * Generate a cool message notification sound
 * Quick three-note rise + tiny sparkle - distinct from match, still short
 * Run with: node scripts/generate-message-sound.js
 */

const fs = require('fs');
const path = require('path');

const TAU = 2 * Math.PI;

function generateWavFile(sampleRate = 44100, duration = 1.15) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);

  // Quick three-note rise (E5, G#5, B5) + high sparkle
  const tones = [
    { freq: 659.25, start: 0, duration: 0.2, gain: 0.32, decay: 12, attack: 55 },
    { freq: 830.61, start: 0.12, duration: 0.2, gain: 0.3, decay: 10, attack: 50 },
    { freq: 987.77, start: 0.24, duration: 0.32, gain: 0.3, decay: 7, attack: 45 },
    { freq: 1318.51, start: 0.4, duration: 0.28, gain: 0.2, decay: 9, attack: 50 },
  ];

  const samples = [];
  for (let i = 0; i < sampleRate * duration; i++) {
    const time = i / sampleRate;
    let sample = 0;

    tones.forEach((tone) => {
      if (time >= tone.start && time < tone.start + tone.duration) {
        const t = time - tone.start;
        const d = tone.duration;
        const attack = Math.min(1, t * (tone.attack || 40));
        const env = attack * Math.exp(-t * tone.decay) * (1 - 0.12 * (t / d));
        sample += Math.sin(TAU * tone.freq * time) * env * tone.gain;
        if (tone.freq >= 800) {
          sample += 0.05 * Math.sin(TAU * tone.freq * 2.5 * time) * env;
        }
      }
    });

    const int16Sample = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)));
    samples.push(int16Sample & 0xff);
    samples.push((int16Sample >> 8) & 0xff);
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

const wavPath = path.join(__dirname, '../assets/message-sound.wav');
try {
  fs.writeFileSync(wavPath, generateWavFile());
  console.log('✅ Message sound generated → mobile/assets/message-sound.wav');
  console.log('   Style: three-note rise + sparkle');
} catch (err) {
  console.error('Error:', err);
  process.exit(1);
}
