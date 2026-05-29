import hashlib
import re
import base64
from typing import List, Optional, Dict, Any
from urllib.parse import urlparse
from datetime import datetime, timezone
import httpx

from config import (
    logger, db, get_runtime_value,
    APIFY_ACTOR_ID, APIFY_REEL_SCRAPER_ID, APIFY_HASHTAG_ACTOR_ID,
    APIFY_CACHE_STORE_NAME
)
from models import ReelResult


INSTAGRAM_CDN_HOSTS = ("cdninstagram.com", "fbcdn.net")


def _is_instagram_cdn_url(url: str) -> bool:
    if not url or not url.startswith("http"):
        return False
    try:
        host = urlparse(url).hostname or ""
        return any(h in host for h in INSTAGRAM_CDN_HOSTS)
    except Exception:
        return False


def _proxify_if_cdn(url: str) -> str:
    """Wrap Instagram CDN URLs with the /api/reels/video-proxy endpoint so
    they survive CORS + signed-URL expiration in the browser. Apify KV-store
    URLs and Cloudinary URLs are returned unchanged.
    """
    if not _is_instagram_cdn_url(url):
        return url
    encoded = base64.urlsafe_b64encode(url.encode()).decode().rstrip("=")
    return f"/api/reels/video-proxy?u={encoded}"


# In-memory store for active runs
active_runs: Dict[str, Dict[str, Any]] = {}

IMAGE_TYPES = frozenset(["image", "photo", "sidecar", "graphimage", "carousel", "graphsidecar", "graphstoryimage"])


# --- Cache helpers ---

async def get_or_create_cache_store() -> Optional[str]:
    apify_token = get_runtime_value("APIFY_TOKEN")
    if not apify_token:
        return None
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.get(
                f"https://api.apify.com/v2/key-value-stores?token={apify_token}&unnamed=false"
            )
            stores = response.json().get("data", {}).get("items", [])
            for store in stores:
                if store.get("name") == APIFY_CACHE_STORE_NAME:
                    return store.get("id")
            create_response = await client.post(
                f"https://api.apify.com/v2/key-value-stores?token={apify_token}&name={APIFY_CACHE_STORE_NAME}"
            )
            if create_response.status_code == 201:
                return create_response.json().get("data", {}).get("id")
            return None
        except Exception as e:
            logger.error(f"Error getting/creating cache store: {e}")
            return None


def generate_cache_key(search_type: str, usernames: List[str] = None, hashtag: str = None, max_results: int = 25, post_urls: List[str] = None) -> Optional[str]:
    if search_type == "username" and usernames:
        sorted_users = sorted([u.lower().strip() for u in usernames])
        key_data = f"username:{','.join(sorted_users)}:limit:{max_results}"
    elif search_type == "hashtag" and hashtag:
        key_data = f"hashtag:{hashtag.lower().strip()}:limit:{max_results}"
    elif search_type == "post_url" and post_urls:
        sorted_urls = sorted([u.lower().strip().rstrip("/") for u in post_urls])
        key_data = f"post_url:{','.join(sorted_urls)}"
    else:
        return None
    hash_obj = hashlib.sha256(key_data.encode())
    return f"{search_type}_{hash_obj.hexdigest()[:16]}"


async def get_cached_results(cache_key: str) -> Optional[List[Dict]]:
    if not cache_key:
        return None
    store_id = await get_or_create_cache_store()
    if not store_id:
        return None
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.get(
                f"https://api.apify.com/v2/key-value-stores/{store_id}/records/{cache_key}?token={get_runtime_value('APIFY_TOKEN')}"
            )
            if response.status_code == 200:
                data = response.json()
                cached_at = data.get("cached_at", "")
                if cached_at:
                    cache_time = datetime.fromisoformat(cached_at.replace("Z", "+00:00"))
                    if (datetime.now(timezone.utc) - cache_time).total_seconds() < 86400:
                        logger.info(f"Cache hit for key: {cache_key}")
                        return data.get("results", [])
            return None
        except Exception as e:
            logger.debug(f"Cache miss or error: {e}")
            return None


async def save_to_cache(cache_key: str, results: List):
    if not cache_key or not results:
        return
    store_id = await get_or_create_cache_store()
    if not store_id:
        return
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            cache_data = {
                "cached_at": datetime.now(timezone.utc).isoformat(),
                "results": [r.model_dump() if hasattr(r, 'model_dump') else r for r in results]
            }
            await client.put(
                f"https://api.apify.com/v2/key-value-stores/{store_id}/records/{cache_key}?token={get_runtime_value('APIFY_TOKEN')}",
                json=cache_data,
                headers={"Content-Type": "application/json"}
            )
            logger.info(f"Saved {len(results)} results to cache: {cache_key}")
        except Exception as e:
            logger.error(f"Error saving to cache: {e}")


