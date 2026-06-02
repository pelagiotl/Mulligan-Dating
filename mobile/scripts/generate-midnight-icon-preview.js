#!/usr/bin/env node
/**
 * Preview-only: black background + white M + original purple/pink gradient heart.
 * Does NOT modify icon.png, app-icon.png, splash.png, or native iOS/Android assets.
 *
 * Run from mobile/: npm run icons:preview-midnight
 *
 * Outputs under mobile/assets/previews/ and frontend/public/previews/
 */

const path = require('path');
const fs = require('fs');

const mobileDir = path.join(__dirname, '..');
const repoRoot = path.join(mobileDir, '..');

const SOURCE_CANDIDATES = [
  path.join(repoRoot, 'frontend', 'public', 'app-icon.png'),
  path.join(mobileDir, 'assets', 'icon.png'),
];

const OUT_DIRS = [
  path.join(mobileDir, 'assets', 'previews'),
  path.join(repoRoot, 'frontend', 'public', 'previews'),
];

const BACKGROUND_RGB = { r: 0, g: 0, b: 0 };
const FOREGROUND_BOOST = { whiteLift: 10 };

/** Original app-icon background gradient (purple → violet → pink). */
const ORIGINAL_ICON_GRADIENT = [
  { t: 0, hex: '#667eea' },
  { t: 0.42, hex: '#764ba2' },
  { t: 0.72, hex: '#c026d3' },
  { t: 1, hex: '#f093fb' },
];
const SIZE = 1024;
const SAFE_RATIO = 0.66;
const SAFE_ZONE = Math.round(SIZE * SAFE_RATIO);

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpColor(c0, c1, t) {
  return {
    r: Math.round(lerp(c0.r, c1.r, t)),
    g: Math.round(lerp(c0.g, c1.g, t)),
    b: Math.round(lerp(c0.b, c1.b, t)),
  };
}

function originalIconGradientAt(x, y, w, h) {
  const t = Math.min(1, Math.max(0, (x / w) * 0.4 + (y / h) * 0.6));
  return gradientColorAt(ORIGINAL_ICON_GRADIENT, t);
}

function isForeground(r, g, b, a) {
  if (a < 40) return false;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;

  if (lum > 205 && sat < 0.28) return true;
  if (lum > 105 && lum < 205 && sat < 0.22) return true;
  return false;
}

function isWhiteMark(r, g, b) {
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  return lum > 198 && sat < 0.26;
}

function isHeartPixel(r, g, b, a) {
  if (a < 40 || isWhiteMark(r, g, b)) return false;
  return r > 185 && g > 130 && b > 130 && r >= g * 0.88 && g >= b * 0.78 && r < 252;
}

function isHeartRegion(x, y, bounds) {
  const pad = 2;
  return (
    x >= bounds.minX - pad &&
    x <= bounds.maxX + pad &&
    y >= bounds.minY - pad &&
    y <= bounds.maxY + pad
  );
}

function gradientColorAt(stops, t) {
  const clamped = Math.min(1, Math.max(0, t));
  let i = 0;
  while (i < stops.length - 1 && clamped > stops[i + 1].t) i += 1;
  const a = stops[i];
  const b = stops[Math.min(i + 1, stops.length - 1)];
  const span = b.t - a.t || 1;
  const local = (clamped - a.t) / span;
  return lerpColor(hexToRgb(a.hex), hexToRgb(b.hex), local);
}

function computeHeartBounds(source) {
  const { width, height } = source.bitmap;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let count = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const rgba = source.getPixelColor(x, y);
      const r = (rgba >> 24) & 0xff;
      const g = (rgba >> 16) & 0xff;
      const b = (rgba >> 8) & 0xff;
      const a = rgba & 0xff;
      if (!isHeartSeed(r, g, b, a)) continue;
      count += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (count < 12) return null;
  return {
    minX,
    minY,
    maxX,
    maxY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    w: maxX - minX + 1,
    h: maxY - minY + 1,
  };
}

function isHeartSeed(r, g, b, a) {
  if (a < 40 || isWhiteMark(r, g, b)) return false;
  return r > 200 && g > 155 && b > 155 && r >= g * 0.9 && g >= b * 0.85;
}

