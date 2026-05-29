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
- [x] **(v2.6.7 — 2026-05-29) Post URL direct lookup (4th search mode)**:
  - **New search type `"post_url"`** in `SearchRequest` (backend `models.py`) — accepts up to 10 direct reel/post URLs.
  - **Backend `_build_post_url_input` (`routes/reels.py`)** — uses `apify~instagram-reel-scraper` actor with `directUrls` payload; cache-keyed by sorted URL set; auto-routed to fast-sync path. Server-side normalization + regex validation; structured error response on bad inputs.
  - **Frontend new "Post URL" tab** (`SearchForm.jsx`) — Film icon, URL counter (n/10), inline validation indicators (green ✓ / red ⚠), Add URL & Clear All controls, emerald callout explaining direct-lookup behavior.
  - **New `validateInstagramPostUrl` + `MAX_POST_URLS`** in `instagramValidator.js` — regex matches `/p/`, `/reel/`, `/reels/`, `/tv/` paths.
  - Date Range picker hidden on Post URL tab (date filtering meaningless for exact-URL lookups).
  - `payload.max_results` auto-set to URL count for Post URL searches; preset capture/apply + Restart button include `postUrls` state.
  - Tested: backend validations (bad URLs / >10 / empty) all return correct structured errors; frontend tab renders with counter, validators, and callouts.
