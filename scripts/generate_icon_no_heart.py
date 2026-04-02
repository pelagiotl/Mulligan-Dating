#!/usr/bin/env python3
"""Recreate app icon without the small rose heart on the M."""

from PIL import Image, ImageFilter

from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
SOURCE = _ROOT / "assets" / "source-app-icon.png"
OUTPUT = _ROOT / "assets" / "app-icon-no-heart.png"

MX0, MX1, MY0, MY1 = 245, 709, 236, 672

TARGETS = [
    (235, 194, 217),
    (235, 197, 219),
    (235, 195, 218),
    (234, 206, 223),
    (235, 199, 220),
    (235, 212, 226),
    (234, 205, 223),
]


def dist(c1, c2):
    return sum((a - b) ** 2 for a, b in zip(c1, c2)) ** 0.5


def color_seed_mask(px):
    mask = [[False] * 1024 for _ in range(1024)]
    xmin, ymax, dmax = 520, 420, 10
    for y in range(MY0, MY1 + 1):
        if y > ymax:
            continue
        for x in range(MX0, MX1 + 1):
            if x < xmin:
                continue
            r, g, b, a = px[x, y]
            if a < 200:
                continue
            c = (r, g, b)
            if min(dist(c, t) for t in TARGETS) < dmax:
                mask[y][x] = True
    return mask


def dilate_mask(mask, iterations):
    h, w = len(mask), len(mask[0])
    for _ in range(iterations):
        nxt = [row[:] for row in mask]
        for y in range(1, h - 1):
            for x in range(1, w - 1):
                if mask[y][x]:
                    nxt[y][x] = True
                    continue
                if any(mask[y + dy][x + dx] for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1))):
                    nxt[y][x] = True
        mask = nxt
    return mask


def is_neutral_serif(r, g, b):
    if min(r, g, b) < 228:
        return False
    chroma = max(r, g, b) - min(r, g, b)
    return chroma <= 7


def fill_mask_from_orig(o_px, w_px, mask, iterations=60):
    h, w = len(mask), len(mask[0])
    for _ in range(iterations):
        nxt = {}
        for y in range(1, h - 1):
            for x in range(1, w - 1):
                if not mask[y][x]:
                    continue
                rs, gs, bs = [], [], []
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        if dx == 0 and dy == 0:
                            continue
                        nx, ny = x + dx, y + dy
                        if mask[ny][nx]:
                            continue
                        r, g, b, a = o_px[nx, ny]
                        if a < 200 or not is_neutral_serif(r, g, b):
                            continue
                        rs.append(r)
                        gs.append(g)
                        bs.append(b)
                if not rs:
                    continue
                nxt[(x, y)] = (
                    int(round(sum(rs) / len(rs))),
                    int(round(sum(gs) / len(gs))),
                    int(round(sum(bs) / len(bs))),
                    w_px[x, y][3],
                )
        if not nxt:
            break
        for (x, y), v in nxt.items():
            w_px[x, y] = v

    fb = (236, 235, 235)
    for y in range(h):
        for x in range(w):
            if not mask[y][x]:
                continue
            r, g, b, a = w_px[x, y]
            chroma = max(r, g, b) - min(r, g, b)
            # Only nuke clear rose tint; keep subtle serif AA
            if chroma > 6 and (r - g) > 5:
                w_px[x, y] = (*fb, a)


def main():
    orig = Image.open(str(SOURCE)).convert("RGBA")
    o_px = orig.load()
    im = orig.copy()
    w_px = im.load()

    mask = color_seed_mask(o_px)
    mask = dilate_mask(mask, iterations=3)

    fill_mask_from_orig(o_px, w_px, mask)

    hx0, hy0, hx1, hy1 = 515, 215, 725, 435
    crop = im.crop((hx0, hy0, hx1, hy1))
    blurred = crop.filter(ImageFilter.GaussianBlur(radius=0.5))
    cpx, bpx = im.load(), blurred.load()
    for y in range(hy0, hy1):
        for x in range(hx0, hx1):
            if not mask[y][x]:
                continue
            bx, by = x - hx0, y - hy0
            br, bg, bb, _ = bpx[bx, by]
            cr, cg, cb, ca = cpx[x, y]
            cpx[x, y] = (
                int(cr * 0.78 + br * 0.22),
                int(cg * 0.78 + bg * 0.22),
                int(cb * 0.78 + bb * 0.22),
                ca,
            )

    im.save(str(OUTPUT))
    print("Wrote", OUTPUT)


if __name__ == "__main__":
    main()
