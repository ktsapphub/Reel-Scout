# IG Reel Finder - Product Requirements Document

## Original Problem Statement
Build a full-stack INTERNAL web application called "IG Reel Finder" for My Date Jar with Instagram Reels search via Apify, Cloudinary upload, and internal allowlist authentication.

## Architecture (Refactored - Mar 2026)
- **Frontend**: React + Tailwind CSS + shadcn/ui — modular components
- **Backend**: FastAPI (modular: config, models, routes, services)
- **Database**: MongoDB (audit logs, saved reels index)
- **Auth**: JWT with email allowlist (credentials in env vars)
- **Integrations**: Apify (3 actors), Cloudinary

## Code Architecture
```
/app/backend/
├── server.py           # Slim app setup + router mounting
├── config.py           # Env vars, DB, Cloudinary, JWT constants (no hardcoded secrets)
├── models.py           # All Pydantic request/response models
├── routes/
│   ├── auth.py         # Auth routes + safe audit logging (no mutable defaults)
│   ├── reels.py        # Search (3 builder helpers), upload, export (Cloudinary URL optimization)
│   └── apify.py        # Status check (_check_token/_check_actor helpers), history
├── services/
│   ├── apify_service.py      # SHA256 cache keys, 6 extraction helpers for process_apify_results
│   └── cloudinary_service.py # Cloudinary upload logic
└── tests/test_api.py

/app/frontend/src/
├── App.js                          # Router (Login, Dashboard, History, AuditLog)
├── pages/
│   ├── DashboardPage.jsx           # Orchestrator (useCallback/useMemo for hook deps)
│   ├── HistoryPage.jsx             # Search history (useCallback for fetchHistory)
│   ├── AuditLogPage.jsx            # Activity log (useCallback for fetchLogs)
│   └── LoginPage.jsx
├── components/
│   ├── HelpPanel.jsx
│   ├── ReelCard.jsx                # Stable keys for dynamic lists
│   └── modals/
│       ├── ApifyStatusModal.jsx
│       ├── ExecutionStatusModal.jsx
│       └── UploadProgressModal.jsx
```

## What's Been Implemented
- [x] JWT authentication with allowlist (secrets in env vars)
- [x] 3 search modes: Username, Profile URL (individual fields), Hashtag
- [x] Apify integration (3 actors + dual tokens)
- [x] Strict reel-only filtering for hashtag searches
- [x] Cloudinary upload with progress tracking + optimized URLs (f_auto/q_auto/vc_auto)
- [x] CSV export with optimized Cloudinary URLs
- [x] Date Range Picker (shadcn Calendar, range mode, shared across tabs)
- [x] Audit Log Viewer (/audit-log with table, filters, pagination)
- [x] Previously Pulled Items with preview carousel, retry, and load
- [x] Cost estimator, max results selector, stop search, partial results
- [x] Search state persistence via localStorage
- [x] Caching via Apify Key-Value store (SHA256 keys, 24hr TTL)
- [x] History page, API Status modal, Help panel, CSV bulk upload
- [x] **Code quality review applied**: no hardcoded secrets, no mutable defaults, SHA256 over MD5, low-complexity helpers, useCallback/useMemo for React hooks, stable keys for dynamic lists

## Prioritized Backlog
### P1
- [ ] Saved Search Presets (save and re-run common search configurations)

### P2
- [ ] Enhanced search progress indicator

## Test Credentials
- mydatejar@gmail.com / #Test1234
- joseph@centurion-pm.com / #Test1234
