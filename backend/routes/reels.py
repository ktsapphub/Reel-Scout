from fastapi import APIRouter, HTTPException, Depends, Query, Request
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
import httpx
import re
import csv
import io
import base64
from urllib.parse import urlparse
from fastapi.responses import StreamingResponse

from config import (
    logger, get_runtime_value,
    APIFY_ACTOR_ID, APIFY_REEL_SCRAPER_ID, APIFY_GENERAL_SCRAPER_ID, APIFY_HASHTAG_ACTOR_ID
)
from models import (
    SearchRequest, ReelResult,
    UploadRequest, UploadProgressItem, UploadResponse,
    ExportRequest, ExecutionError, StartSearchResponse, SearchStatusResponse
)
from routes.auth import get_current_user, log_audit
from services.apify_service import (
    active_runs, generate_cache_key, get_cached_results,
    save_to_cache, process_apify_results, run_actor_sync,
    build_search_config,
)
from services.cloudinary_service import upload_reel_to_cloudinary

router = APIRouter(prefix="/api")


# --- Video proxy ---
# Instagram CDN URLs have short-lived signed tokens + CORS restrictions that
# block playback in <video> elements. We proxy the bytes through our server so
# the frontend can play them transparently. Apify key-value-store URLs and our
# own Cloudinary URLs already work cross-origin, so we leave those untouched.

INSTAGRAM_CDN_HOSTS = ("cdninstagram.com", "fbcdn.net")


def _is_instagram_cdn_url(url: str) -> bool:
    if not url or not url.startswith("http"):
        return False
    try:
        host = urlparse(url).hostname or ""
        return any(h in host for h in INSTAGRAM_CDN_HOSTS)
    except Exception:
        return False


def proxify_video_url(url: str) -> str:
    """Wrap Instagram CDN URLs with our proxy endpoint; pass everything else through."""
    if not _is_instagram_cdn_url(url):
        return url
    encoded = base64.urlsafe_b64encode(url.encode()).decode().rstrip("=")
    return f"/api/reels/video-proxy?u={encoded}"


@router.get("/reels/video-proxy")
async def video_proxy(
    request: Request,
    u: str = Query(..., description="Base64-url-safe encoded video URL"),
):
    """Stream an Instagram CDN video through our backend with full Range support.

    Forwards the ``Range`` header upstream and mirrors the upstream status
    (200 vs 206), ``Content-Length``, ``Content-Range`` and ``Accept-Ranges``
    headers — required for HTML5 ``<video>`` seeking + progressive playback.
    """
    try:
        padding = "=" * (-len(u) % 4)
        url = base64.urlsafe_b64decode(u + padding).decode()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid encoded URL")

    if not _is_instagram_cdn_url(url):
        raise HTTPException(status_code=400, detail="Only Instagram CDN URLs may be proxied")

    upstream_headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "Referer": "https://www.instagram.com/",
        "Accept": "*/*",
        "Accept-Language": "en-US,en;q=0.9",
    }
    range_header = request.headers.get("range")
    if range_header:
        upstream_headers["Range"] = range_header

    client = httpx.AsyncClient(timeout=httpx.Timeout(60.0, read=180.0), follow_redirects=True)
    upstream = await client.send(client.build_request("GET", url, headers=upstream_headers), stream=True)

    if upstream.status_code >= 400:
        body = (await upstream.aread())[:300]
        await upstream.aclose()
        await client.aclose()
        logger.warning(f"Video proxy upstream {upstream.status_code} for {url[:80]}: {body!r}")
        raise HTTPException(status_code=502, detail=f"Upstream {upstream.status_code}")

    response_headers = {
        "Content-Type": upstream.headers.get("content-type", "video/mp4"),
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
    }
    for k in ("content-length", "content-range"):
        if k in upstream.headers:
            response_headers[k.title()] = upstream.headers[k]

    async def stream():
        try:
            async for chunk in upstream.aiter_bytes(chunk_size=64 * 1024):
                yield chunk
        finally:
            await upstream.aclose()
            await client.aclose()

    return StreamingResponse(
        stream(),
        status_code=upstream.status_code,
        media_type=response_headers["Content-Type"],
        headers=response_headers,
    )


# --- Search input builders ---

def _build_username_input(request: SearchRequest) -> tuple:
    """Build Apify input and cache key for username search. Returns (actor_id, apify_input, cache_key)."""
    if not request.usernames or len(request.usernames) == 0:
        raise HTTPException(status_code=400, detail="At least one username required")
    cache_key = generate_cache_key("username", usernames=request.usernames, max_results=request.max_results)
    apify_input = {
        "username": request.usernames,
        "resultsLimit": request.max_results,
        "skipPinnedPosts": True,
        "includeSharesCount": False,
        "includeTranscript": True,
        "includeDownloadedVideo": True,
    }
    if request.only_posts_newer_than:
        apify_input["onlyPostsNewerThan"] = request.only_posts_newer_than
    if request.only_posts_older_than:
        apify_input["onlyPostsOlderThan"] = request.only_posts_older_than
    if request.include_tagged_posts:
        apify_input["includeTaggedPosts"] = True
    return APIFY_ACTOR_ID, apify_input, cache_key


