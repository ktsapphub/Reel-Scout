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
- [x] **(v2.6.14 — 2026-02 fork) "Resume / Re-run" search button on History page**:
  - **Backend `save_to_cache(cache_key, results, search_config=None)`** now also persists the original `search_config` (search_type, usernames/urls/post_urls/hashtag, max_results, date filters, include_tagged_posts) alongside cached results. Three call sites updated: sync path, async completion (`get_search_status`), and `stop_search` — all reuse `active_runs[run_id]["search_config"]` so aborted runs keep their resume metadata.
  - **`GET /api/search-history`** now exposes `search_config` per entry plus an `is_partial` heuristic (`results_count < max_results` for username/hashtag rows).
  - **`_derive_search_term`** prefers stored `search_config` for stable display (`@nasa, @natgeo (+2 more)` for usernames, `#travel` for hashtags, `N post URLs` for post-URL searches).
  - **Frontend**: New "Resume" / "Re-run" button per history row. **Resume** (amber-ringed) when partial; **Re-run** (slate) when complete. On click it navigates to Dashboard with `location.state.resumeConfig`, which prefills SearchForm and bumps `max_results` by +25 (capped at 100). A "Partial (N/M)" badge marks aborted rows. Toast confirms "Resuming search with max_results = X (was Y)". User clicks Run Search to start the new search.
  - Legacy entries cached before v2.6.14 have no `search_config` — the Resume button is hidden for them (graceful degradation).
  - Verified via inline pytest of `build_search_config` + `_derive_search_term` (3+3 assertions pass). Versions bumped to 2.6.13 (frontend Settings) and 2.6.13 (backend).
- [x] **(v2.6.13 — 2026-02 fork) Partial-result upload + export verified end-to-end**:
  - Confirmed via pytest (`/app/backend/tests/test_iter13_partial_upload_export.py`) that a partial reel returned by `POST /api/reels/search/stop/{run_id}` flows through `POST /api/reels/upload` (200 OK, completed=1, real Cloudinary URL) and `POST /api/reels/export` (200, text/csv with reel_url + cloudinary_url). **There is no "search must be COMPLETED" gate anywhere** in the backend or frontend.
  - Frontend wiring: `useSearchPolling.stopSearch` returns `partial_results`; `DashboardPage.handleStopSearch` calls `setResults(partial_results)`; `ResultsGrid` Upload/Export buttons are disabled **only** on empty selection.
  - `SearchProgress.jsx` 4-stage timeline (Starting → Scraping → Filtering → Complete) has full data-testid coverage (`search-progress`, `stage-{starting,scraping,filtering,complete}`, `items-discovered`) with animate-spin on active stage and emerald connector between completed stages. Stage transitions live-track `progress`/`items_processed`.
  - Backend `stop_search` already warms the History cache via `save_to_cache(cache_key, partial_results)` so aborted runs are recoverable from the "Previously Pulled" section without re-spending Apify credits.
- [x] **(v2.6.12 — 2026-02 fork) "Test all credentials" one-click button**:
  - **New `POST /api/settings/credentials/test-all`** — runs every editable credential's live validity check in parallel (`asyncio.gather`) and returns a consolidated result with passed/failed/skipped counts + per-credential details (account username, cloud_name, error messages).
  - **New blue-outline "Test all credentials" button** next to "Verify All Connections" on the Settings page.
  - **Consolidated results panel** appears below the header — green border when all pass, red when any fail, slate when nothing tested. Each row shows the credential label, service, valid/invalid/skipped badge, and live details (e.g., "Account: mydatejar" or "Apify validation failed (HTTP 401)"). Dismissable via X button.
  - Audit-logged as `credentials_tested_all` with total/passed/failed counts.
  - Verified via curl: 5 credentials tested in parallel; APIFY_TOKEN correctly flagged invalid, other 4 valid. Version badge bumped to v2.6.12.