/** Heart interior + soft shadow pixels (not white M, not black). */
function isHeartFillCandidate(r, g, b, a) {
  if (a < 16 || isWhiteMark(r, g, b)) return false;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  if (lum < 38) return false;
  return r > 100 && g > 65 && b > 65;
}

function buildHeartMask(source, bounds) {
  const { width, height } = source.bitmap;
  const mask = new Uint8Array(width * height);
  const seeds = [];

  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      const rgba = source.getPixelColor(x, y);
      const r = (rgba >> 24) & 0xff;
      const g = (rgba >> 16) & 0xff;
      const b = (rgba >> 8) & 0xff;
      const a = rgba & 0xff;
      if (!isHeartSeed(r, g, b, a)) continue;
      seeds.push({ x, y });
    }
  }

  if (seeds.length === 0) return mask;

  const seed = seeds.reduce(
    (best, p) => {
      const score = p.y * 2 + p.x;
      return score > best.score ? { ...p, score } : best;
    },
    { x: seeds[0].x, y: seeds[0].y, score: -1 }
  );

  const queue = [seed];
  mask[seed.y * width + seed.x] = 1;

  while (queue.length > 0) {
    const { x, y } = queue.pop();
    const adjacent = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ];
    for (const [nx, ny] of adjacent) {
      if (nx < bounds.minX || nx > bounds.maxX || ny < bounds.minY || ny > bounds.maxY) continue;
      const idx = ny * width + nx;
      if (mask[idx]) continue;
      const rgba = source.getPixelColor(nx, ny);
      const r = (rgba >> 24) & 0xff;
      const g = (rgba >> 16) & 0xff;
      const b = (rgba >> 8) & 0xff;
      const a = rgba & 0xff;
      if (!isHeartFillCandidate(r, g, b, a)) continue;
      mask[idx] = 1;
      queue.push({ x: nx, y: ny });
    }
  }

  closeHeartMaskGaps(mask, width, source, bounds);
  solidFillHeartInterior(mask, width, height, source, bounds);

  return mask;
}

/**
 * Fill enclosed holes (e.g. dark shadow pixels) so the gradient has no black gaps.
 * Flood "outside" from the bounds border; anything inside not outside becomes heart.
 */
function solidFillHeartInterior(mask, width, height, source, bounds) {
  const outside = new Uint8Array(width * height);
  const queue = [];

  const trySeedOutside = (x, y) => {
    if (x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY) return;
    const idx = y * width + x;
    if (mask[idx] || outside[idx]) return;
    const rgba = source.getPixelColor(x, y);
    const r = (rgba >> 24) & 0xff;
    const g = (rgba >> 16) & 0xff;
    const b = (rgba >> 8) & 0xff;
    if (isWhiteMark(r, g, b)) return;
    outside[idx] = 1;
    queue.push({ x, y });
  };

  for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
    trySeedOutside(x, bounds.minY);
    trySeedOutside(x, bounds.maxY);
  }
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    trySeedOutside(bounds.minX, y);
    trySeedOutside(bounds.maxX, y);
  }

  while (queue.length > 0) {
    const { x, y } = queue.pop();
    const adjacent = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ];
    for (const [nx, ny] of adjacent) {
      if (nx < bounds.minX || nx > bounds.maxX || ny < bounds.minY || ny > bounds.maxY) continue;
      const idx = ny * width + nx;
      if (mask[idx] || outside[idx]) continue;
      const rgba = source.getPixelColor(nx, ny);
      const r = (rgba >> 24) & 0xff;
      const g = (rgba >> 16) & 0xff;
      const b = (rgba >> 8) & 0xff;
      if (isWhiteMark(r, g, b)) continue;
      outside[idx] = 1;
      queue.push({ x: nx, y: ny });
    }
  }

  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      const idx = y * width + x;
      if (mask[idx] || outside[idx]) continue;
      const rgba = source.getPixelColor(x, y);
      const r = (rgba >> 24) & 0xff;
      const g = (rgba >> 16) & 0xff;
      const b = (rgba >> 8) & 0xff;
      if (isWhiteMark(r, g, b) && !isEnclosedByHeartMask(mask, width, x, y, bounds)) continue;
      mask[idx] = 1;
    }
  }

  includeWhiteHeartOverlap(mask, width, source, bounds);
}

