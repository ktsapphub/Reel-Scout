# IG Reel Finder - Product Requirements Document

## Original Problem Statement
Build a full-stack INTERNAL web application called "IG Reel Finder" for My Date Jar with Instagram Reels search via Apify, Cloudinary upload, and internal allowlist authentication.

## Architecture
- **Frontend**: React + Tailwind CSS + shadcn/ui — modular components
- **Backend**: FastAPI (modular: config, models, routes, services)
- **Database**: MongoDB (audit logs, saved reels index)
- **Auth**: JWT with email allowlist (credentials in env vars)
- **Integrations**: Apify (3 actors), Cloudinary

## Code Architecture
```
/app/backend/
├── server.py                  # Slim app + router mounting
├── config.py                  # Env vars, DB, Cloudinary, JWT
├── models.py                  # Pydantic models
├── routes/
│   ├── auth.py                # Auth + audit logging
│   ├── reels.py               # Search, upload, export
│   ├── apify.py               # Status check, history
│   └── settings.py            # Build info, connection checks
├── services/
│   ├── apify_service.py       # Apify API, caching, result processing
│   ├── cloudinary_service.py  # Upload logic
│   ├── credentials_service.py # Encrypted DB credential overrides (v2.2.0)
│   └── health_service.py      # Connection health + validity TTL (v2.2.0)

/app/frontend/src/
├── App.js                     # Router (Login, Dashboard, History, AuditLog, Settings)
├── pages/
│   ├── DashboardPage.jsx      # Search orchestrator
│   ├── HistoryPage.jsx        # Search history
│   ├── AuditLogPage.jsx       # Activity log
│   ├── SettingsPage.jsx       # Connections & build config
│   └── LoginPage.jsx
├── components/
│   ├── HelpPanel.jsx
│   ├── ReelCard.jsx
│   └── modals/ (ApifyStatus, ExecutionStatus, UploadProgress)
```

## What's Been Implemented
- [x] JWT auth with allowlist (env vars, no hardcoded secrets)
- [x] 3 search modes: Username, Profile URL, Hashtag
- [x] Apify integration (3 actors + dual tokens, strict reel filtering)
- [x] Cloudinary upload + optimized URLs (f_auto/q_auto/vc_auto)
- [x] CSV export with optimized Cloudinary URLs
- [x] Date Range Picker (shared across all search tabs)
- [x] Audit Log Viewer (/audit-log)
- [x] Previously Pulled Items (preview, retry, load)
- [x] **Settings Page** — /settings with:
  - Service connection verification (Apify, Cloudinary, MongoDB)
  - "Verified X ago" timestamps with stale indicator (>5min)
  - Individual + bulk "Verify All" connection checks
  - Build info (v2.2.0, tech stack, actor IDs, features)
- [x] **(v2.2.0 — 2026-05-26) Credential Management & Validity TTL**:
  - Per-connection "Manage credentials" panel — masked display, Reveal/Edit/Save/Reset
  - Live API validation before persisting any update (rejects invalid tokens with explicit error)
  - DB-backed override (Fernet-encrypted, keyed off JWT_SECRET via PBKDF2) — survives restarts
  - Runtime cloudinary.config() re-init on credential change — no restart needed
  - "Valid for Xm Ys" countdown pill per service (Apify 60min, Cloudinary 60min, MongoDB 30min)
  - Health TTL persisted in `connection_health` collection — countdown survives page refresh
  - MongoDB URL shown read-only (changing it at runtime would disconnect the running app)
  - Audit logs for credential_updated / credential_update_rejected / credential_reset
- [x] Code quality: SHA256, useCallback/useMemo, extracted helpers, get_runtime_value() pattern

## Prioritized Backlog
### P1
- [ ] Saved Search Presets

### P2
- [ ] Enhanced search progress indicator

## Test Credentials
- mydatejar@gmail.com / #Test1234
- joseph@centurion-pm.com / #Test1234
