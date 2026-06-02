# Icon previews (midnight variant)

Production icons are **not** modified by `npm run icons:preview-midnight`.

## Files

| File | Purpose |
|------|---------|
| `app-icon-midnight.png` | 1024×1024 home-screen style preview |
| `adaptive-icon-midnight.png` | Android adaptive safe-zone variant |
| `compare.html` | Side-by-side in browser (open from repo root paths below) |

Same files are copied to `frontend/public/previews/` for web parity.

## View side-by-side

```bash
open mobile/assets/previews/compare.html
# or
open frontend/public/previews/compare.html
```

## Adopt midnight (optional — backs up current first)

```bash
cd mobile
npm run icons:apply-midnight    # copies current → previews/backup-current/, then promotes midnight
npm run icons:revert-current    # restores from previews/backup-current/
```

## Manual revert

Your unchanged sources remain:

- `frontend/public/app-icon.png`
- `mobile/assets/icon.png`
- `mobile/assets/adaptive-icon.png`

Until you run `icons:apply-midnight` or copy files by hand, the app keeps the pink/purple gradient icon.
