/**
 * Generate a pleasant match notification sound
 * Creates a three-tone chime (major triad: A4, C#5, E5)
 * Run with: node scripts/generate-match-sound.js
 */

const fs = require('fs');
const path = require('path');

// Create a simple WAV file with a pleasant chime
// Using PCM format with 16-bit samples
function generateWavFile(sampleRate = 44100, duration = 1.2) {
  const numChannels = 1; // Mono
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = sampleRate * duration * numChannels * (bitsPerSample / 8);
  
  // Generate audio samples - three-tone chime (A4, C#5, E5)
  const samples = [];
  const tones = [
    { freq: 440, start: 0, duration: 0.2 },    // A4
    { freq: 554.37, start: 0.3, duration: 0.2 }, // C#5
    { freq: 659.25, start: 0.6, duration: 0.3 }, // E5
  ];
  
  for (let i = 0; i < sampleRate * duration; i++) {
    const time = i / sampleRate;
    let sample = 0;
    
    // Add each tone with envelope
    tones.forEach(tone => {
      if (time >= tone.start && time < tone.start + tone.duration) {
        const relativeTime = time - tone.start;
        const relativeDuration = tone.duration;
        // Envelope: quick attack, smooth decay
        const envelope = Math.exp(-relativeTime * 8) * (1 - relativeTime / relativeDuration);
        sample += Math.sin(2 * Math.PI * tone.freq * time) * envelope * 0.3;
      }
    });
    
    // Convert to 16-bit PCM
    const int16Sample = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)));
    samples.push(int16Sample & 0xFF);        // Low byte
    samples.push((int16Sample >> 8) & 0xFF); // High byte
  }
  
  // WAV file header
  const header = Buffer.alloc(44);
  let offset = 0;
  
  // RIFF header
  header.write('RIFF', offset); offset += 4;
  header.writeUInt32LE(36 + samples.length, offset); offset += 4; // File size - 8
  header.write('WAVE', offset); offset += 4;
  
  // fmt chunk
  header.write('fmt ', offset); offset += 4;
  header.writeUInt32LE(16, offset); offset += 4; // fmt chunk size
  header.writeUInt16LE(1, offset); offset += 2;  // Audio format (1 = PCM)
  header.writeUInt16LE(numChannels, offset); offset += 2;
  header.writeUInt32LE(sampleRate, offset); offset += 4;
  header.writeUInt32LE(byteRate, offset); offset += 4;
  header.writeUInt16LE(blockAlign, offset); offset += 2;
  header.writeUInt16LE(bitsPerSample, offset); offset += 2;
  
  // data chunk
  header.write('data', offset); offset += 4;
  header.writeUInt32LE(samples.length, offset); offset += 4;
  
  // Combine header and samples
  const wavBuffer = Buffer.concat([header, Buffer.from(samples)]);
  
  return wavBuffer;
}

// Generate the sound file
try {
  const wavData = generateWavFile();
  const outputPath = path.join(__dirname, '../assets/match-sound.wav');
  
  fs.writeFileSync(outputPath, wavData);
  console.log('✅ Match notification sound generated successfully!');
  console.log(`📁 Saved to: ${outputPath}`);
  console.log('🎵 A pleasant three-tone chime (A4, C#5, E5 major triad)');
  console.log('');
  console.log('💡 Note: If you prefer MP3 format, you can convert this .wav file');
  console.log('   using an online converter or audio editing tool.');
} catch (error) {
  console.error('❌ Error generating sound:', error);
  process.exit(1);
}








