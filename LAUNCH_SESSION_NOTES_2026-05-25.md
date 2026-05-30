# Launch session notes — May 25, 2026

Saved from Cursor chat so you can pick up later. Covers infra, backups, and launch readiness decisions from this session.

---

## TL;DR — are we good to launch?

**Yes.** No backup/standby API server needed before launch.

| Area | Status |
|------|--------|
| Postgres | Upgraded to **Pro-4GB** (~$56/mo with storage) |
| Backend API | Upgraded to **Standard** 2GB / 1 CPU ($25/mo) |
| PITR (continuous backup) | **Enabled** — 3-day recovery window |
| Offline export | **Done** — pre-launch snapshot on **iCloud Drive** |
| Standby API (Railway/Fly) | **Not needed now** — add later before big marketing push |
| Postgres HA | **Not enabled** — optional, ~2× DB cost |

---

## Production URLs (Render)

- **API:** `https://mulligan-backend.onrender.com`
- **Web:** `https://mulligan-frontend.onrender.com`
- **Branch:** `main`

---

## Backups & recovery (what we confirmed)

### Point-in-Time Recovery (PITR)

- Render Dashboard → your Postgres DB → **Recovery**
- Message shown: *"Restore from any timestamp in the past 3 days"*
- **PITR is on** — no toggle to enable on paid instances; it's automatic
- **3 days** because Render **workspace** is **Hobby**, not because of DB tier alone
- **7-day window** requires upgrading Render **workspace** to Pro ($25/user/mo) — nice-to-have, not required for launch

### Logical export (the file you downloaded)

- **What it is:** A frozen snapshot of the entire database at export time (users, profiles, matches, messages, etc.)
- **What it is not:** A live database; Render does not auto-update it
- **Where stored:** iCloud Drive (rename suggested: `mulligan-postgres-pre-launch-2026-05-25.dir.tar.gz`)
- **When to use:**
  - Disaster recovery when you need this specific snapshot
  - Data older than 3-day PITR window
  - Cloning DB to a new instance
- **When to use PITR instead:** Recent accidental delete/drop within last 3 days — faster and more granular

### If you need to restore from the export (emergency only)

1. Create a **new** Postgres instance on Render (don't overwrite prod blindly)
2. Get its **External Database URL**
3. Extract: `tar -zxvf your-file.dir.tar.gz`
4. Restore with `pg_restore` (see [Render backup docs](https://render.com/docs/postgresql-backups))
5. Verify data, then update `DATABASE_URL` on backend

---

## Backup server ("spare car") — deferred

**Decision:** Skip for now. Launch without a standby API.

**What it would be:** Same backend code + same `DATABASE_URL`, deployed idle on Railway/Fly; failover = DNS swap on `api.yourdomain.com`.

**When to add:** After launch stable, or before paid ads / press — especially once you use a custom API domain so mobile doesn't need a new app build.

**Cost:** ~$5–25/mo idle.

---

## Recent web fixes (committed to `main`)

1. Desktop partner profile drawer clipped — portal + CSS
2. Match celebration sound on web — unlock + suppress after login
3. iPhone matches chat composer not visible — viewport/grid fixes

**Reminder:** Redeploy frontend on Render if not already done after these commits.

---

## Pre-launch checklist (remaining — not infra)

See also `PRE_LAUNCH_CHECKLIST.md` for full list. Quick items still worth doing:

- [ ] Smoke test: signup, browse, match, chat, photo upload (web + one phone)
- [ ] Confirm production env vars on Render (`JWT_SECRET`, `NODE_ENV=production`, Stripe, etc.)
- [ ] Confirm mobile `EXPO_PUBLIC_API_URL` points at production API
- [ ] Know how to redeploy backend + frontend on Render if something blips (~5 min)

---

## Useful commands

**Force match by phone (local, needs prod DB):**

```bash
cd backend
# DATABASE_URL in backend/.env must point at Render Postgres (External URL)
npm run create-match-by-phone -- +1XXXXXXXXXX +1YYYYYYYYYY
```

---

## Cost snapshot (~monthly)

| Service | Plan | ~Cost |
|---------|------|-------|
| Postgres | Pro-4GB | ~$56 |
| Backend API | Standard 2GB | ~$25 |
| Standby API | — | $0 (not set up) |
| **Total infra (no spare)** | | **~$80/mo** |

---

## Later upgrades (optional)

1. Render **workspace Pro** → 7-day PITR window
2. Custom domain **`api.mulligandating.com`** → Render backend
3. Standby API on Railway/Fly + one-page failover runbook
4. Another logical export before a big marketing push

---

## Cursor chat

This session was saved from Cursor. To find the full conversation in Cursor: open chat history for this project (May 25, 2026 — launch infra & backups).
