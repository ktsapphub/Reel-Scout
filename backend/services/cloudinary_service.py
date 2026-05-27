import cloudinary.uploader
import cloudinary.api
from datetime import datetime, timezone
import re

from config import logger, db


def format_file_size(bytes_size: int) -> str:
    if bytes_size < 1024:
        return f"{bytes_size} B"
    elif bytes_size < 1024 * 1024:
        return f"{bytes_size / 1024:.1f} KB"
    elif bytes_size < 1024 * 1024 * 1024:
        return f"{bytes_size / (1024 * 1024):.1f} MB"
    else:
        return f"{bytes_size / (1024 * 1024 * 1024):.1f} GB"


def generate_content_slug(transcript: str) -> str:
    if not transcript:
        return "reel"
    slug = transcript[:60].lower()
    slug = re.sub(r'[^a-z0-9\s]', '', slug)
    slug = re.sub(r'\s+', '-', slug.strip())
    return slug[:40] if slug else "reel"


CLOUDINARY_FOLDER = "Content for Vibe Check"


def _build_public_id(owner: str, transcript: str) -> str:
    content_slug = generate_content_slug(transcript)
    date_str = datetime.now().strftime("%b-%d-%Y")
    return f"{owner}_{content_slug}_{date_str}"


async def _persist_upload_record(reel: dict, secure_url: str, public_id: str, file_size: int, user_email: str) -> None:
    """Persist (or refresh) the saved_reels row for an uploaded asset.
    Failures here are non-fatal — the Cloudinary asset is the source of truth.
    """
    try:
        await db.saved_reels.update_one(
            {"reel_url": reel.get("reel_url")},
            {"$set": {
                "reel_url": reel.get("reel_url"),
                "cloudinary_url": secure_url,
                "cloudinary_public_id": public_id,
                "file_size_bytes": file_size,
                "uploaded_at": datetime.now(timezone.utc).isoformat(),
                "uploaded_by": user_email,
            }},
            upsert=True,
        )
    except Exception as e:
        logger.warning(f"saved_reels DB write failed for {public_id}: {e}")


def _try_recover_existing_asset(public_id: str) -> dict:
    """If a Cloudinary upload throws but the asset is actually present, return its metadata.
    Returns {} if not found / any error during lookup.
    """
    try:
        full_public_id = f"{CLOUDINARY_FOLDER}/{public_id}"
        resource = cloudinary.api.resource(full_public_id, resource_type="video")
        return {
            "secure_url": resource.get("secure_url", ""),
            "public_id": resource.get("public_id", ""),
            "bytes": resource.get("bytes", 0),
        }
    except Exception as recover_err:
        logger.info(f"Recovery probe — asset not found for {public_id}: {recover_err}")
        return {}


async def upload_reel_to_cloudinary(reel: dict, user_email: str) -> dict:
    """Upload a single reel to Cloudinary and return result info.

    If the upload call raises an exception, attempt to recover by checking whether
    the asset is already present in Cloudinary (common when the upload succeeded but
    the response read timed out). If so, treat as success and persist the record.
    """
    video_url = reel.get("downloaded_video_url") or reel.get("original_video_url")
    reel_id = reel.get("id", "")

    if not video_url:
        return {"reel_id": reel_id, "status": "failed", "error": "No video URL available"}

    owner = reel.get("owner_username", "unknown")
    transcript = reel.get("video_transcript", "")
    public_id = _build_public_id(owner, transcript)

    try:
        result = cloudinary.uploader.upload(
            video_url,
            resource_type="video",
            folder=CLOUDINARY_FOLDER,
            public_id=public_id,
            overwrite=True,
        )
        secure_url = result.get("secure_url", "")
        full_public_id = result.get("public_id", "")
        file_size = result.get("bytes", 0)
        await _persist_upload_record(reel, secure_url, full_public_id, file_size, user_email)
        return {
            "reel_id": reel_id,
            "status": "completed",
            "progress": 100,
            "cloudinary_url": secure_url,
            "cloudinary_public_id": full_public_id,
            "file_size_bytes": file_size,
            "file_size_display": format_file_size(file_size),
            "error": "",
        }
    except Exception as e:
        logger.error(f"Cloudinary upload error for {public_id}: {e}")
        # Recovery: maybe the upload actually succeeded but the response failed
        recovered = _try_recover_existing_asset(public_id)
        if recovered.get("secure_url"):
            logger.info(f"Recovered existing Cloudinary asset for {public_id} after upload exception")
            await _persist_upload_record(
                reel, recovered["secure_url"], recovered["public_id"],
                recovered["bytes"], user_email,
            )
            return {
                "reel_id": reel_id,
                "status": "completed",
                "progress": 100,
                "cloudinary_url": recovered["secure_url"],
                "cloudinary_public_id": recovered["public_id"],
                "file_size_bytes": recovered["bytes"],
                "file_size_display": format_file_size(recovered["bytes"]),
                "error": "",
                "recovered": True,
            }
        return {"reel_id": reel_id, "status": "failed", "error": str(e)}

