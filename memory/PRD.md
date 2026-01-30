# IG Reel Finder - Product Requirements Document

## Original Problem Statement
Build a full-stack INTERNAL web application called "IG Reel Finder" for My Date Jar with Instagram Reels search via Apify, Cloudinary upload, and internal allowlist authentication.

## Architecture
- **Frontend**: React with Tailwind CSS, shadcn/ui components
- **Backend**: FastAPI with MongoDB
- **Authentication**: JWT with email allowlist
- **External Integrations**: Apify Actor (xMc5Ga1oCONPmWJIa), Cloudinary

## User Personas
- Internal team members (2-3 people) for content curation from Instagram

## Core Requirements
1. **Authentication**: Allowlist-based login (mydatejar@gmail.com)
2. **Search Methods**: Username search (working), URL search (actor limitation), Hashtag search (actor limitation)
3. **Cost Controls**: Show estimated cost before running search
4. **Results Display**: Video player + metadata panel with pagination
5. **Bulk Actions**: Upload to Cloudinary, Export CSV
6. **Audit Logging**: Track all searches, uploads, exports

## What's Been Implemented (Jan 2026)
- [x] JWT-based authentication with allowlist
- [x] Login/logout functionality
- [x] Dashboard with 3 search mode tabs
- [x] Username search via Apify actor
- [x] Graceful degradation messages for URL/Hashtag modes
- [x] Cost estimator (maxResults / 1000 * $2.60)
- [x] Results display with video player and metadata
- [x] Pagination (10 results per page)
- [x] Selection checkboxes (persists across pages)
- [x] Transcript expand/collapse
- [x] Cloudinary upload with naming convention
- [x] CSV export with all required columns
- [x] De-duplication via MongoDB
- [x] Audit logging

## Prioritized Backlog
### P0 (Critical)
- All core features implemented ✅

### P1 (Important)
- CSV import for bulk username search
- Date/time range filter for posts (if Apify supports)

### P2 (Nice to Have)
- Add second Apify actor for hashtag search
- Add second Apify actor for direct URL search
- Audit log viewer in UI

## Next Tasks
1. Add CSV file upload for bulk usernames
2. Integrate hashtag-capable Apify actor
3. Add date range filters
