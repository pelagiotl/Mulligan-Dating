#!/usr/bin/env node
/**
 * Scale portrait simulator screenshots to App Store Connect iPhone 6.5" size (1242×2688).
 * Uses macOS `sips` (cover + center crop, minimal distortion).
 *
 * Usage:
 *   node scripts/scale-app-store-screenshots.mjs screenshot1.png screenshot2.png ...
 *   node scripts/scale-app-store-screenshots.mjs ../raw-captures/*.png
 */

import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TARGET_W = 1242;
const TARGET_H = 2688;
const OUT_DIR = resolve(
  fileURLToPath(new URL('../assets/app-store-screenshots/iphone-6.5-inch', import.meta.url)),
);

function sipsInt(flag, file) {
  const out = execSync(`sips -g ${flag} ${JSON.stringify(file)}`, { encoding: 'utf8' });
  const m = out.match(new RegExp(`${flag}:\\s*(\\d+)`));
  if (!m) throw new Error(`Could not read ${flag} from ${file}`);
  return Number(m[1]);
}

function scaleOne(input, output) {
  const tmp = `${output}.tmp.png`;
  copyFileSync(input, tmp);
  const srcW = sipsInt('pixelWidth', tmp);
  const srcH = sipsInt('pixelHeight', tmp);
  const scale = Math.max(TARGET_W / srcW, TARGET_H / srcH);
  const newW = Math.round(srcW * scale);
  const newH = Math.round(srcH * scale);
  execSync(`sips -z ${newH} ${newW} ${JSON.stringify(tmp)}`, { stdio: 'ignore' });
  execSync(
    `sips --cropToHeightWidth ${TARGET_H} ${TARGET_W} ${JSON.stringify(tmp)}`,
    { stdio: 'ignore' },
  );
  // sips may emit JPEG while keeping a .png path — force real PNG for App Store Connect.
  execSync(`sips -s format png ${JSON.stringify(tmp)} --out ${JSON.stringify(output)}`, {
    stdio: 'ignore',
  });
  unlinkSync(tmp);
  const ow = sipsInt('pixelWidth', output);
  const oh = sipsInt('pixelHeight', output);
  if (ow !== TARGET_W || oh !== TARGET_H) {
    throw new Error(`Unexpected output size ${ow}x${oh} for ${basename(output)}`);
  }
}

const inputs = process.argv.slice(2).map((p) => resolve(p));
if (inputs.length === 0) {
  console.error('Usage: node scripts/scale-app-store-screenshots.mjs <image...>');
  process.exit(1);
}

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const sorted = [...inputs].sort((a, b) => a.localeCompare(b));
sorted.forEach((input, i) => {
  if (!existsSync(input)) {
    console.error(`Missing: ${input}`);
    process.exit(1);
  }
  const stem = basename(input, '.png').replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
  const out = join(OUT_DIR, `${String(i + 1).padStart(2, '0')}-${stem}.png`);
  scaleOne(input, out);
  console.log(`${TARGET_W}x${TARGET_H}  ${basename(out)}`);
});

console.log(`\nDone → ${OUT_DIR}`);
