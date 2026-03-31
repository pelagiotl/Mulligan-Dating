#!/usr/bin/env node
/**
 * Generates Android adaptive icon from iOS icon (icon.png).
 * Android shows only the center ~66% as a circle, so we scale the icon down
 * and center it on a 1024x1024 canvas to prevent cut-off.
 * Run from repo root: node mobile/scripts/generate-adaptive-icon-from-icon.js
 * Or from mobile: node scripts/generate-adaptive-icon-from-icon.js
 */

const path = require('path');
const fs = require('fs');

const mobileDir = __dirname.includes('mobile') ? path.join(__dirname, '..') : path.join(__dirname, '..', 'mobile');
const assetsDir = path.join(mobileDir, 'assets');
const iconPath = path.join(assetsDir, 'icon.png');
const outPath = path.join(assetsDir, 'adaptive-icon.png');

// Android adaptive icon safe zone: inner ~66% of 1024px is visible as circle
const SIZE = 1024;
const SAFE_ZONE = Math.round(SIZE * 0.66); // 675px
const PAD = Math.round((SIZE - SAFE_ZONE) / 2); // 174px each side

async function main() {
  if (!fs.existsSync(iconPath)) {
    console.error('Missing icon.png at', iconPath);
    process.exit(1);
  }

  const Jimp = require('jimp');

  const icon = await Jimp.read(iconPath);
  icon.cover(SAFE_ZONE, SAFE_ZONE);

  const canvas = await new Promise((resolve, reject) => {
    new Jimp(SIZE, SIZE, 0x00000000, (err, image) => {
      if (err) reject(err);
      else resolve(image);
    });
  });

  canvas.composite(icon, PAD, PAD);
  await canvas.writeAsync(outPath);

  console.log('✅ Generated', outPath, '(icon.png scaled to 66% safe zone and centered)');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