- [x] **(v2.6.6 — 2026-05-29) Instagram handle validation + date range fixes**:
  - **New `instagramValidator.js` + `HandleValidityIndicator.jsx`** — every Username/Profile URL input shows a green ✓ checkmark when the format is valid, red ⚠ icon when invalid (with tooltip explaining why). Input border colors match. Rules: 1–30 chars, `[A-Za-z0-9._]` only, no consecutive periods, no leading/trailing periods, rejects Instagram reserved keywords (`p`, `reel`, `stories`, etc.).
  - **Search submission blocked** if any handle is invalid — toast names the offending field.
  - **Date Range picker hidden** on Profile URL tab — only shows for Username + Hashtag searches (matches the underlying actor's behavior).
  - **Backend post-filter by timestamp** in `process_apify_results` — `only_posts_newer_than`/`only_posts_older_than` are now enforced server-side regardless of whether the Apify actor honors them. Date filters threaded through `active_runs` for async path.
  - URL extraction in validator handles both raw usernames and `https://instagram.com/{user}` formats.
- [x] **(v2.6.5 — 2026-05-29) Restart button next to Run Search**:
  - **New "Restart" button** in `SearchForm.jsx` appears immediately left of the "Run Search" button when there's anything to clear (existing results OR any form field filled).
  - **`handleRestart` in `DashboardPage.jsx`** clears: results, selectedIds, uploadedReelIds, expandedTranscripts, currentPage, message, usernames, profileUrls, hashtagInput, maxResults (back to 25), includeTaggedPosts, dateRange.
  - Toast confirmation "Cleared — ready for a new search" + smooth scroll to top.
  - Hides automatically once the form is empty.
- [x] **(v2.6.4 — 2026-05-29) History page · upload + export from previously pulled searches**:
  - **New `ReelStatusBadges.jsx`** — overlay green ☁ Cloudinary + blue 📄 Exported badges on reel thumbnails so users can see at a glance which reels were already uploaded or downloaded.
  - **New `HistoryActionBar.jsx`** — bulk-action bar with "Select all", "Select not-yet-uploaded", reel counter, and two CTAs: green "Upload to Cloudinary" + blue "Export CSV". Calls the existing `/api/reels/upload` and `/api/reels/export` endpoints with the selected reels.
  - **Embedded in History row & Expanded modal** — every cached search shows the action bar above its inline preview carousel and inside the full-screen modal.
  - **Per-search summary badges** — header now shows "✓ N uploaded" + "N exported" pills (from new `uploaded_count` / `exported_count` fields on `/api/search-history`).
  - **Backend**: `/api/search-history` aggregates `uploaded_count` + `exported_count` per cache entry; `/api/search-history/{cache_key}` enriches each reel with `cloudinary_url`, `cloudinary_public_id`, `uploaded_at`, `exported_at` from `saved_reels` DB; `/api/reels/export` now writes `exported_at` + `exported_by` to `saved_reels` (upserts new rows for reels not previously saved).
  - Tested end-to-end via curl (`uploaded_count` & `exported_count` correctly aggregated) + screenshot (selection + badges + action bars all render).
- [x] **(v2.6.3 — 2026-05-29) Settings page deep redo**:
  - **New `ApifyConnectionGuide.jsx`** — top card explaining 3 Apify connection methods (Fast Sync, Async Run+Poll, Webhooks) with `in use for small queries` badge on Fast Sync, latency expectations, docs links, and a "For best performance" callout.
  - **New `ErrorResolutionPanel.jsx`** — pattern-matches connection errors (401/403/timeout/rate-limit/missing-creds) to specific resolution steps with one-click CTAs (Apify Console, Cloudinary Console, status pages). Falls back to a generic panel with retry for unmatched errors.
  - **Prominent connection lifetime** — `ValidityPill` "Valid for 59m 56s" with animated progress bar, visible at the top of each connection card.
  - **Visible version badge `v2.6.3`** in Settings header → acts as a cache buster signal so users know they have the latest build.
  - **`APP_VERSION` bumped** in `routes/settings.py` (2.2.0 → 2.6.3) + `BUILD_DATE` updated.
- [x] **(v2.6.2 — 2026-05-29) Settings UI revamp + Token Expiry tracking**:
  - **Always-visible inline inputs** in `CredentialRow.jsx` — no "Edit" click needed. Each credential row shows: current masked value + reveal eye, paste-new-value input + show/hide eye, inline Save button.
  - **Apify token expiry**: optional date picker per Apify credential. Stored in `service_credentials.expires_at`. Apify's API does NOT expose token expiry (verified against their docs), so user enters the date they set in Apify Console.
  - **Expiry countdown badges**: green ("Expires in 87 days · Mar 15, 2026") → amber (≤30 days) → red (≤7 days or expired)
  - **Cloudinary**: no expiry field (per user preference — Cloudinary keys don't expire)
  - **Backend**: `EDITABLE_CREDENTIALS` now has `supports_expiry` flag; `save_override` accepts optional `expires_at`; `UpdateCredentialRequest` model + `get_credential_metadata` return the expiry. Empty string `""` clears the previous expiry.
  - Removed two-step Edit flow → single-click save UX. Existing tokens preserved.
- [x] **(v2.6.1 — 2026-05-27) Bug fix — Cloudinary upload false-failure & CSV gate**:
  - **Recovery in `cloudinary_service.upload_reel_to_cloudinary`** — when `cloudinary.uploader.upload` throws (e.g. response timeout after the asset was already received), probe `cloudinary.api.resource(public_id)` and treat as success if the asset exists. Persists to `saved_reels` with `recovered: true` flag.
  - **DB write isolated** — `saved_reels` upsert failures no longer mark uploads as failed (logged as warnings; Cloudinary is the source of truth)
  - **Export enrichment in `/api/reels/export`** — missing `cloudinary_url` is filled from `saved_reels` collection by `reel_url`. Recovered count logged
  - **Frontend gate relaxed** — Export CSV button now shows whenever reels are selected (no longer hidden until something is uploaded). Toast tells user how many URLs were recovered from DB
- [x] **(v2.6.0 — 2026-05-27) P1 — Saved Search Presets**:
  - Per-user CRUD via `routes/presets.py` (`GET/POST /api/presets`, `DELETE /api/presets/{id}`)
  - MongoDB `search_presets` collection (id, user_email, name, config, created_at, updated_at)
  - Limits: 60-char name, 50 presets per user, name uniqueness per user
  - Frontend `<PresetMenu>` dropdown in SearchForm header — shows count badge, type icon, "X results" line
  - "Save current as preset…" dialog captures search type, inputs, max results, date range, tagged-posts
  - Hover-to-reveal delete button per row; click row to apply preset back to the form
  - Audited as `preset_created` / `preset_deleted`
- [x] **(v2.5.0 — 2026-05-26) P2 + P3 Polish**:
  - **Better search progress** (`/components/dashboard/SearchProgress.jsx`) — 4-stage timeline (Starting → Scraping → Filtering → Complete), live "discovered" count, ETA, stage subtitle (e.g. "Sifting through 47 items"), animated active-stage ring
  - **Header health dot** (`/components/HealthDot.jsx`) — polls `/api/settings/health-status` every 60s on Dashboard header. Colored dot + per-service indicators (`apify:✓ · cloudinary:✓ · mongodb:✓`). Green/amber/red based on connection state; click navigates to Settings
  - **Always-visible credentials** + **Eye reveal in view mode** (`/api/settings/credentials/{key}/reveal` audit-logged, 15s auto-hide)
  - **Prominent "Re-verify" button** on each connection card
- [x] **(v2.4.0 — 2026-05-26) Sync (fast path) for small searches**:
  - For single-target searches with `max_results ≤ 25` (single username, single URL, or any hashtag), the backend now uses Apify's `run-sync-get-dataset-items` endpoint — single round-trip, no actor cold-start gap, no polling overhead
  - Returns `status="CACHED"` with `run_id=sync_...` — uses existing frontend cache rendering path (zero UI changes)
  - On timeout/error/non-list payload, transparently falls back to the existing async path
  - Results are written to the regular Apify KV cache so subsequent identical searches are instant
  - Audited as `search_sync` action
  - Configurable via `SYNC_PATH_MAX_RESULTS=25` and `SYNC_PATH_TIMEOUT_SEC=90` in `routes/reels.py`
- [x] **(v2.3.0 — 2026-05-26) P0 Refactor — modularization**:
  - Extracted `useSearchPolling` hook + `<SearchForm>` + `<ResultsGrid>` from `DashboardPage.jsx` (805 → 468 lines)
  - Extracted `<ValidityPill>`, `<CredentialRow>`, `<ConnectionCard>`, `<MongoCredentialView>` from `SettingsPage.jsx` (704 → 407 lines)
  - Added `lib/safeStorage.js` (try/catch wrapper) + cross-tab logout listener in `App.js`
  - Backend `routes/reels.py`: extracted `_resolve_search_input`, `_maybe_return_cached`, `_token_for_search`, `_build_cached_status_response`, `_compute_progress`, `_fetch_items_processed` — `start_search` & `get_search_status` are now ~30 lines each
  - Removed stray `console.error`; replaced all raw `localStorage.*` calls with safe wrappers
  - testing_agent_v3_fork verified: 39/39 backend tests pass, 95% frontend (2 low-priority non-blocking concerns)

## Prioritized Backlog
### P1
- [x] Saved Search Presets — shipped 2026-05-27

### P2
- [ ] Final visual smoke-test of `SearchProgress.jsx` (4-stage timeline) — pending valid Apify token to trigger a real search

### P3
- [ ] Rename / edit existing presets (currently must delete + re-save)
- [ ] Preset sharing across users (currently scoped per user_email)

## Test Credentials
- mydatejar@gmail.com / #Test1234
- joseph@centurion-pm.com / #Test1234
