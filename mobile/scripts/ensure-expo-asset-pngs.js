#!/usr/bin/env node
/**
 * Creates minimal valid PNGs for Expo prebuild when assets are missing
 * (e.g. only .txt placeholders in repo). Safe to re-run; skips real PNGs.
 */
const fs = require('fs');
const path = require('path');

const mobileDir = path.join(__dirname, '..');
const assetsDir = path.join(mobileDir, 'assets');

function looksLikePng(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const st = fs.statSync(filePath);
  if (st.size < 24) return false;
  const buf = Buffer.alloc(8);
  const fd = fs.openSync(filePath, 'r');
  try {
    fs.readSync(fd, buf, 0, 8, 0);
  } finally {
    fs.closeSync(fd);
  }
  return buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG';
}

async function writeSolid(name, w, h, rgba) {
  const out = path.join(assetsDir, name);
  if (looksLikePng(out)) return;

  const Jimp = require('jimp');
  const image = await new Promise((resolve, reject) => {
    new Jimp(w, h, rgba, (err, img) => (err ? reject(err) : resolve(img)));
  });
  await image.writeAsync(out);
  console.log('Wrote', out);
}

async function main() {
  fs.mkdirSync(assetsDir, { recursive: true });
  const brand = 0x5b21b6ff;
  const white = 0xffffffff;
  await writeSolid('icon.png', 1024, 1024, brand);
  await writeSolid('adaptive-icon.png', 1024, 1024, brand);
  await writeSolid('splash.png', 1284, 2778, white);
  await writeSolid('favicon.png', 48, 48, brand);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
