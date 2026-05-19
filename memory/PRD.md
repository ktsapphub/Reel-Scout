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
├── server.py           # Slim app setup + router mounting (30 lines)
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
├── App.js                          # Router (Login, Dashboard, History)
├── pages/
│   ├── DashboardPage.jsx           # Orchestrator (~730 lines)
│   ├── HistoryPage.jsx             # Search history with carousel
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
- [x] 3 search modes: Username, Profile URL, Hashtag
- [x] Apify integration (3 actors + dual tokens)
- [x] Strict reel-only filtering for hashtag searches
- [x] Cloudinary upload with progress tracking
- [x] CSV export (with Cloudinary URLs)
- [x] Cost estimator, max results selector with custom input
- [x] Stop search with partial results
- [x] Search state persistence via localStorage
- [x] Caching via Apify Key-Value store (24hr TTL)
- [x] History page with carousel preview, compare mode
- [x] API Status modal with troubleshooting guides
- [x] Help panel with workflow guide
- [x] CSV upload for bulk usernames
- [x] Advanced filters (date, tagged posts)
- [x] **Previously Pulled Items** section with preview carousel, retry, and load
- [x] **Backend refactored** into modular files (config, models, routes, services)
- [x] **Frontend refactored** into extracted components and modals

## Prioritized Backlog
### P1
- [ ] Date range picker filter (full implementation)
- [ ] Saved Search Presets

### P2
- [ ] Audit log viewer in UI

## Test Credentials
- mydatejar@gmail.com / #Test1234
- joseph@centurion-pm.com / #Test1234