function isEnclosedByHeartMask(mask, width, x, y, bounds) {
  let neighbors = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < bounds.minX || nx > bounds.maxX || ny < bounds.minY || ny > bounds.maxY) continue;
      if (mask[ny * width + nx]) neighbors += 1;
    }
  }
  return neighbors >= 5;
}

function includeWhiteHeartOverlap(mask, width, source, bounds) {
  for (let pass = 0; pass < 3; pass += 1) {
    const snap = new Uint8Array(mask);
    let changed = false;
    for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
      for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
        const idx = y * width + x;
        if (snap[idx]) continue;
        const rgba = source.getPixelColor(x, y);
        const r = (rgba >> 24) & 0xff;
        const g = (rgba >> 16) & 0xff;
        const b = (rgba >> 8) & 0xff;
        if (!isWhiteMark(r, g, b)) continue;
        if (!isEnclosedByHeartMask(snap, width, x, y, bounds)) continue;
        mask[idx] = 1;
        changed = true;
      }
    }
    if (!changed) break;
  }
}

/** Fill interior gaps without bridging across the M (no row-span fill). */
function closeHeartMaskGaps(mask, width, source, bounds) {
  for (let pass = 0; pass < 6; pass += 1) {
    const snap = new Uint8Array(mask);
    let changed = false;
    for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
      for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
        const idx = y * width + x;
        if (snap[idx]) continue;
        const rgba = source.getPixelColor(x, y);
        const r = (rgba >> 24) & 0xff;
        const g = (rgba >> 16) & 0xff;
        const b = (rgba >> 8) & 0xff;
        if (isWhiteMark(r, g, b)) continue;
        let neighbors = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < bounds.minX || nx > bounds.maxX || ny < bounds.minY || ny > bounds.maxY) continue;
            if (snap[ny * width + nx]) neighbors += 1;
          }
        }
        if (neighbors >= 4) {
          mask[idx] = 1;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
}

function paintHeartGradient(x, y, bounds) {
  const tY = (y - bounds.minY) / Math.max(1, bounds.h - 1);
  const tX = (x - bounds.minX) / Math.max(1, bounds.w - 1);
  const t = Math.min(1, Math.max(0, tY * 0.5 + tX * 0.5));
  return gradientColorAt(ORIGINAL_ICON_GRADIENT, t);
}

function boostForegroundPixel(r, g, b) {
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  if (lum > 200 && sat < 0.28) {
    const lift = FOREGROUND_BOOST.whiteLift;
    return {
      r: Math.min(255, r + lift),
      g: Math.min(255, g + lift - 1),
      b: Math.min(255, b + lift + 2),
    };
  }
  return { r, g, b };
}

