#!/usr/bin/env node
/**
 * Resize screenshots to App Store Connect 6.5" portrait size (1284 × 2778).
 * Scales proportionally and letterboxes with black bars if aspect ratio differs.
 *
 * Usage:
 *   node scripts/resize-appstore-65-screenshots.js <input-dir> [output-dir]
 * Default output: mobile/app-store-screenshots-6.5in
 */

const fs = require('fs');
const path = require('path');
const Jimp = require('jimp');

const TW = 1284;
const TH = 2778;

const INPUT_FILES = [
  'Mulligan_1-1d59c96f-448f-495a-a1a1-a2de5a8f19ea.png',
  'Mulligan_2-6d0a9b59-ff6a-489e-8b12-ef3f88ebfccc.png',
  'Mulligan_3-a43532e7-5efd-49ed-b5ed-7c63e38b1ff5.png',
  'Mulligan_4-927d68b4-0568-4a3e-8c9d-80cf194b7180.png',
  'Mulligan_5-ba9d9775-e481-49a0-a5bd-b0bdbbbc1835.png',
  'Mulligan_6-e4f9471e-6dd0-4f81-8853-01e0485c9a0e.png',
  'Mulligan_7-cd589431-d5a5-4c14-b178-5cbf1978d535.png',
  'Mulligan_7-eb869562-10d0-45e8-b467-2d2da4f35c9d.png',
];

function createCanvas(w, h, color) {
  return new Promise((resolve, reject) => {
    new Jimp(w, h, color, (err, image) => {
      if (err) reject(err);
      else resolve(image);
    });
  });
}

async function resizeTo65(inPath, outPath) {
  const img = await Jimp.read(inPath);
  const sw = img.bitmap.width;
  const sh = img.bitmap.height;
  const scale = Math.min(TW / sw, TH / sh);
  const nw = Math.max(1, Math.round(sw * scale));
  const nh = Math.max(1, Math.round(sh * scale));
  img.resize(nw, nh, Jimp.RESIZE_LANCZOS);

  const canvas = await createCanvas(TW, TH, 0x000000ff);
  const x = Math.round((TW - nw) / 2);
  const y = Math.round((TH - nh) / 2);
  canvas.composite(img, x, y);
  await canvas.writeAsync(outPath);
}

async function main() {
  const mobileDir = path.join(__dirname, '..');
  const inputDir =
    process.argv[2] ||
    path.join(
      process.env.HOME || '',
      '.cursor/projects/Users-code404-Desktop-Mulligan-Dating/assets'
    );
  const outputDir =
    process.argv[3] || path.join(mobileDir, 'app-store-screenshots-6.5in');

  if (!fs.existsSync(inputDir)) {
    console.error('Input directory not found:', inputDir);
    process.exit(1);
  }

  fs.mkdirSync(outputDir, { recursive: true });

  let n = 0;
  for (let i = 0; i < INPUT_FILES.length; i++) {
    const name = INPUT_FILES[i];
    const inPath = path.join(inputDir, name);
    if (!fs.existsSync(inPath)) {
      console.warn('Skip (missing):', inPath);
      continue;
    }
    const outName = `mulligan-6.5in-${String(i + 1).padStart(2, '0')}.png`;
    const outPath = path.join(outputDir, outName);
    await resizeTo65(inPath, outPath);
    n++;
    console.log('Wrote', outPath);
  }

  console.log(`Done. ${n} files → ${TW}×${TH}px`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