async def run_actor_sync(
    actor_id: str, apify_input: Dict[str, Any], api_token: str, timeout: float = 90.0,
) -> Optional[List[Dict]]:
    """Call Apify's run-sync-get-dataset-items endpoint (single round-trip, no polling).
    Returns the raw dataset items list or None on timeout/error (caller falls back to async)."""
    url = f"https://api.apify.com/v2/acts/{actor_id}/run-sync-get-dataset-items?token={api_token}"
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                url, json=apify_input, headers={"Content-Type": "application/json"},
            )
            # Apify returns 200 (run finished within sync window) or 201 (Created, body still contains items)
            if response.status_code in (200, 201):
                payload = response.json()
                if isinstance(payload, list):
                    logger.info(f"Sync path success: {len(payload)} items (HTTP {response.status_code})")
                    return payload
                logger.info(f"Sync path returned non-list payload ({type(payload).__name__}) — falling back to async")
                return None
            logger.info(f"Sync path HTTP {response.status_code} — falling back to async")
            return None
    except (httpx.TimeoutException, httpx.HTTPError) as e:
        logger.info(f"Sync path failed ({type(e).__name__}: {e}) — falling back to async")
        return None


# --- Item extraction helpers ---

def extract_reel_id(url: str) -> str:
    match = re.search(r'/(?:reel|p)/([A-Za-z0-9_-]+)', url)
    return match.group(1) if match else url


def _extract_video_url(item: Dict) -> Optional[str]:
    """Extract video URL from various Apify response shapes."""
    url = (
        item.get("videoUrl") or
        item.get("video_url") or
        item.get("videoPlaybackUrl") or
        item.get("video_playback_url") or
        item.get("video")
    )
    if url:
        return url
    videos = item.get("videos")
    if isinstance(videos, list) and videos:
        first = videos[0]
        if isinstance(first, dict):
            return first.get("url")
    return None


def _is_reel_item(item: Dict, item_type: str, media_type: str) -> bool:
    """Check if item is explicitly marked as a reel/video."""
    item_url = str(item.get("url", "") or item.get("shortCode", "") or "")
    return (
        "reel" in item_type or
        "reel" in media_type or
        "/reel/" in item_url or
        "/reels/" in item_url or
        item_type == "video" or
        item_type == "clip"
    )


def _extract_music_info(item: Dict) -> tuple:
    """Extract music artist, song, and original audio flag."""
    music_info = item.get("musicInfo") or item.get("music_info") or {}
    if isinstance(music_info, dict):
        artist = music_info.get("artist_name") or music_info.get("artistName") or ""
        song = music_info.get("song_name") or music_info.get("songName") or music_info.get("title") or ""
        original = music_info.get("is_original_audio") or music_info.get("isOriginalAudio") or False
        return artist, song, original
    return "", "", False


def _extract_tagged_users(item: Dict) -> List[str]:
    """Extract tagged users from various response shapes."""
    raw_tagged = item.get("taggedUsers") or item.get("tagged_users") or []
    tagged = []
    if isinstance(raw_tagged, list):
        for user in raw_tagged:
            if isinstance(user, str):
                tagged.append(user)
            elif isinstance(user, dict):
                username = user.get("username") or user.get("user") or user.get("name") or ""
                if username:
                    tagged.append(username)
    return tagged


def _should_skip_item(item_type: str, media_type: str, video_url: Optional[str], is_video: bool, is_reel: bool) -> Optional[str]:
    """Return skip reason if item should be filtered out, else None."""
    if item_type in IMAGE_TYPES or media_type in IMAGE_TYPES:
        return "image"
    if video_url or is_video or is_reel:
        return None
    return "no_video"


def _build_reel(item: Dict, video_url: Optional[str], duration: float, tagged_users: List[str], music: tuple) -> ReelResult:
    """Build a ReelResult from raw item data."""
    reel_url = item.get("url") or ""
    if not reel_url and item.get("shortCode"):
        reel_url = f"https://www.instagram.com/reel/{item.get('shortCode')}/"

    # Prefer Apify's persistent KV-store URL when available; otherwise wrap raw
    # Instagram CDN links through our proxy so the browser <video> can play them.
    raw_downloaded = item.get("downloadedVideoUrl") or item.get("downloaded_video_url") or ""
    raw_video = item.get("videoUrl") or item.get("video_url") or video_url or ""
    downloaded_video_url = raw_downloaded or _proxify_if_cdn(raw_video)
    original_video_url = raw_video or raw_downloaded

    return ReelResult(
        owner_username=item.get("ownerUsername") or item.get("owner_username") or item.get("username") or "",
        owner_full_name=item.get("ownerFullName") or item.get("owner_full_name") or item.get("fullName") or "",
        reel_url=reel_url,
        downloaded_video_url=downloaded_video_url,
        original_video_url=original_video_url,
        timestamp=item.get("timestamp") or item.get("taken_at") or item.get("takenAt") or "",
        video_duration_seconds=duration or 0,
        video_transcript=item.get("transcript") or item.get("caption") or item.get("text") or "",
        tagged_users=tagged_users,
        music_artist=music[0],
        music_song=music[1],
        music_original_audio=music[2],
    )