async function buildMidnightCanvas(Jimp, source) {
  const { width, height } = source.bitmap;
  const heartBounds = computeHeartBounds(source);
  const heartMask = heartBounds ? buildHeartMask(source, heartBounds) : null;
  const { r: br, g: bg, b: bb } = BACKGROUND_RGB;
  const canvas = await new Promise((resolve, reject) => {
    new Jimp(width, height, Jimp.rgbaToInt(br, bg, bb, 255), (err, image) => {
      if (err) reject(err);
      else resolve(image);
    });
  });

  canvas.scan(0, 0, width, height, function scanBg(x, y, idx) {
    let r = br;
    let g = bg;
    let b = bb;

    const mi = y * width + x;
    let paintedHeart =
      Boolean(heartMask && heartMask[mi] > 0 && heartBounds);

    if (paintedHeart) {
      const heart = paintHeartGradient(x, y, heartBounds);
      r = heart.r;
      g = heart.g;
      b = heart.b;
    } else if (heartBounds && heartMask) {
      const inHeartBox =
        x >= heartBounds.minX &&
        x <= heartBounds.maxX &&
        y >= heartBounds.minY &&
        y <= heartBounds.maxY;
      if (inHeartBox && isEnclosedByHeartMask(heartMask, width, x, y, heartBounds)) {
        const heart = paintHeartGradient(x, y, heartBounds);
        r = heart.r;
        g = heart.g;
        b = heart.b;
        paintedHeart = true;
      }
    }

    if (!paintedHeart) {
      const rgba = source.getPixelColor(x, y);
      const sr = (rgba >> 24) & 0xff;
      const sg = (rgba >> 16) & 0xff;
      const sb = (rgba >> 8) & 0xff;
      const sa = rgba & 0xff;
      if (isForeground(sr, sg, sb, sa)) {
        const boosted = boostForegroundPixel(sr, sg, sb);
        const alpha = sa / 255;
        r = Math.round(lerp(r, boosted.r, alpha));
        g = Math.round(lerp(g, boosted.g, alpha));
        b = Math.round(lerp(b, boosted.b, alpha));
      }
    }

    this.bitmap.data[idx] = r;
    this.bitmap.data[idx + 1] = g;
    this.bitmap.data[idx + 2] = b;
    this.bitmap.data[idx + 3] = 255;
  });

  return canvas;
}

