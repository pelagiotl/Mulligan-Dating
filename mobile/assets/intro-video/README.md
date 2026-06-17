# Intro video example (onboarding demo)

Bundled **real video clip** shown inline on onboarding Step 3 and in the record modal.

| File | Purpose |
|------|---------|
| `intro-example.mp4` | ~10–15s portrait clip. Replace with Luke's founder recording. |
| `demo-portrait.png` | Legacy still (used by old placeholder generator only) |

## Luke script (when you film)

> "Hey, I'm Luke. Say your name, something you love doing around Southern Oregon, and what kind of connection you're looking for. Just be yourself and keep it natural."

Save as `intro-example.mp4` (H.264, portrait, under ~15 MB). No code changes needed.

## Current placeholder

`intro-example.mp4` may still be Mixkit stock until replaced. Copy in the app references Luke — swap the file before App Store submit.

## Regenerate from stock (dev only)

```bash
cd mobile
node scripts/generate-intro-example-video.mjs
```