def _extract_usernames_from_urls(urls: List[str]) -> List[str]:
    """Extract Instagram usernames from profile URLs or raw strings."""
    reserved = {'p', 'reel', 'reels', 'stories', 'explore', 'direct', 'accounts'}
    extracted = []
    for url in urls:
        url = url.strip()
        match = re.search(r'instagram\.com/([A-Za-z0-9._]+)/?(?:\?|$|#)?', url)
        if match:
            username = match.group(1)
            if username.lower() not in reserved:
                extracted.append(username)
        elif url and not url.startswith('http'):
            extracted.append(url.replace('@', ''))
    return extracted


def _build_url_input(request: SearchRequest) -> tuple:
    """Build Apify input for profile URL search. Returns (actor_id, apify_input, cache_key) or raises/returns error."""
    if not request.urls or len(request.urls) == 0:
        raise HTTPException(status_code=400, detail="At least one profile URL required")
    usernames = _extract_usernames_from_urls(request.urls)
    if not usernames:
        return None, None, None  # caller handles error response
    cache_key = generate_cache_key("username", usernames=usernames, max_results=request.max_results)
    apify_input = {
        "username": usernames,
        "resultsLimit": request.max_results,
        "skipPinnedPosts": True,
        "includeSharesCount": False,
        "includeTranscript": True,
        "includeDownloadedVideo": True,
    }
    if request.only_posts_newer_than:
        apify_input["onlyPostsNewerThan"] = request.only_posts_newer_than
    if request.only_posts_older_than:
        apify_input["onlyPostsOlderThan"] = request.only_posts_older_than
    logger.info(f"Extracted usernames from URLs: {usernames}")
    return APIFY_ACTOR_ID, apify_input, cache_key


def _build_hashtag_input(request: SearchRequest) -> tuple:
    """Build Apify input for hashtag search. Returns (actor_id, apify_input, cache_key)."""
    if not request.hashtag:
        raise HTTPException(status_code=400, detail="Hashtag required")
    hashtag = request.hashtag.replace("#", "").strip()
    cache_key = generate_cache_key("hashtag", hashtag=hashtag, max_results=request.max_results)
    apify_input = {
        "hashtags": [hashtag],
        "resultsType": "reels",
        "resultsCount": request.max_results,
    }
    logger.info(f"Hashtag search: {apify_input}")
    return APIFY_HASHTAG_ACTOR_ID, apify_input, cache_key


MAX_POST_URLS = 10
POST_URL_RE = re.compile(r"https?://(?:www\.)?instagram\.com/(?:p|reel|reels|tv)/[A-Za-z0-9_-]+/?", re.IGNORECASE)


def _normalize_post_url(url: str) -> Optional[str]:
    """Return a canonical Instagram post URL, or None if invalid."""
    if not url:
        return None
    url = url.strip().split("?")[0].rstrip("/")
    m = POST_URL_RE.match(url + "/")
    if not m:
        return None
    return m.group(0).rstrip("/") + "/"


def _build_post_url_input(request: SearchRequest) -> tuple:
    """Build Apify input for individual post/reel URL searches.

    Uses the Instagram Reel Scraper actor with ``directUrls`` — one round-trip
    per batch (no per-URL run). Supports up to MAX_POST_URLS URLs at a time.
    """
    if not request.post_urls or len(request.post_urls) == 0:
        raise HTTPException(status_code=400, detail="At least one post URL required")
    if len(request.post_urls) > MAX_POST_URLS:
        raise HTTPException(status_code=400, detail=f"Maximum {MAX_POST_URLS} post URLs per search")
    normalized = [_normalize_post_url(u) for u in request.post_urls]
    valid = [u for u in normalized if u]
    if not valid:
        return None, None, None  # caller will produce structured error
    cache_key = generate_cache_key("post_url", post_urls=valid)
    apify_input = {
        "directUrls": valid,
        "resultsType": "posts",
        "resultsLimit": len(valid),
        "addParentData": False,
    }
    logger.info(f"Post URL search via {APIFY_GENERAL_SCRAPER_ID}: {len(valid)} URLs")
    return APIFY_GENERAL_SCRAPER_ID, apify_input, cache_key