- [x] **(v2.6.11 — 2026-02 fork) Settings — live verify-on-mount + Used-by mapping + Test now + ESLint fix**:
  - **Live verify-on-mount**: When health-status cache is stale (>5min) or failed, Settings auto-triggers fresh checks.
  - **"Used by" badges** on each credential row (Hashtag Token → Hashtag Scraper, Username Token → Profile Scraper + Reel Scraper, etc.).
  - **Per-credential "Test now" button** → `POST /api/settings/credentials/{key}/test` returns valid/invalid + connection info, surfaced via sonner toast.
  - **Backend cache fix**: `stop_search` now calls `save_to_cache`; `get_search_status` regenerates cache key from run meta when `run_info` is empty.
  - **ESLint blocker fix**: Removed `react-hooks/set-state-in-effect` disable comments referencing a rule not in local CRA's plugin — build is now clean.
  - **Version badge** bumped to v2.6.11.
  - testing_agent_v3_fork: Frontend 100%, Backend 92% (4 backend "failures" all attributable to a stale `.env` APIFY_TOKEN; not code bugs — app correctly surfaces invalid tokens with the clean error card + how-to-resolve steps).
- [x] **(v2.6.10 — 2026-05-29) Active search-method indicator**:
  - **New `<active-search-method-banner>`** below the tabs — blue box with the method icon in a 7×7 blue badge + uppercase "CURRENTLY SEARCHING BY" label + method name + plain-language description ("Pulling reels from one or more @handles", "Looking up specific reel/post URLs (max 10)", etc.).
  - **Active tab styling upgraded**: solid `bg-blue-600` + `text-white` + `shadow-md` + `font-semibold` + `ring-2 ring-blue-400 ring-offset-1` — completely unambiguous which tab is in use. Inactive tabs get `text-slate-600` with a subtle hover.
  - TabsList padded to `p-1.5 rounded-xl gap-1` so the active tab "lifts" out visually.
  - Verified across all 4 search modes (Username / Profile URL / Post URL / Hashtag) — banner + tab highlight update instantly on click.
- [x] **(v2.6.9 — 2026-05-29) Post URL video playback + better field mapping**:
  - **New `/api/reels/video-proxy`** endpoint streams Instagram CDN videos through our backend with **full Range/206 Partial Content support** (verified `bytes=0-1023` → 206 with `content-range: bytes 0-1023/7369825`). Forwards browser `Range` headers upstream, mirrors `content-length`/`content-range`/`accept-ranges` so HTML5 `<video>` seeking + progressive playback work. Sends a desktop Chrome User-Agent + `Referer: https://www.instagram.com/` so Instagram's CDN doesn't reject the request.
  - **Auto-wraps Instagram CDN URLs** in `_build_reel` — only the `cdninstagram.com`/`fbcdn.net` hosts get proxied. Apify KV-store URLs (from the username scraper) and Cloudinary URLs pass through unchanged.
  - **Better field mapping** in `_build_reel` — prefers Apify's `downloadedVideoUrl` (persistent), falls back to proxified raw `videoUrl`. Sets `original_video_url` separately so the unproxied URL is still available for downstream use.
  - Tested via curl: full mp4 download is 7.37 MB with valid `ftypisom`+`avc1` (H.264). Real-world browsers play this; headless Chromium lacks proprietary codecs so it can't be smoke-tested visually.
- [x] **(v2.6.8 — 2026-05-29) Bug fix · Post URL 500 errors + better error surfacing**:
  - **Root cause**: `_build_post_url_input` called `generate_cache_key()` with an unsupported `post_urls=` kwarg → uncaught `TypeError` → HTTP 500. Plus the wrong Apify actor was selected (`instagram-reel-scraper` requires `username`, not `directUrls`).
  - **Fix 1**: `generate_cache_key()` now accepts `post_urls` and hashes the sorted URL set.
  - **Fix 2**: Switched the actor from `apify~instagram-reel-scraper` → **`apify~instagram-scraper`** (the general actor) — verified live to accept `directUrls` and return full reel metadata for the user's exact URL.
  - **Fix 3**: Wrapped the entire `start_search` body in a top-level try/except so ANY future exception becomes a structured `ExecutionError` response (with error_type, error_code, possible_cause, suggested_solution, technical_details) instead of a generic 500. Sync path errors now log + fall back to async instead of bubbling.
  - **Fix 4**: Replaced `raise HTTPException(500, ...)` for missing tokens with structured `ExecutionError` responses pointing the user to Settings to paste their token.
  - **Frontend fix**: Reset `searching` flag on `status === "ERROR"` and `status === "NOT_SUPPORTED"` so the UI doesn't get stuck.
  - **Live verified**: `https://www.instagram.com/reel/DY7Nv_GR2X1/` now returns `@theexcursiondoctor` reel (39.9s) in 3s via the fast-sync path.
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