function rgbaToHex(rgba) {
  const r = (rgba >> 24) & 0xff;
  const g = (rgba >> 16) & 0xff;
  const b = (rgba >> 8) & 0xff;
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

async function buildAdaptiveFromIcon(Jimp, icon) {
  const bgHex = '#000000';
  const { r: br, g: bg, b: bb } = BACKGROUND_RGB;
  const scaled = icon.clone().scaleToFit(SAFE_ZONE, SAFE_ZONE);
  const x = Math.round((SIZE - scaled.bitmap.width) / 2);
  const y = Math.round((SIZE - scaled.bitmap.height) / 2);

  const canvas = await new Promise((resolve, reject) => {
    new Jimp(SIZE, SIZE, Jimp.rgbaToInt(br, bg, bb, 255), (err, image) => {
      if (err) reject(err);
      else resolve(image);
    });
  });
  canvas.composite(scaled, x, y);
  return { image: canvas, bgHex };
}

async function main() {
  const sourcePath = SOURCE_CANDIDATES.find((p) => fs.existsSync(p));
  if (!sourcePath) {
    console.error('No source icon found. Expected one of:', SOURCE_CANDIDATES.join(', '));
    process.exit(1);
  }

  const Jimp = require('jimp');
  const source = await Jimp.read(sourcePath);
  if (source.bitmap.width !== SIZE || source.bitmap.height !== SIZE) {
    source.resize(SIZE, SIZE);
  }

  const midnightIcon = await buildMidnightCanvas(Jimp, source);
  const { image: adaptive, bgHex } = await buildAdaptiveFromIcon(Jimp, midnightIcon);

  for (const dir of OUT_DIRS) {
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(sourcePath, path.join(dir, 'app-icon-current.png'));
    await midnightIcon.writeAsync(path.join(dir, 'app-icon-midnight.png'));
    await adaptive.writeAsync(path.join(dir, 'adaptive-icon-midnight.png'));
  }

  const compareHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Mulligan icon preview — current vs midnight</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: system-ui, -apple-system, sans-serif;
      background: linear-gradient(145deg, #15102a 0%, #221a32 50%, #0f172a 100%);
      color: #e2e8f0;
      padding: 2rem 1.25rem 3rem;
    }
    h1 { font-size: 1.35rem; font-weight: 600; margin: 0 0 0.35rem; }
    p.lede { margin: 0 0 1.75rem; color: #94a3b8; max-width: 42rem; line-height: 1.5; }
    .open-link {
      display: inline-block;
      margin-bottom: 1.5rem;
      padding: 0.55rem 1rem;
      border-radius: 10px;
      background: rgba(167, 139, 250, 0.2);
      border: 1px solid rgba(167, 139, 250, 0.45);
      color: #e9d5ff;
      text-decoration: none;
      font-size: 0.9rem;
      font-weight: 600;
    }
    .open-link:hover { background: rgba(167, 139, 250, 0.32); }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1.5rem;
      max-width: 720px;
    }
    figure {
      margin: 0;
      text-align: center;
    }
    .tile {
      width: 180px;
      height: 180px;
      margin: 0 auto 0.75rem;
      border-radius: 38px;
      overflow: hidden;
      box-shadow: 0 12px 40px rgba(0,0,0,0.45);
    }
    .tile img { width: 100%; height: 100%; display: block; object-fit: cover; }
    figcaption { font-size: 0.9rem; font-weight: 600; }
    .note {
      margin-top: 2rem;
      padding: 1rem 1.15rem;
      border-radius: 12px;
      background: rgba(28, 24, 38, 0.85);
      border: 1px solid rgba(167, 139, 250, 0.25);
      max-width: 42rem;
      font-size: 0.85rem;
      line-height: 1.55;
      color: #cbd5e1;
    }
    code { font-size: 0.8em; background: rgba(0,0,0,0.35); padding: 0.12em 0.35em; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>App icon preview</h1>
  <p class="lede">Production assets unchanged. Preview: black background, white M, heart filled with the original app-icon purple→pink gradient.</p>
  <a class="open-link" href="http://127.0.0.1:8765/compare.html">Open via local server (recommended)</a>
  <div class="grid">
    <figure>
      <div class="tile"><img src="app-icon-current.png" alt="Current icon" width="180" height="180" /></div>
      <figcaption>Current (soft gradient)</figcaption>
    </figure>
    <figure>
      <div class="tile"><img src="app-icon-midnight.png" alt="Midnight preview icon" width="180" height="180" /></div>
      <figcaption>Black + gradient heart</figcaption>
    </figure>
  </div>
  <div class="note">
    <strong>In Cursor:</strong> Command Palette → <code>Simple Browser: Show</code> → paste
    <code>http://127.0.0.1:8765/compare.html</code><br />
    <strong>Terminal:</strong> <code>cd mobile && npm run icons:open-compare</code><br />
    Suggested adaptive background: <code>${bgHex}</code>
  </div>
</body>
</html>
`;

  const previewReadme = `# Icon previews (midnight variant)

Production icons are **not** modified by \`npm run icons:preview-midnight\`.

## Files

| File | Purpose |
|------|---------|
| \`app-icon-midnight.png\` | 1024×1024 home-screen style preview |
| \`adaptive-icon-midnight.png\` | Android adaptive safe-zone variant |
| \`compare.html\` | Side-by-side in browser (open from repo root paths below) |

Same files are copied to \`frontend/public/previews/\` for web parity.

## View side-by-side

\`\`\`bash
open mobile/assets/previews/compare.html
# or
open frontend/public/previews/compare.html
\`\`\`

## Adopt midnight (optional — backs up current first)

\`\`\`bash
cd mobile
npm run icons:apply-midnight    # copies current → previews/backup-current/, then promotes midnight
npm run icons:revert-current    # restores from previews/backup-current/
\`\`\`

## Manual revert

Your unchanged sources remain:

- \`frontend/public/app-icon.png\`
- \`mobile/assets/icon.png\`
- \`mobile/assets/adaptive-icon.png\`

Until you run \`icons:apply-midnight\` or copy files by hand, the app keeps the pink/purple gradient icon.
`;

  fs.writeFileSync(path.join(OUT_DIRS[0], 'compare.html'), compareHtml);
  fs.writeFileSync(path.join(OUT_DIRS[0], 'README.md'), previewReadme);
  fs.writeFileSync(path.join(OUT_DIRS[1], 'README.md'), previewReadme);

  console.log('✅ Midnight icon preview generated (production assets untouched)');
  console.log('   Source:', sourcePath);
  console.log('   →', path.join(OUT_DIRS[0], 'app-icon-midnight.png'));
  console.log('   →', path.join(OUT_DIRS[0], 'adaptive-icon-midnight.png'));
  console.log('   Adaptive bg sample:', bgHex);
  console.log('');
  console.log('   View: npm run icons:open-compare');
  console.log('   (or open http://127.0.0.1:8765/compare.html after running that command)');
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