def _make_error_response(exc: Exception) -> StartSearchResponse:
    """Convert an httpx exception into a StartSearchResponse."""
    if isinstance(exc, httpx.TimeoutException):
        return StartSearchResponse(
            run_id="", status="ERROR", message="Request timed out",
            error=ExecutionError(
                error_type="TIMEOUT", error_message="The request to Apify API timed out",
                error_code="APIFY_TIMEOUT", possible_cause="Apify servers may be experiencing high load",
                suggested_solution="Try again in a few minutes.", technical_details=str(exc),
            ),
        )
    if isinstance(exc, httpx.HTTPStatusError):
        sc = exc.response.status_code
        body = exc.response.text[:500] if exc.response.text else ""
        error_map = {
            401: ("AUTHENTICATION", "Invalid or expired Apify API token", "Verify the Apify API token is correct."),
            403: ("AUTHORIZATION", "You don't have permission to use this actor", "Check Apify account permissions."),
            429: ("RATE_LIMIT", "Too many requests to Apify API", "Wait a few minutes before trying again."),
        }
        et, em, es = error_map.get(sc, ("API_ERROR", "Apify API returned an error", "Try again later."))
        return StartSearchResponse(
            run_id="", status="ERROR", message=em,
            error=ExecutionError(
                error_type=et, error_message=em, error_code=f"HTTP_{sc}",
                possible_cause=em, suggested_solution=es, technical_details=f"Status: {sc}, Response: {body}",
            ),
        )
    return StartSearchResponse(
        run_id="", status="ERROR", message="Unexpected error occurred",
        error=ExecutionError(
            error_type="UNEXPECTED", error_message="An unexpected error occurred",
            error_code="INTERNAL_ERROR", possible_cause="An internal server error occurred",
            suggested_solution="Try again.", technical_details=str(exc),
        ),
    )


# --- Status helpers ---

def _build_terminal_status(status: str, run_id: str, progress: int) -> Optional[SearchStatusResponse]:
    """Handle terminal run statuses (FAILED, ABORTED, TIMED-OUT). Returns None for non-terminal."""
    if status == "FAILED":
        return SearchStatusResponse(
            status=status, progress=progress, message="Search failed",
            error=ExecutionError(
                error_type="ACTOR_FAILED", error_message="The Apify actor failed to complete the search",
                error_code="APIFY_RUN_FAILED",
                possible_cause="Instagram rate limiting, invalid usernames, or temporary API issues.",
                suggested_solution="1. Verify username(s) are correct. 2. Try fewer usernames. 3. Wait and try again.",
                technical_details=f"Run ID: {run_id}, Status: {status}",
            ),
        )
    if status == "ABORTED":
        return SearchStatusResponse(status=status, progress=progress, message="Search was stopped by user")
    if status == "TIMED-OUT":
        return SearchStatusResponse(
            status=status, progress=progress, message="Search timed out",
            error=ExecutionError(
                error_type="TIMEOUT", error_message="The search took too long",
                error_code="APIFY_TIMEOUT",
                possible_cause="Too many results requested or Instagram rate limiting",
                suggested_solution="Try fewer results (e.g., 25 instead of 100).",
                technical_details=f"Run ID: {run_id}, Status: {status}",
            ),
        )
    return None


def optimize_cloudinary_url(url: str) -> str:
    """Insert f_auto/q_auto/vc_auto between /upload/ and /v in Cloudinary URLs."""
    if not url or "/upload/" not in url:
        return url
    return url.replace("/upload/", "/upload/f_auto/q_auto/vc_auto/", 1)


SEARCH_INPUT_BUILDERS = {
    "username": _build_username_input,
    "url": _build_url_input,
    "post_url": _build_post_url_input,
    "hashtag": _build_hashtag_input,
}


def _resolve_search_input(request: SearchRequest):
    """Dispatch to the right input builder. Returns (actor_id, apify_input, cache_key)
    or raises HTTPException. Returns (None, None, None) for URL searches with no
    valid usernames extracted (caller produces a structured error response)."""
    builder = SEARCH_INPUT_BUILDERS.get(request.search_type)
    if not builder:
        raise HTTPException(status_code=400, detail="Invalid search type")
    return builder(request)


def _url_parse_error_response(urls: list) -> StartSearchResponse:
    return StartSearchResponse(
        run_id="", status="ERROR",
        message="Could not extract any valid usernames from the provided URLs",
        error=ExecutionError(
            error_type="INVALID_INPUT", error_message="No valid Instagram profile URLs found",
            error_code="URL_PARSE_ERROR",
            possible_cause="The URLs provided are not valid Instagram profile URLs",
            suggested_solution="Enter URLs in format: https://www.instagram.com/username",
            technical_details=f"Provided URLs: {urls}",
        ),
    )


