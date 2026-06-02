#!/usr/bin/env node
/**
 * Mirrors frontend/public/app-icon.png for iOS + Android.
 * Builds adaptive-icon.png with Android safe-zone inset (~66%) so launchers
 * do not crop/zoom the artwork compared to the web PWA icon.
 *
 * Run from mobile/: npm run generate:adaptive-icon
 */

const path = require('path');
const fs = require('fs');

const mobileDir = path.join(__dirname, '..');
const repoRoot = path.join(mobileDir, '..');
const webIconPath = path.join(repoRoot, 'frontend', 'public', 'app-icon.png');
const assetsDir = path.join(mobileDir, 'assets');
const iconPath = path.join(assetsDir, 'icon.png');
const faviconPath = path.join(assetsDir, 'favicon.png');
const outPath = path.join(assetsDir, 'adaptive-icon.png');
const iosAppIconPath = path.join(
  mobileDir,
  'ios',
  'Mulligan',
  'Images.xcassets',
  'AppIcon.appiconset',
  'App-Icon-1024x1024@1x.png'
);

/** Android adaptive icon visible diameter ≈ 66% of 1024px foreground */
const SIZE = 1024;
const SAFE_RATIO = 0.66;
const SAFE_ZONE = Math.round(SIZE * SAFE_RATIO);

function rgbaToHex(rgba) {
  const r = (rgba >> 24) & 0xff;
  const g = (rgba >> 16) & 0xff;
  const b = (rgba >> 8) & 0xff;
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

async function main() {
  const source = fs.existsSync(webIconPath) ? webIconPath : iconPath;
  if (!fs.existsSync(source)) {
    console.error('Missing web app icon at', webIconPath, 'or', iconPath);
    process.exit(1);
  }

  const Jimp = require('jimp');
  const icon = await Jimp.read(source);

  if (icon.bitmap.width !== SIZE || icon.bitmap.height !== SIZE) {
    icon.resize(SIZE, SIZE);
  }

  if (source === webIconPath) {
    fs.copyFileSync(webIconPath, iconPath);
    fs.copyFileSync(webIconPath, faviconPath);
    console.log('✅ Copied web app-icon.png → assets/icon.png & favicon.png');
  }

  // Top-left (0,0) is often outside the squircle — sample inside the gradient.
  const sampleX = Math.min(128, icon.bitmap.width - 1);
  const sampleY = Math.min(128, icon.bitmap.height - 1);
  const bg = icon.getPixelColor(sampleX, sampleY);
  const bgHex = rgbaToHex(bg);

  const scaled = icon.clone().scaleToFit(SAFE_ZONE, SAFE_ZONE);
  const x = Math.round((SIZE - scaled.bitmap.width) / 2);
  const y = Math.round((SIZE - scaled.bitmap.height) / 2);

  const canvas = await new Promise((resolve, reject) => {
    new Jimp(SIZE, SIZE, bg, (err, image) => {
      if (err) reject(err);
      else resolve(image);
    });
  });

  canvas.composite(scaled, x, y);
  await canvas.writeAsync(outPath);

  if (fs.existsSync(path.dirname(iosAppIconPath))) {
    fs.copyFileSync(iconPath, iosAppIconPath);
    console.log('✅ Synced assets/icon.png → iOS AppIcon.appiconset');
  }

  console.log(
    `✅ Generated ${path.relative(mobileDir, outPath)}`,
    `(artwork fit to ${SAFE_ZONE}px safe zone, bg ${bgHex})`
  );
  console.log('   Tip: set android.adaptiveIcon.backgroundColor in app.json to', bgHex);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
