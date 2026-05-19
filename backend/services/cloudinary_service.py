import cloudinary.uploader
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


async def upload_reel_to_cloudinary(reel: dict, user_email: str) -> dict:
    """Upload a single reel to Cloudinary and return result info."""
    video_url = reel.get("downloaded_video_url") or reel.get("original_video_url")
    reel_id = reel.get("id", "")

    if not video_url:
        return {"reel_id": reel_id, "status": "failed", "error": "No video URL available"}

    try:
        owner = reel.get("owner_username", "unknown")
        transcript = reel.get("video_transcript", "")
        content_slug = generate_content_slug(transcript)
        date_str = datetime.now().strftime("%b-%d-%Y")
        public_id = f"{owner}_{content_slug}_{date_str}"

        result = cloudinary.uploader.upload(
            video_url,
            resource_type="video",
            folder="Content for Vibe Check",
            public_id=public_id,
            overwrite=True
        )

        file_size = result.get("bytes", 0)

        await db.saved_reels.update_one(
            {"reel_url": reel.get("reel_url")},
            {"$set": {
                "reel_url": reel.get("reel_url"),
                "cloudinary_url": result.get("secure_url"),
                "cloudinary_public_id": result.get("public_id"),
                "file_size_bytes": file_size,
                "uploaded_at": datetime.now(timezone.utc).isoformat(),
                "uploaded_by": user_email
            }},
            upsert=True
        )

        return {
            "reel_id": reel_id,
            "status": "completed",
            "progress": 100,
            "cloudinary_url": result.get("secure_url", ""),
            "cloudinary_public_id": result.get("public_id", ""),
            "file_size_bytes": file_size,
            "file_size_display": format_file_size(file_size),
            "error": ""
        }
    except Exception as e:
        logger.error(f"Cloudinary upload error: {e}")
        return {"reel_id": reel_id, "status": "failed", "error": str(e)}