def _post_url_parse_error_response(urls: list) -> StartSearchResponse:
    return StartSearchResponse(
        run_id="", status="ERROR",
        message="Could not parse any valid Instagram post/reel URLs",
        error=ExecutionError(
            error_type="INVALID_INPUT", error_message="No valid Instagram post URLs found",
            error_code="POST_URL_PARSE_ERROR",
            possible_cause="URLs must be reel or post links",
            suggested_solution="Enter URLs like https://www.instagram.com/reel/XYZ/ or /p/XYZ/",
            technical_details=f"Provided URLs: {urls}",
        ),
    )


async def _fetch_run_input(client: httpx.AsyncClient, run_id: str, api_token: str, kv_store_id: Optional[str] = None) -> Optional[dict]:
    """Fetch an Apify run's original INPUT from its default key-value-store.

    Used by ``get_search_status`` to recover the cache key after a pod restart
    has wiped the in-memory ``active_runs`` dict.
    """
    try:
        if not kv_store_id:
            meta = await client.get(f"https://api.apify.com/v2/actor-runs/{run_id}?token={api_token}")
            kv_store_id = meta.json().get("data", {}).get("defaultKeyValueStoreId")
        if not kv_store_id:
            return None
        ir = await client.get(
            f"https://api.apify.com/v2/key-value-stores/{kv_store_id}/records/INPUT?token={api_token}"
        )
        if ir.status_code == 200:
            return ir.json()
    except Exception as e:
        logger.warning(f"Could not fetch run input for {run_id}: {e}")
    return None


def _reconstruct_cache_key_from_run_input(run_input: dict) -> tuple:
    """Best-effort recreate (cache_key, search_type, max_results) from a stored
    Apify run input. Returns ``(None, None, 25)`` if the shape isn't recognised.
    """
    if not isinstance(run_input, dict):
        return None, None, 25
    if run_input.get("hashtags"):
        hashtag = (run_input["hashtags"][0] or "").lower().strip()
        max_r = run_input.get("resultsCount", 25)
        return generate_cache_key("hashtag", hashtag=hashtag, max_results=max_r), "hashtag", max_r
    if run_input.get("directUrls"):
        urls = [u for u in run_input["directUrls"] if u]
        if urls:
            return generate_cache_key("post_url", post_urls=urls), "post_url", len(urls)
    if run_input.get("username") or run_input.get("usernames"):
        users = run_input.get("username") or run_input.get("usernames")
        max_r = run_input.get("resultsLimit") or run_input.get("resultsCount", 25)
        if users:
            return generate_cache_key("username", usernames=users, max_results=max_r), "username", max_r
    return None, None, 25


async def _maybe_return_cached(
    cache_key: str, request: SearchRequest, actor_id: str, user_email: str
) -> Optional[StartSearchResponse]:
    """If cache hit, register a synthetic cache run and return a CACHED response."""
    if not cache_key:
        return None
    cached_results = await get_cached_results(cache_key)
    if not cached_results:
        return None
    logger.info(f"Returning {len(cached_results)} cached results for {cache_key}")
    cache_run_id = f"cache_{cache_key}_{datetime.now(timezone.utc).timestamp()}"
    active_runs[cache_run_id] = {
        "user_email": user_email, "started_at": datetime.now(timezone.utc),
        "max_results": request.max_results, "search_type": request.search_type,
        "actor_id": actor_id, "cached_results": cached_results, "is_cached": True,
    }
    await log_audit("search_cached", user_email, {
        "cache_key": cache_key, "search_type": request.search_type,
        "results_count": len(cached_results),
    })
    return StartSearchResponse(
        run_id=cache_run_id, status="CACHED",
        message=f"Found {len(cached_results)} cached results from previous search",
    )


def _token_for_search(search_type: str) -> Optional[str]:
    """Return the Apify token to use for a given search type."""
    if search_type == "hashtag":
        return get_runtime_value("APIFY_TOKEN")
    return get_runtime_value("APIFY_USERNAME_TOKEN")


# --- Sync (fast path) -----------------------------------------------------
# For small, single-target searches, prefer Apify's run-sync-get-dataset-items
# endpoint — single round-trip, no polling overhead, no actor cold-start gap
# between our run-start and our first status poll.

SYNC_PATH_MAX_RESULTS = 25
# Cloudflare edge times out at ~100s. Cap the sync path well below that so
# a slow Apify sync call doesn't consume the whole client-facing budget.
# When we hit this ceiling we fall back to async which returns immediately
# with a run_id (client then polls). 25s is empirically enough for fast
# actor runs (username/post_url on cached IG accounts) without pushing the
# request anywhere near the CF ceiling.
SYNC_PATH_TIMEOUT_SEC = 25.0


