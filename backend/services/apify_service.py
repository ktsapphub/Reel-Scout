import httpx
import hashlib
import re
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone

from config import (
    logger, db, APIFY_TOKEN, APIFY_USERNAME_TOKEN,
    APIFY_ACTOR_ID, APIFY_REEL_SCRAPER_ID, APIFY_HASHTAG_ACTOR_ID,
    APIFY_CACHE_STORE_NAME
)
from models import ReelResult


# In-memory store for active runs
active_runs: Dict[str, Dict[str, Any]] = {}


async def get_or_create_cache_store() -> Optional[str]:
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.get(
                f"https://api.apify.com/v2/key-value-stores?token={APIFY_TOKEN}&unnamed=false"
            )
            stores = response.json().get("data", {}).get("items", [])
            for store in stores:
                if store.get("name") == APIFY_CACHE_STORE_NAME:
                    return store.get("id")
            create_response = await client.post(
                f"https://api.apify.com/v2/key-value-stores?token={APIFY_TOKEN}&name={APIFY_CACHE_STORE_NAME}"
            )
            if create_response.status_code == 201:
                return create_response.json().get("data", {}).get("id")
            return None
        except Exception as e:
            logger.error(f"Error getting/creating cache store: {e}")
            return None


def generate_cache_key(search_type: str, usernames: List[str] = None, hashtag: str = None, max_results: int = 25) -> Optional[str]:
    if search_type == "username" and usernames:
        sorted_users = sorted([u.lower().strip() for u in usernames])
        key_data = f"username:{','.join(sorted_users)}:limit:{max_results}"
    elif search_type == "hashtag" and hashtag:
        key_data = f"hashtag:{hashtag.lower().strip()}:limit:{max_results}"
    else:
        return None
    hash_obj = hashlib.md5(key_data.encode())
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
                f"https://api.apify.com/v2/key-value-stores/{store_id}/records/{cache_key}?token={APIFY_TOKEN}"
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
                f"https://api.apify.com/v2/key-value-stores/{store_id}/records/{cache_key}?token={APIFY_TOKEN}",
                json=cache_data,
                headers={"Content-Type": "application/json"}
            )
            logger.info(f"Saved {len(results)} results to cache: {cache_key}")
        except Exception as e:
            logger.error(f"Error saving to cache: {e}")


def extract_reel_id(url: str) -> str:
    match = re.search(r'/(?:reel|p)/([A-Za-z0-9_-]+)', url)
    return match.group(1) if match else url


def generate_content_slug(transcript: str) -> str:
    if not transcript:
        return "reel"
    slug = transcript[:60].lower()
    slug = re.sub(r'[^a-z0-9\s]', '', slug)
    slug = re.sub(r'\s+', '-', slug.strip())
    return slug[:40] if slug else "reel"


async def process_apify_results(items: List[Dict], user_email: str, search_type: str = "unknown") -> List[ReelResult]:
    """Process Apify results into ReelResult objects - ONLY REELS"""
    results = []
    seen_ids = set()
    skipped_images = 0
    skipped_no_video = 0
    skipped_no_url = 0

    saved_reels = await db.saved_reels.find({}, {"reel_url": 1, "_id": 0}).to_list(10000)
    saved_urls = {r["reel_url"] for r in saved_reels}

    logger.info(f"Processing {len(items)} items from Apify (search_type: {search_type}, filtering for reels only)")

    if items:
        first_item = items[0]
        logger.info(f"=== SAMPLE APIFY RESPONSE (first item) ===")
        logger.info(f"Keys: {list(first_item.keys())}")
        logger.info(f"type: {first_item.get('type')}, productType: {first_item.get('productType')}, mediaType: {first_item.get('mediaType')}")
        logger.info(f"isVideo: {first_item.get('isVideo')}, videoUrl: {str(first_item.get('videoUrl', 'NOT_FOUND'))[:100]}")
        logger.info(f"===========================================")

    for item in items:
        try:
            item_type = (item.get("type", "") or item.get("productType", "") or "").lower()
            media_type = (item.get("mediaType", "") or item.get("media_type", "") or "").lower()

            video_url = (
                item.get("videoUrl") or
                item.get("video_url") or
                item.get("videoPlaybackUrl") or
                item.get("video_playback_url") or
                item.get("video") or
                item.get("videos", [{}])[0].get("url") if isinstance(item.get("videos"), list) else None or
                None
            )

            is_video = item.get("isVideo", False) or item.get("is_video", False)
            item_url = str(item.get("url", "") or item.get("shortCode", "") or "")
            is_reel = (
                "reel" in item_type or
                "reel" in media_type or
                "/reel/" in item_url or
                "/reels/" in item_url or
                item_type == "video" or
                item_type == "clip"
            )

            image_types = ["image", "photo", "sidecar", "graphimage", "carousel", "graphsidecar", "graphstoryimage"]
            if item_type in image_types or media_type in image_types:
                skipped_images += 1
                continue

            if video_url:
                pass
            elif is_video or is_reel:
                pass
            else:
                skipped_no_video += 1
                continue

            duration = item.get("videoDuration") or item.get("video_duration") or item.get("duration") or 0
            if duration and duration > 180:
                continue

            reel_url = item.get("url") or ""
            if not reel_url and item.get("shortCode"):
                reel_url = f"https://www.instagram.com/reel/{item.get('shortCode')}/"

            if not reel_url:
                skipped_no_url += 1
                continue

            reel_id = extract_reel_id(reel_url)
            if reel_id in seen_ids or reel_url in saved_urls:
                continue
            seen_ids.add(reel_id)

            music_info = item.get("musicInfo") or item.get("music_info") or {}
            if isinstance(music_info, dict):
                music_artist = music_info.get("artist_name") or music_info.get("artistName") or ""
                music_song = music_info.get("song_name") or music_info.get("songName") or music_info.get("title") or ""
                music_original = music_info.get("is_original_audio") or music_info.get("isOriginalAudio") or False
            else:
                music_artist = music_song = ""
                music_original = False

            raw_tagged = item.get("taggedUsers") or item.get("tagged_users") or []
            tagged_users = []
            if isinstance(raw_tagged, list):
                for user in raw_tagged:
                    if isinstance(user, str):
                        tagged_users.append(user)
                    elif isinstance(user, dict):
                        username = user.get("username") or user.get("user") or user.get("name") or ""
                        if username:
                            tagged_users.append(username)

            downloaded_url = item.get("videoUrl") or item.get("video_url") or item.get("downloadedVideoUrl") or ""
            original_url = item.get("videoUrl") or item.get("displayUrl") or ""
            transcript = item.get("transcript") or item.get("caption") or item.get("text") or ""

            reel = ReelResult(
                owner_username=item.get("ownerUsername") or item.get("owner_username") or item.get("username") or "",
                owner_full_name=item.get("ownerFullName") or item.get("owner_full_name") or item.get("fullName") or "",
                reel_url=reel_url,
                downloaded_video_url=downloaded_url,
                original_video_url=original_url,
                timestamp=item.get("timestamp") or item.get("taken_at") or item.get("takenAt") or "",
                video_duration_seconds=duration or 0,
                video_transcript=transcript,
                tagged_users=tagged_users,
                music_artist=music_artist,
                music_song=music_song,
                music_original_audio=music_original
            )
            results.append(reel)

        except Exception as e:
            logger.error(f"Error processing item: {e}")
            continue

    logger.info(f"Processed {len(results)} valid reels from {len(items)} items (skipped: {skipped_images} images, {skipped_no_video} non-videos, {skipped_no_url} no-url)")
    return results
