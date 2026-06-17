#!/usr/bin/env node
/**
 * Download Mixkit stock footage and build onboarding intro example reel.
 * Requires: brew install ffmpeg-full, network access.
 *
 * Source: Mixkit #41290 "Face of a vlogger speaking to the camera" (free license).
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'assets/intro-video');
const source = join(outDir, '_mixkit_source.mp4');
const out = join(outDir, 'intro-example.mp4');
const mixkitUrl = 'https://assets.mixkit.co/videos/41290/41290-720.mp4';

const ffmpegCandidates = [
  '/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg',
  '/usr/local/opt/ffmpeg-full/bin/ffmpeg',
  'ffmpeg',
];

const ffmpeg = ffmpegCandidates.find((p) => existsSync(p) || p === 'ffmpeg');
if (!ffmpeg) {
  console.error('ffmpeg-full is required. Run: brew install ffmpeg-full');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

console.log('Downloading Mixkit stock clip…');
execSync(`curl -fsSL -o "${source}" "${mixkitUrl}"`, { stdio: 'inherit' });

console.log('Building 10s portrait reel…');
execSync(
  `"${ffmpeg}" -y -ss 0.8 -i "${source}" -t 10.5 -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,format=yuv420p" -c:v libx264 -preset slow -crf 20 -movflags +faststart -an "${out}"`,
  { stdio: 'inherit' },
);

try {
  unlinkSync(source);
} catch {
  /* ignore */
}

console.log(`Done → ${out}`);

if (process.platform === 'darwin') {
  try {
    execSync(`open "${out}"`);
    console.log('Opened in QuickTime.');
  } catch {
    /* ignore */
  }
}
