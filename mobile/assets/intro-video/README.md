# Intro video example (onboarding demo)

Bundled **real video clip** shown inline on onboarding Step 3 and in the record modal.

| File | Purpose |
|------|---------|
| `intro-example.mp4` | ~10–15s landscape clip (1080×720, same framing as Luke's recording). |
| `demo-portrait.png` | Legacy still (used by old placeholder generator only) |

## Luke script (when you film)

> "Hey, I'm Luke. Say your name, something you love doing around Southern Oregon, and what kind of connection you're looking for. Just be yourself and keep it natural."

Save as `intro-example.mp4` (H.264, portrait, under ~15 MB). No code changes needed.

## Current clip

`intro-example.mp4` is Luke's founder recording (June 2026, ~14s portrait). Re-export with the steps below if you re-film.

## Replace later

```bash
cd mobile
node scripts/generate-intro-example-video.mjs
```
