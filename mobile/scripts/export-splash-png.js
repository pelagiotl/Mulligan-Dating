#!/usr/bin/env node
/**
 * Export splash-source.svg to splash.png at 1284x2778.
 * Run from repo root: node mobile/scripts/export-splash-png.js
 * Or from mobile: node scripts/export-splash-png.js
 */

const path = require('path');
const fs = require('fs');

const mobileDir = __dirname.includes('mobile') ? path.join(__dirname, '..') : path.join(__dirname, '..', 'mobile');
const svgPath = path.join(mobileDir, 'assets', 'splash-source.svg');
const outPath = path.join(mobileDir, 'assets', 'splash.png');

async function main() {
  const sharp = require('sharp');
  const svg = fs.readFileSync(svgPath);
  await sharp(svg)
    .resize(1284, 2778)
    .png()
    .toFile(outPath);
  console.log('✅ Exported', outPath);
}

main().catch((err) => {
  console.error('Export failed:', err);
  process.exit(1);
});
