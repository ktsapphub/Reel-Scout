# IG Reel Finder - Product Requirements Document

## Original Problem Statement
Build a full-stack INTERNAL web application called "IG Reel Finder" for My Date Jar with Instagram Reels search via Apify, Cloudinary upload, and internal allowlist authentication.

## Architecture (Refactored - Mar 2026)
- **Frontend**: React + Tailwind CSS + shadcn/ui — modular components
- **Backend**: FastAPI (modular: config, models, routes, services)
- **Database**: MongoDB (audit logs, saved reels index)
- **Auth**: JWT with email allowlist
- **Integrations**: Apify (3 actors), Cloudinary

## Code Architecture
```
/app/backend/
├── server.py           # Slim app setup + router mounting
├── config.py           # Env vars, DB, Cloudinary, JWT constants
├── models.py           # All Pydantic request/response models
├── routes/
│   ├── auth.py         # /api/auth/login, /api/auth/me, /api/audit-logs
│   ├── reels.py        # /api/reels/search/start|status|stop, /api/reels/upload|export
│   └── apify.py        # /api/apify/status, /api/search-history
├── services/
│   ├── apify_service.py      # Apify API, caching, result processing
│   └── cloudinary_service.py # Cloudinary upload logic
└── tests/test_api.py

/app/frontend/src/
├── App.js                          # Router (Login, Dashboard, History, AuditLog)
├── pages/
│   ├── DashboardPage.jsx           # Orchestrator with date range picker
│   ├── HistoryPage.jsx             # Search history with carousel
│   ├── AuditLogPage.jsx            # Activity log table with filters
│   └── LoginPage.jsx
├── components/
│   ├── HelpPanel.jsx               # Help/workflow guide
│   ├── ReelCard.jsx                # Individual reel display
│   └── modals/
│       ├── ApifyStatusModal.jsx    # API connection status
│       ├── ExecutionStatusModal.jsx # Search result status
│       └── UploadProgressModal.jsx # Cloudinary upload progress
```

## What's Been Implemented
- [x] JWT authentication with allowlist
- [x] 3 search modes: Username, Profile URL (individual fields), Hashtag
- [x] Apify integration (3 actors + dual tokens)
- [x] Strict reel-only filtering for hashtag searches
- [x] Cloudinary upload with progress tracking + optimized URLs (f_auto/q_auto/vc_auto)
- [x] CSV export (with optimized Cloudinary URLs)
- [x] Cost estimator, max results selector with custom input
- [x] Stop search with partial results
- [x] Search state persistence via localStorage
- [x] Caching via Apify Key-Value store (24hr TTL)
- [x] History page with carousel preview, compare mode
- [x] API Status modal with troubleshooting guides
- [x] Help panel with workflow guide
- [x] CSV upload for bulk usernames
- [x] Profile URL tab with individual input fields + performance guidance
- [x] Previously Pulled Items section with preview carousel, retry, and load
- [x] **Date Range Picker** — shadcn Calendar range mode, shared across all search tabs
- [x] **Audit Log Viewer** — /audit-log page with table, color-coded badges, search, filter, pagination
- [x] Backend refactored into modular files
- [x] Frontend refactored into extracted components

## Prioritized Backlog
### P1
- [ ] Saved Search Presets (save and re-run common search configurations)

### P2
- [ ] Enhanced search progress indicator

## Test Credentials
- mydatejar@gmail.com / #Test1234
- joseph@centurion-pm.com / #Test1234
