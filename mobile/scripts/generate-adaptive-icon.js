#!/usr/bin/env node
// Generates mobile/assets/adaptive-icon.png from mobile/assets/adaptive-icon.svg
// Run from repo root: node mobile/scripts/generate-adaptive-icon.js

const path = require('path');
const fs = require('fs');

const sharp = require('sharp');

const assetsDir = path.join(__dirname, '..', 'assets');
const svgPath = path.join(assetsDir, 'adaptive-icon.svg');
const pngPath = path.join(assetsDir, 'adaptive-icon.png');

if (!fs.existsSync(svgPath)) {
  console.error('Missing:', svgPath);
  process.exit(1);
}

sharp(svgPath, { density: 288 })
  .resize(1024, 1024)
  .png()
  .toFile(pngPath)
  .then((info) => {
    console.log('Generated:', pngPath, info);
  })
  .catch((err) => {
    console.error('Error generating adaptive icon:', err);
    process.exit(1);
  });
