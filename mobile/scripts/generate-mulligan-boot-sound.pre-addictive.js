/**
 * Golf swing whoosh for Mulligan boot splash.
 * Run: node scripts/generate-mulligan-boot-sound.js
 * Output: mobile/assets/mulligan-boot-sound.wav
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

  const tailLen = 0.09;
  const tailStart = duration - tailLen;
  const samples = [];
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let master = 1;
    if (t > tailStart) {
      const x = (duration - t) / tailLen;
      master = x * x;
    }
    // Soft saturation keeps the thwack punchy without harsh digital clip
    let s = Math.tanh(rawFloat[i] * 1.15) * master;
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
 * Takeaway → accelerating club whoosh → soft compression thwack → follow-through.
 * Tuned for phone speakers: clear motion, warm impact, no shrill ring.
 */
function generateGolfSwing(sampleRate = 44100, duration = 0.78) {
  const numSamples = Math.floor(sampleRate * duration);
  const raw = new Float32Array(numSamples);

  let seed = 271828;
  const noise = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff * 2 - 1;
  };

  // One-pole filters for air bands
  let slow = 0;
  let mid = 0;
  let bright = 0;
  let hiss = 0;

  const impact = 0.38;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const n = noise();

    // Dynamic filter coeffs — open up as clubhead speeds (brighter air)
    let speed = 0;
    if (t < impact) {
      speed = Math.pow(t / impact, 2.2);
    } else {
      speed = Math.exp(-(t - impact) * 7);
    }

    const aSlow = 0.03 + speed * 0.02;
    const aMid = 0.1 + speed * 0.08;
    const aBright = 0.22 + speed * 0.2;
    const aHiss = 0.45 + speed * 0.25;

    slow += aSlow * (n - slow);
    mid += aMid * (n - mid);
    bright += aBright * (n - bright);
    hiss += aHiss * (n - hiss);

    // Envelope: quiet takeaway, hard crescendo into impact, fast release
    let env = 0;
    if (t < impact) {
      const x = t / impact;
      // Most of the drama in the last ~30% of the downswing
      env = Math.pow(x, 3.1) * 0.72;
      // Extra surge right before contact
      if (x > 0.7) {
        const surge = (x - 0.7) / 0.3;
        env += Math.pow(surge, 1.6) * 0.28;
      }
    } else if (t < impact + 0.32) {
      const local = t - impact;
      env = Math.exp(-local * 10) * 0.85;
    }

    // Doppler-ish whoosh tone: rises hard, falls after strike
    let tone;
    if (t < impact) {
      tone = 95 + Math.pow(t / impact, 2.4) * 520;
    } else {
      tone = Math.max(70, 615 - (t - impact) * 1100);
    }

    // Subtle turbulence flutter
    const flutter = 1 + 0.08 * Math.sin(TAU * (18 + speed * 40) * t);

    let sample = 0;
    sample += slow * env * 0.5 * flutter;
    sample += mid * env * 0.95 * flutter;
    sample += bright * env * (0.28 + speed * 0.25);
    sample += hiss * env * speed * 0.12;
    sample += Math.sin(TAU * tone * t) * env * 0.2;
    sample += Math.sin(TAU * tone * 1.35 * t) * env * 0.07;

    // Clubhead / shaft body rumble under the air
    if (t < impact + 0.12) {
      const rumbleEnv = t < impact ? env * 0.55 : Math.exp(-(t - impact) * 14) * 0.35;
      sample += Math.sin(TAU * (55 + speed * 40) * t) * rumbleEnv * 0.22;
    }

    // Ball compression thwack — warm, short, satisfying
    if (t >= impact && t < impact + 0.07) {
      const local = t - impact;
      const hitBody =
        (1 - Math.exp(-local * 520)) * Math.exp(-local * 48);
      const hitClick = Math.exp(-local * 220) * (1 - Math.exp(-local * 900));
      sample += Math.sin(TAU * 195 * t) * hitBody * 0.55;
      sample += Math.sin(TAU * 320 * t) * hitBody * 0.28;
      sample += Math.sin(TAU * 480 * t) * hitBody * 0.1;
      sample += mid * hitClick * 0.35;
      sample += bright * hitClick * 0.1;
    }

    // Soft ball-flight air after contact
    if (t > impact + 0.02 && t < impact + 0.28) {
      const local = t - (impact + 0.02);
      const flight = Math.exp(-local * 8) * 0.1;
      sample += slow * flight;
      sample += Math.sin(TAU * (140 - local * 120) * t) * flight * 0.35;
    }

    raw[i] = sample;
  }

  // Normalize to healthy phone level
  let peak = 0;
  for (let i = 0; i < numSamples; i++) peak = Math.max(peak, Math.abs(raw[i]));
  const gain = peak > 0 ? 0.88 / peak : 1;
  for (let i = 0; i < numSamples; i++) raw[i] *= gain;

  return encodeWav(raw, sampleRate);
}

const assetsDir = path.join(__dirname, '../assets');
const wav = generateGolfSwing();
const mobilePath = path.join(assetsDir, 'mulligan-boot-sound.wav');
fs.writeFileSync(mobilePath, wav);
console.log('✅ Mulligan boot sound →', mobilePath);