def _should_use_sync_path(request: SearchRequest) -> bool:
    """Sync path is best for small, single-target searches."""
    if request.max_results > SYNC_PATH_MAX_RESULTS:
        return False
    if request.search_type == "username":
        return bool(request.usernames) and len(request.usernames) == 1
    if request.search_type == "url":
        return bool(request.urls) and len(request.urls) == 1
    if request.search_type == "post_url":
        # Post URL searches are always direct lookups, perfect for sync path.
        return bool(request.post_urls) and len(request.post_urls) <= SYNC_PATH_MAX_RESULTS
    if request.search_type == "hashtag":
        return bool(request.hashtag)
    return False


async def _try_sync_run(
    request: SearchRequest, actor_id: str, apify_input: dict,
    api_token: str, cache_key: Optional[str], user_email: str,
) -> Optional[StartSearchResponse]:
    """Attempt the sync path. Returns a CACHED-style response on success, None to fall back."""
    raw_items = await run_actor_sync(actor_id, apify_input, api_token, timeout=SYNC_PATH_TIMEOUT_SEC)
    if raw_items is None:
        return None
    results = await process_apify_results(
        raw_items, user_email, request.search_type,
        only_posts_newer_than=request.only_posts_newer_than,
        only_posts_older_than=request.only_posts_older_than,
    )
    if cache_key and results:
        await save_to_cache(cache_key, results, search_config=build_search_config(request))
    sync_run_id = f"sync_{cache_key or 'run'}_{datetime.now(timezone.utc).timestamp()}"
    active_runs[sync_run_id] = {
        "user_email": user_email, "started_at": datetime.now(timezone.utc),
        "max_results": request.max_results, "search_type": request.search_type,
        "actor_id": actor_id,
        "cached_results": [r.model_dump() for r in results],
        "is_cached": True,
    }
    await log_audit("search_sync", user_email, {
        "search_type": request.search_type, "results_count": len(results),
        "actor_id": actor_id,
    })
    return StartSearchResponse(
        run_id=sync_run_id, status="CACHED",
        message=f"Fast path — retrieved {len(results)} reels in one call",
    )


def _build_cached_status_response(run_id: str, run_info: dict) -> SearchStatusResponse:
    """Convert cached run_info into a final SearchStatusResponse and clean up."""
    cached = run_info.get("cached_results", [])
    results = []
    for item in cached:
        try:
            results.append(ReelResult(**item))
        except Exception as e:
            logger.error(f"Error converting cached result: {e}")
    active_runs.pop(run_id, None)
    return SearchStatusResponse(
        status="SUCCEEDED", progress=100, estimated_seconds_remaining=0,
        results=results, total=len(results),
        message=f"Retrieved {len(results)} cached results (saved Apify credits!)",
    )


def _compute_progress(started_at: datetime, max_results: int) -> tuple:
    """Returns (progress_pct, estimated_remaining_seconds)."""
    elapsed = (datetime.now(timezone.utc) - started_at).total_seconds()
    estimated_total = max_results * 2.5
    progress = min(95, int((elapsed / estimated_total) * 100)) if estimated_total > 0 else 0
    estimated_remaining = max(0, int(estimated_total - elapsed))
    return progress, estimated_remaining


async def _fetch_items_processed(client: httpx.AsyncClient, dataset_id: Optional[str]) -> int:
    """Best-effort fetch of itemCount from dataset (for RUNNING progress display)."""
    if not dataset_id:
        return 0
    try:
        ds = await client.get(
            f"https://api.apify.com/v2/datasets/{dataset_id}?token={get_runtime_value('APIFY_TOKEN')}"
        )
        if ds.status_code == 200:
            return ds.json().get("data", {}).get("itemCount", 0)
    except Exception:
        pass
    return 0


# --- Routes ---

