#!/usr/bin/env node
/**
 * Rebake web PWA icons with full-bleed purple→pink gradient (no gray/burgundy edge flash on Add to Home Screen).
 * Run from mobile/: node scripts/bake-web-pwa-icon.js
 */

const path = require('path');
const fs = require('fs');

const repoRoot = path.join(__dirname, '..', '..');
const sourceIcon = path.join(repoRoot, 'frontend', 'public', 'app-icon.png');
const outIcon = sourceIcon;
const outFavicon = path.join(repoRoot, 'frontend', 'public', 'favicon.png');

const SIZE = 1024;
/** Connect / app mark gradient — blue-purple only (no burgundy #8b1538). */
const GRAD_TOP_LEFT = { r: 102, g: 126, b: 234 }; // #667eea
const GRAD_MID = { r: 118, g: 75, b: 162 }; // #764ba2
const GRAD_BOTTOM_RIGHT = { r: 240, g: 147, b: 251 }; // #f093fb

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function gradientColor(x, y) {
  const t = (x + y) / (2 * SIZE);
  if (t <= 0.5) {
    const u = t / 0.5;
    return {
      r: lerp(GRAD_TOP_LEFT.r, GRAD_MID.r, u),
      g: lerp(GRAD_TOP_LEFT.g, GRAD_MID.g, u),
      b: lerp(GRAD_TOP_LEFT.b, GRAD_MID.b, u),
    };
  }
  const u = (t - 0.5) / 0.5;
  return {
    r: lerp(GRAD_MID.r, GRAD_BOTTOM_RIGHT.r, u),
    g: lerp(GRAD_MID.g, GRAD_BOTTOM_RIGHT.g, u),
    b: lerp(GRAD_MID.b, GRAD_BOTTOM_RIGHT.b, u),
  };
}

function toJimpColor(r, g, b, a = 255) {
  return (
    (((r & 0xff) << 24) |
      ((g & 0xff) << 16) |
      ((b & 0xff) << 8) |
      (a & 0xff)) >>>
    0
  );
}

function isArtworkBackground(r, g, b, a) {
  if (a < 20) return true;
  return r > 210 && g > 210 && b > 210;
}

async function main() {
  if (!fs.existsSync(sourceIcon)) {
    console.error('Missing', sourceIcon);
    process.exit(1);
  }

  const Jimp = require('jimp');
  const artwork = await Jimp.read(sourceIcon);
  if (artwork.bitmap.width !== SIZE || artwork.bitmap.height !== SIZE) {
    artwork.resize(SIZE, SIZE);
  }

  const canvas = await new Promise((resolve, reject) => {
    new Jimp(SIZE, SIZE, 0xffffffff, (err, image) => {
      if (err) reject(err);
      else resolve(image);
    });
  });

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const ac = artwork.getPixelColor(x, y);
      const a = ac & 0xff;
      const r = (ac >> 24) & 0xff;
      const g = (ac >> 16) & 0xff;
      const b = (ac >> 8) & 0xff;
      if (isArtworkBackground(r, g, b, a)) {
        const c = gradientColor(x, y);
        canvas.setPixelColor(toJimpColor(c.r, c.g, c.b), x, y);
      } else {
        canvas.setPixelColor(ac, x, y);
      }
    }
  }

  await canvas.writeAsync(outIcon);
  fs.copyFileSync(outIcon, outFavicon);
  console.log('✅ Rebaked', path.relative(repoRoot, outIcon), 'and favicon.png');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