# --- Main processor ---

async def process_apify_results(
    items: List[Dict],
    user_email: str,
    search_type: str = "unknown",
    only_posts_newer_than: Optional[str] = None,
    only_posts_older_than: Optional[str] = None,
) -> List[ReelResult]:
    """Process Apify results into ReelResult objects — ONLY REELS.

    ``only_posts_newer_than`` / ``only_posts_older_than`` (YYYY-MM-DD) are applied
    as a server-side post-filter on each item's timestamp. We do this in addition
    to passing the flags to Apify because the Reel Scraper actor sometimes ignores
    ``onlyPostsOlderThan``.
    """
    results = []
    seen_ids: set = set()
    skipped = {"image": 0, "no_video": 0, "no_url": 0, "out_of_range": 0}

    saved_reels = await db.saved_reels.find({}, {"reel_url": 1, "_id": 0}).to_list(10000)
    saved_urls = {r["reel_url"] for r in saved_reels}

    # Parse date filters once
    newer_than_dt = _parse_date_boundary(only_posts_newer_than)
    older_than_dt = _parse_date_boundary(only_posts_older_than)

    logger.info(f"Processing {len(items)} items from Apify (search_type: {search_type}, "
                f"newer_than={only_posts_newer_than}, older_than={only_posts_older_than})")
    if items:
        first = items[0]
        logger.info(f"Sample keys: {list(first.keys())}, type={first.get('type')}, isVideo={first.get('isVideo')}")

    for item in items:
        try:
            item_type = (item.get("type", "") or item.get("productType", "") or "").lower()
            media_type = (item.get("mediaType", "") or item.get("media_type", "") or "").lower()
            video_url = _extract_video_url(item)
            is_video = item.get("isVideo", False) or item.get("is_video", False)
            is_reel = _is_reel_item(item, item_type, media_type)

            skip_reason = _should_skip_item(item_type, media_type, video_url, is_video, is_reel)
            if skip_reason:
                skipped[skip_reason] = skipped.get(skip_reason, 0) + 1
                continue

            duration = item.get("videoDuration") or item.get("video_duration") or item.get("duration") or 0
            if duration and duration > 180:
                continue

            reel_url = item.get("url") or ""
            if not reel_url and item.get("shortCode"):
                reel_url = f"https://www.instagram.com/reel/{item.get('shortCode')}/"
            if not reel_url:
                skipped["no_url"] += 1
                continue

            reel_id = extract_reel_id(reel_url)
            if reel_id in seen_ids or reel_url in saved_urls:
                continue
            seen_ids.add(reel_id)

            # Server-side date-range filter — Apify actor inconsistently honors it
            if newer_than_dt or older_than_dt:
                post_dt = _parse_post_timestamp(item)
                if post_dt is not None:
                    if newer_than_dt and post_dt < newer_than_dt:
                        skipped["out_of_range"] += 1
                        continue
                    if older_than_dt and post_dt > older_than_dt:
                        skipped["out_of_range"] += 1
                        continue

            tagged_users = _extract_tagged_users(item)
            music = _extract_music_info(item)
            results.append(_build_reel(item, video_url, duration, tagged_users, music))

        except Exception as e:
            logger.error(f"Error processing item: {e}")
            continue

    logger.info(f"Processed {len(results)} reels from {len(items)} items (skipped: {skipped})")
    return results


def _parse_date_boundary(value: Optional[str]):
    """Parse a YYYY-MM-DD string into a tz-aware datetime, or None."""
    if not value:
        return None
    try:
        from datetime import datetime as _dt, timezone as _tz
        return _dt.strptime(value, "%Y-%m-%d").replace(tzinfo=_tz.utc)
    except Exception:
        return None


def _parse_post_timestamp(item: Dict):
    """Extract a timezone-aware datetime from an Apify item's timestamp field."""
    from datetime import datetime as _dt, timezone as _tz
    raw = item.get("timestamp") or item.get("taken_at") or item.get("takenAt") or ""
    if not raw:
        return None
    try:
        if isinstance(raw, (int, float)):
            return _dt.fromtimestamp(float(raw), tz=_tz.utc)
        s = str(raw).replace("Z", "+00:00")
        # Try ISO-8601 first
        try:
            parsed = _dt.fromisoformat(s)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=_tz.utc)
            return parsed
        except Exception:
            pass
        # Fallback: epoch as string
        try:
            return _dt.fromtimestamp(float(s), tz=_tz.utc)
        except Exception:
            return None
    except Exception:
        return None
