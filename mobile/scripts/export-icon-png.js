#!/usr/bin/env node
/**
 * Export icon-source.svg to icon.png and adaptive-icon.png at 1024x1024.
 * Run from mobile: node scripts/export-icon-png.js
 */

const path = require('path');
const fs = require('fs');

const mobileDir = __dirname.includes('mobile') ? path.join(__dirname, '..') : path.join(__dirname, '..', 'mobile');
const svgPath = path.join(mobileDir, 'assets', 'icon-source.svg');
const iconPath = path.join(mobileDir, 'assets', 'icon.png');
const adaptivePath = path.join(mobileDir, 'assets', 'adaptive-icon.png');

async function main() {
  const sharp = require('sharp');
  const svg = fs.readFileSync(svgPath);
  const pipeline = sharp(svg).resize(1024, 1024).png();
  await pipeline.clone().toFile(iconPath);
  await pipeline.clone().toFile(adaptivePath);
  console.log('✅ Exported', iconPath);
  console.log('✅ Exported', adaptivePath);
}

main().catch((err) => {
  console.error('Export failed:', err);
  process.exit(1);
});
