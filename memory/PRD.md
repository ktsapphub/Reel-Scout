# IG Reel Finder - Product Requirements Document

## Original Problem Statement
Build a full-stack INTERNAL web application called "IG Reel Finder" for My Date Jar with Instagram Reels search via Apify, Cloudinary upload, and internal allowlist authentication.

## Architecture
- **Frontend**: React with Tailwind CSS, shadcn/ui components
- **Backend**: FastAPI with MongoDB
- **Authentication**: JWT with email allowlist
- **External Integrations**: Apify Actor (xMc5Ga1oCONPmWJIa for username, reGe1ST3OBgYZSsZJ for hashtag), Cloudinary

## User Personas
- Internal team members (2-3 people) for content curation from Instagram

## Core Requirements
1. **Authentication**: Allowlist-based login (mydatejar@gmail.com, joseph@centurion-pm.com)
2. **Search Methods**: Username search, Profile URL search, Hashtag search (reels only)
3. **Cost Controls**: Show estimated cost before running search
4. **Results Display**: Video player + metadata panel with pagination
5. **Bulk Actions**: Upload to Cloudinary, Export CSV (with Cloudinary URLs)
6. **Audit Logging**: Track all searches, uploads, exports
7. **Caching**: Apify Key-Value store caching to reduce costs

## What's Been Implemented (Jan 2026)
- [x] JWT-based authentication with allowlist
- [x] Login/logout functionality
- [x] Dashboard with 3 search mode tabs (Username, Profile URL, Hashtag)
- [x] Username search via Apify actor (xMc5Ga1oCONPmWJIa)
- [x] Hashtag search via Apify actor (reGe1ST3OBgYZSsZJ) - reels only filtering
- [x] Profile URL search (extracts usernames)
- [x] Cost estimator (maxResults / 1000 * $2.60)
- [x] Results display with video player and metadata
- [x] Pagination (10 results per page)
- [x] Selection checkboxes (persists across pages)
- [x] Transcript expand/collapse
- [x] Cloudinary upload with progress modal and naming convention
- [x] CSV export (conditional - only after upload complete, includes Cloudinary URLs)
- [x] De-duplication via MongoDB
- [x] Audit logging
- [x] Apify caching via Key-Value store (24hr cache)
- [x] History page to view/reload cached searches
- [x] Execution status modal with error details
- [x] Stop search button and progress indicator
- [x] Clear Results button
- [x] Help panel with tooltips and workflow guide
- [x] **localStorage persistence for results** (persists across page navigation)

## Prioritized Backlog
### P0 (Critical)
- [x] All core features implemented ✅
- [x] Search results persist when navigating between pages ✅

### P1 (Important)
- [ ] CSV import for bulk username search
- [ ] Date range picker filter (dependent on Apify actor support)
- [ ] Stop Search button UI integration with backend endpoint

### P2 (Nice to Have)
- [ ] Enhanced search progress indicator with time estimates
- [ ] Audit log viewer in UI

## Code Architecture
```
/app/
├── backend/
│   ├── .env (APIFY_TOKEN, CLOUDINARY credentials)
│   ├── requirements.txt
│   └── server.py (FastAPI with routes, services, auth)
├── frontend/
│   ├── .env (REACT_APP_BACKEND_URL)
│   ├── package.json
│   └── src/
│       ├── App.js (Router: Login, Dashboard, History)
│       └── pages/
│           ├── DashboardPage.jsx (Main search UI + localStorage persistence)
│           ├── HistoryPage.jsx (Cached searches list)
│           └── LoginPage.jsx
```

## Key API Endpoints
- `POST /api/auth/login` - JWT authentication
- `POST /api/reels/search/start` - Start Apify search
- `GET /api/reels/search/status/{run_id}` - Poll search status
- `POST /api/reels/search/stop/{run_id}` - Stop running search
- `POST /api/reels/upload` - Upload to Cloudinary
- `GET /api/reels/upload/status/{task_id}` - Poll upload status
- `POST /api/reels/export` - Generate CSV
- `GET /api/search-history` - List cached searches
- `GET /api/search-history/{cache_key}` - Load specific cached search

## Test Credentials
- User 1: mydatejar@gmail.com / #Test1234
- User 2: joseph@centurion-pm.com / #Test1234

## Next Tasks
1. CSV file upload for bulk usernames
2. Date range picker integration
3. Backend code refactoring (split server.py into modules)