@router.post("/reels/search/start", response_model=StartSearchResponse)
async def start_search(request: SearchRequest, user_email: str = Depends(get_current_user)):
    if not get_runtime_value("APIFY_TOKEN"):
        return StartSearchResponse(
            run_id="", status="ERROR", message="Apify token not configured",
            error=ExecutionError(
                error_type="CONFIGURATION", error_message="Apify API token is missing",
                error_code="MISSING_APIFY_TOKEN",
                possible_cause="No Apify token has been saved in Settings, or the saved value is empty.",
                suggested_solution="Open Settings → paste your Apify API token into the input → click Save.",
                technical_details="get_runtime_value('APIFY_TOKEN') returned empty",
            ),
        )

    try:
        actor_id, apify_input, cache_key = _resolve_search_input(request)
        if request.search_type == "url" and actor_id is None:
            return _url_parse_error_response(request.urls)
        if request.search_type == "post_url" and actor_id is None:
            return _post_url_parse_error_response(request.post_urls)

        cached = await _maybe_return_cached(cache_key, request, actor_id, user_email)
        if cached:
            return cached

        api_token = _token_for_search(request.search_type)
        if not api_token:
            token_type = "APIFY_TOKEN" if request.search_type in ("hashtag", "post_url") else "APIFY_USERNAME_TOKEN"
            return StartSearchResponse(
                run_id="", status="ERROR", message=f"{token_type} not configured",
                error=ExecutionError(
                    error_type="CONFIGURATION",
                    error_message=f"{token_type} is required for {request.search_type} searches",
                    error_code=f"MISSING_{token_type}",
                    possible_cause=f"No {token_type} saved in Settings.",
                    suggested_solution=f"Open Settings → paste a valid Apify token into the {token_type} input → Save.",
                    technical_details=f"_token_for_search('{request.search_type}') returned empty",
                ),
            )

        # Fast path: try sync endpoint for small single-target searches.
        if _should_use_sync_path(request):
            try:
                sync_response = await _try_sync_run(request, actor_id, apify_input, api_token, cache_key, user_email)
                if sync_response:
                    return sync_response
                # else: fell back to async path below
            except Exception as sync_exc:
                logger.error(f"Sync path failed for {request.search_type}: {sync_exc} — falling back to async")
                # Don't fail — fall through to async path

        async with httpx.AsyncClient(timeout=60.0) as client:
            try:
                run_response = await client.post(
                    f"https://api.apify.com/v2/acts/{actor_id}/runs?token={api_token}",
                    json=apify_input,
                    headers={"Content-Type": "application/json"},
                )
                run_response.raise_for_status()
                run_id = run_response.json()["data"]["id"]

                active_runs[run_id] = {
                    "user_email": user_email, "started_at": datetime.now(timezone.utc),
                    "max_results": request.max_results, "search_type": request.search_type,
                    "actor_id": actor_id, "cache_key": cache_key, "api_token": api_token,
                    "only_posts_newer_than": request.only_posts_newer_than,
                    "only_posts_older_than": request.only_posts_older_than,
                    "search_config": build_search_config(request),
                }
                logger.info(f"Started Apify run: {run_id} with actor: {actor_id}")
                await log_audit("search_started", user_email, {
                    "run_id": run_id, "search_type": request.search_type,
                    "usernames": request.usernames, "hashtag": request.hashtag,
                    "max_results": request.max_results, "actor_id": actor_id,
                })
                return StartSearchResponse(run_id=run_id, status="RUNNING")
            except Exception as e:
                logger.error(f"Apify API error: {e}")
                return _make_error_response(e)
    except HTTPException:
        raise
    except Exception as e:
        # Catch-all so the frontend always gets a structured ExecutionError instead of a 500.
        logger.exception(f"Unexpected error in start_search ({request.search_type}): {e}")
        return StartSearchResponse(
            run_id="", status="ERROR", message="Unexpected server error while starting search",
            error=ExecutionError(
                error_type="SERVER_ERROR",
                error_message=str(e) or "Unknown error",
                error_code=f"INTERNAL_{type(e).__name__.upper()}",
                possible_cause="A bug or unhandled edge case in the search-start flow.",
                suggested_solution=(
                    "Try a different search type or smaller batch. If it persists, check Settings → "
                    "Apify connection is healthy + re-save the token. Share this error_code with the dev team."
                ),
                technical_details=f"{type(e).__name__}: {e}",
            ),
        )


