# iPhone 6.5" App Store screenshots (1242 × 2688)

Scaled for App Store Connect **iPhone 6.5" Display** (also valid: 1284 × 2778 portrait).

Upload these in order:

| File | Screen |
|------|--------|
| `01-login.png` | Phone login / welcome |
| `02-connect.png` | Connect landing |
| `03-match-celebration.png` | It's a Match celebration |
| `04-smart-date-ideas.png` | Smart Date Ideas planner |
| `05-date-proposal-chat.png` | Rich date proposal in chat |
| `06-truth-or-dare.png` | Truth or Dare picker |
| `07-dare.png` | Dare round |
| `08-never-have-i-ever.png` | Never Have I Ever unlock |
| `09-photo-unlock.png` | Photo unlock explainer |
| `10-mulligan-moment.png` | Mulligan Moment opener |

## Regenerate from new captures

```bash
cd mobile
node scripts/scale-app-store-screenshots.mjs /path/to/raw/screenshots/*.png
```

Output is written to this folder as `01-*.png`, `02-*.png`, … in filename sort order.
