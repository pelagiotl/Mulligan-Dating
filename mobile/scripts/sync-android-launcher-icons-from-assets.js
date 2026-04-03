#!/usr/bin/env node
/**
 * Writes mipmap PNGs from mobile/assets (icon.png + adaptive-icon.png).
 * Replaces legacy .webp launcher assets so local Gradle builds match Expo config.
 * Run: node scripts/sync-android-launcher-icons-from-assets.js (from mobile/)
 */

const path = require('path');
const fs = require('fs');

const mobileDir = path.join(__dirname, '..');
const assetsDir = path.join(mobileDir, 'assets');
const resDir = path.join(mobileDir, 'android', 'app', 'src', 'main', 'res');

const DENSITIES = [
  { dir: 'mipmap-mdpi', foreground: 108, launcher: 48 },
  { dir: 'mipmap-hdpi', foreground: 162, launcher: 72 },
  { dir: 'mipmap-xhdpi', foreground: 216, launcher: 96 },
  { dir: 'mipmap-xxhdpi', foreground: 324, launcher: 144 },
  { dir: 'mipmap-xxxhdpi', foreground: 432, launcher: 192 },
];

const NAMES = ['ic_launcher_foreground', 'ic_launcher', 'ic_launcher_round'];

async function main() {
  const iconPath = path.join(assetsDir, 'icon.png');
  const adaptivePath = path.join(assetsDir, 'adaptive-icon.png');
  if (!fs.existsSync(iconPath) || !fs.existsSync(adaptivePath)) {
    console.error('Missing icon.png or adaptive-icon.png in assets/');
    process.exit(1);
  }

  const Jimp = require('jimp');
  const icon = await Jimp.read(iconPath);
  const adaptive = await Jimp.read(adaptivePath);

  for (const { dir, foreground, launcher } of DENSITIES) {
    const folder = path.join(resDir, dir);
    if (!fs.existsSync(folder)) {
      console.warn('Skip missing', folder);
      continue;
    }

    for (const base of NAMES) {
      for (const ext of ['.webp', '.png']) {
        const p = path.join(folder, base + ext);
        if (fs.existsSync(p)) fs.unlinkSync(p);
      }
    }

    const fg = adaptive.clone().resize(foreground, foreground);
    await fg.writeAsync(path.join(folder, 'ic_launcher_foreground.png'));

    const legacy = icon.clone().resize(launcher, launcher);
    await legacy.writeAsync(path.join(folder, 'ic_launcher.png'));
    await legacy.clone().writeAsync(path.join(folder, 'ic_launcher_round.png'));
  }

  console.log('✅ Android mipmap PNGs updated from assets/icon.png and adaptive-icon.png');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