@router.get("/reels/search/status/{run_id}", response_model=SearchStatusResponse)
async def get_search_status(run_id: str, user_email: str = Depends(get_current_user)):
    run_info = active_runs.get(run_id, {})
    search_type = run_info.get("search_type", "username")
    api_token = run_info.get("api_token") or _token_for_search(search_type)
    if not api_token:
        raise HTTPException(status_code=500, detail="Apify token not configured")

    # Handle cached results
    if run_info.get("is_cached"):
        return _build_cached_status_response(run_id, run_info)

    started_at = run_info.get("started_at", datetime.now(timezone.utc))
    max_results = run_info.get("max_results", 25)
    actor_id = run_info.get("actor_id", APIFY_ACTOR_ID)
    cache_key = run_info.get("cache_key")

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            status_response = await client.get(
                f"https://api.apify.com/v2/acts/{actor_id}/runs/{run_id}?token={api_token}"
            )
            status_data = status_response.json()
            run_status = status_data["data"]["status"]
            dataset_id = status_data["data"].get("defaultDatasetId")

            # --- Post-restart recovery ----------------------------------------
            # active_runs is in-memory and wiped on restart. If the cache_key was
            # lost, reconstruct it from the Apify run's stored INPUT so we can
            # still warm the cache once this run reaches SUCCEEDED. Same for
            # search_type so date-range filtering keys still match downstream.
            if not run_info and not cache_key:
                kv_store_id = status_data["data"].get("defaultKeyValueStoreId")
                run_input = await _fetch_run_input(client, run_id, api_token, kv_store_id)
                if run_input:
                    rk, rtype, rmax = _reconstruct_cache_key_from_run_input(run_input)
                    if rk:
                        cache_key = rk
                        if rtype:
                            search_type = rtype
                        if rmax:
                            max_results = rmax
                        logger.info(
                            f"Reconstructed cache_key after restart for run {run_id}: "
                            f"{cache_key} (search_type={search_type})"
                        )

            progress, estimated_remaining = _compute_progress(started_at, max_results)
            items_processed = 0
            if run_status == "RUNNING":
                items_processed = await _fetch_items_processed(client, dataset_id)

            if run_status == "SUCCEEDED":
                dataset_response = await client.get(
                    f"https://api.apify.com/v2/datasets/{dataset_id}/items?token={api_token}"
                )
                dataset_response.raise_for_status()
                results = await process_apify_results(
                    dataset_response.json(), user_email, search_type,
                    only_posts_newer_than=run_info.get("only_posts_newer_than"),
                    only_posts_older_than=run_info.get("only_posts_older_than"),
                )
                if cache_key and results:
                    await save_to_cache(cache_key, results, search_config=run_info.get("search_config"))
                active_runs.pop(run_id, None)
                return SearchStatusResponse(
                    status=run_status, progress=100, estimated_seconds_remaining=0,
                    results=results, total=len(results),
                    message=f"Successfully retrieved {len(results)} reels" if results else "Search completed but no matching reels found",
                )

            # Terminal statuses
            terminal = _build_terminal_status(run_status, run_id, progress)
            if terminal:
                active_runs.pop(run_id, None)
                return terminal

            # Still running
            return SearchStatusResponse(
                status=run_status, progress=progress, estimated_seconds_remaining=estimated_remaining,
                items_processed=items_processed,
                message=f"Processing... {items_processed} items collected" if items_processed > 0 else "Searching...",
            )
        except httpx.HTTPError as e:
            logger.error(f"Apify API error: {e}")
            raise HTTPException(status_code=500, detail=f"Apify API error: {str(e)}")


@router.post("/reels/search/stop/{run_id}")
async def stop_search(run_id: str, user_email: str = Depends(get_current_user)):
    run_info = active_runs.get(run_id, {})
    actor_id = run_info.get("actor_id", APIFY_ACTOR_ID)
    search_type = run_info.get("search_type", "unknown")
    cache_key = run_info.get("cache_key")
    api_token = run_info.get("api_token") or _token_for_search(search_type)
    if not api_token:
        raise HTTPException(status_code=500, detail="Apify token not configured")

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            partial_results = []
            items_processed = 0
            try:
                sr = await client.get(f"https://api.apify.com/v2/acts/{actor_id}/runs/{run_id}?token={api_token}")
                dataset_id = sr.json()["data"].get("defaultDatasetId")
                if dataset_id:
                    dr = await client.get(f"https://api.apify.com/v2/datasets/{dataset_id}/items?token={api_token}")
                    if dr.status_code == 200:
                        items = dr.json()
                        items_processed = len(items)
                        if items:
                            partial_results = await process_apify_results(
                                items, user_email, search_type,
                                only_posts_newer_than=run_info.get("only_posts_newer_than"),
                                only_posts_older_than=run_info.get("only_posts_older_than"),
                            )
            except Exception as e:
                logger.warning(f"Could not retrieve partial results: {e}")

            await client.post(f"https://api.apify.com/v2/acts/{actor_id}/runs/{run_id}/abort?token={api_token}")
            active_runs.pop(run_id, None)

            # Warm the History cache with whatever we got before the abort —
            # so the user can re-open this partial set without re-burning Apify
            # credits. Skip silently if cache_key wasn't tracked (e.g. legacy run).
            if cache_key and partial_results:
                try:
                    await save_to_cache(cache_key, partial_results, search_config=run_info.get("search_config"))
                    logger.info(
                        f"Saved {len(partial_results)} partial results to cache "
                        f"{cache_key} after stop of run {run_id}"
                    )
                except Exception as cache_err:
                    logger.warning(f"Failed to cache partial results for {run_id}: {cache_err}")

            await log_audit("search_stopped", user_email, {
                "run_id": run_id, "partial_results_count": len(partial_results),
                "items_processed": items_processed,
            })
            return {
                "status": "ABORTED",
                "message": f"Search stopped. Retrieved {len(partial_results)} reels from {items_processed} items processed.",
                "partial_results": [r.model_dump() for r in partial_results],
                "items_processed": items_processed,
                "results_count": len(partial_results),
            }
        except httpx.HTTPError as e:
            logger.error(f"Apify abort error: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to stop search: {str(e)}")


