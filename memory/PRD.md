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
├── server.py                  # Slim app + router mounting + startup hook
├── config.py                  # Env vars, DB, JWT, runtime credential container
├── models.py                  # Pydantic models
├── routes/
│   ├── auth.py                # Auth + audit logging
│   ├── reels.py               # Search (refactored with helper extraction), upload, export
│   ├── apify.py               # Status check + health recording
│   └── settings.py            # Build info, connection checks, credentials, health TTL
├── services/
│   ├── apify_service.py       # Apify API, caching, result processing
│   ├── cloudinary_service.py  # Upload logic
│   ├── credentials_service.py # Encrypted DB credential overrides (v2.2.0)
│   └── health_service.py      # Connection health + validity TTL (v2.2.0)

/app/frontend/src/
├── App.js                     # Router + safeStorage wrapper + cross-tab logout (v2.3.0)
├── lib/safeStorage.js         # Safe localStorage with try/catch (v2.3.0)
├── hooks/useSearchPolling.js  # Polling hook (v2.3.0 — extracted from DashboardPage)
├── pages/                     # Slim orchestrators
│   ├── DashboardPage.jsx      # 805 -> 468 lines after extraction
│   ├── HistoryPage.jsx
│   ├── AuditLogPage.jsx
│   ├── SettingsPage.jsx       # 704 -> 407 lines after extraction
│   └── LoginPage.jsx
├── components/
│   ├── HelpPanel.jsx
│   ├── ReelCard.jsx
│   ├── modals/                # ApifyStatus, ExecutionStatus, UploadProgress
│   ├── dashboard/             # SearchForm.jsx, ResultsGrid.jsx (v2.3.0)
│   └── settings/              # ValidityPill, CredentialRow, ConnectionCard, MongoCredentialView (v2.3.0)
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
- [x] **(v2.3.0 — 2026-05-26) P0 Refactor — modularization**:
  - Extracted `useSearchPolling` hook + `<SearchForm>` + `<ResultsGrid>` from `DashboardPage.jsx` (805 → 468 lines)
  - Extracted `<ValidityPill>`, `<CredentialRow>`, `<ConnectionCard>`, `<MongoCredentialView>` from `SettingsPage.jsx` (704 → 407 lines)
  - Added `lib/safeStorage.js` (try/catch wrapper) + cross-tab logout listener in `App.js`
  - Backend `routes/reels.py`: extracted `_resolve_search_input`, `_maybe_return_cached`, `_token_for_search`, `_build_cached_status_response`, `_compute_progress`, `_fetch_items_processed` — `start_search` & `get_search_status` are now ~30 lines each
  - Removed stray `console.error`; replaced all raw `localStorage.*` calls with safe wrappers
  - testing_agent_v3_fork verified: 39/39 backend tests pass, 95% frontend (2 low-priority non-blocking concerns)

## Prioritized Backlog
### P1
- [ ] Saved Search Presets

### P2
- [ ] Enhanced search progress indicator

## Test Credentials
- mydatejar@gmail.com / #Test1234
- joseph@centurion-pm.com / #Test1234