@router.post("/reels/upload", response_model=UploadResponse)
async def upload_reels(request: UploadRequest, user_email: str = Depends(get_current_user)):
    # Cloudflare's edge times out at ~100s. Uploading reels sequentially can
    # easily exceed that when the batch is 10+ reels (each upload = 5-8s).
    # Parallelize with a bounded semaphore so we don't hammer Cloudinary either.
    import asyncio
    UPLOAD_CONCURRENCY = 5
    sem = asyncio.Semaphore(UPLOAD_CONCURRENCY)

    async def _bounded(reel):
        async with sem:
            return await upload_reel_to_cloudinary(reel, user_email)

    raw_results = await asyncio.gather(
        *(_bounded(reel) for reel in request.reels),
        return_exceptions=False,
    )

    items = [UploadProgressItem(**r) for r in raw_results]
    completed = sum(1 for r in raw_results if r.get("status") == "completed")
    failed = len(raw_results) - completed
    await log_audit("upload", user_email, {"total": len(request.reels), "completed": completed, "failed": failed})
    return UploadResponse(total=len(request.reels), completed=completed, failed=failed, items=items)


@router.post("/reels/export")
async def export_reels(request: ExportRequest, user_email: str = Depends(get_current_user)):
    reels = request.reels
    if not reels:
        raise HTTPException(status_code=400, detail="No reels to export")

    # Enrich missing cloudinary_url from saved_reels collection (handles the
    # case where the upload "failed" in the UI but the asset is in Cloudinary)
    from config import db as _db
    missing_urls = [r.get("reel_url") for r in reels if not r.get("cloudinary_url") and r.get("reel_url")]
    if missing_urls:
        lookup = {}
        async for doc in _db.saved_reels.find(
            {"reel_url": {"$in": missing_urls}},
            {"_id": 0, "reel_url": 1, "cloudinary_url": 1, "cloudinary_public_id": 1},
        ):
            lookup[doc.get("reel_url")] = doc
        recovered = 0
        for r in reels:
            if not r.get("cloudinary_url") and r.get("reel_url") in lookup:
                d = lookup[r["reel_url"]]
                r["cloudinary_url"] = d.get("cloudinary_url", "")
                r["cloudinary_public_id"] = d.get("cloudinary_public_id", "")
                recovered += 1
        if recovered:
            logger.info(f"Export: recovered {recovered} cloudinary_url(s) from saved_reels DB")

    owners = list(set(r.get("owner_username", "") for r in reels if r.get("owner_username")))
    date_str = datetime.now().strftime("%m-%d-%y")
    filename = f"{owners[0]}_{date_str}_results.csv" if len(owners) == 1 else f"multiple_owners_{date_str}_results.csv"

    output = io.StringIO()
    writer = csv.writer(output)
    headers = [
        "owner_username", "owner_full_name", "reel_url", "downloaded_video_url",
        "original_video_url", "timestamp", "video_duration_seconds", "video_transcript",
        "tagged_users", "music_artist", "music_song", "music_original_audio",
        "location_name", "location_address", "cloudinary_url", "cloudinary_public_id",
    ]
    writer.writerow(headers)
    for reel in reels:
        tagged_users = reel.get("tagged_users", [])
        if isinstance(tagged_users, list):
            tagged_users = ", ".join(tagged_users)
        row = []
        for h in headers:
            if h == "tagged_users":
                row.append(tagged_users)
            elif h == "cloudinary_url":
                row.append(optimize_cloudinary_url(reel.get("cloudinary_url", "")))
            else:
                row.append(reel.get(h, ""))
        writer.writerow(row)
    output.seek(0)

    # Track exports in saved_reels so the History page can show "Exported" badges
    exported_urls = [r.get("reel_url") for r in reels if r.get("reel_url")]
    if exported_urls:
        try:
            now_iso = datetime.now(timezone.utc).isoformat()
            await _db.saved_reels.update_many(
                {"reel_url": {"$in": exported_urls}},
                {"$set": {"exported_at": now_iso, "exported_by": user_email}},
            )
            # Upsert lightweight tracking rows for reels that aren't in saved_reels yet
            existing_urls = set()
            async for d in _db.saved_reels.find(
                {"reel_url": {"$in": exported_urls}}, {"_id": 0, "reel_url": 1}
            ):
                existing_urls.add(d.get("reel_url"))
            new_urls = [u for u in exported_urls if u not in existing_urls]
            if new_urls:
                await _db.saved_reels.insert_many([
                    {"reel_url": u, "exported_at": now_iso, "exported_by": user_email}
                    for u in new_urls
                ])
        except Exception as e:
            logger.warning(f"Failed to track export in saved_reels: {e}")

    await log_audit("export", user_email, {"reels_count": len(reels), "filename": filename})
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
