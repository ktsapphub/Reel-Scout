from fastapi import APIRouter, Depends
import cloudinary.api
from datetime import datetime, timezone
import sys

from config import (
    logger, db, APIFY_TOKEN, APIFY_USERNAME_TOKEN,
    APIFY_ACTOR_ID, APIFY_REEL_SCRAPER_ID, APIFY_HASHTAG_ACTOR_ID,
)
from routes.auth import get_current_user
import os

router = APIRouter(prefix="/api")

APP_VERSION = "2.1.0"
BUILD_DATE = "2026-03-05"


@router.get("/settings/build-info")
async def get_build_info(user_email: str = Depends(get_current_user)):
    return {
        "app_name": "IG Reel Finder",
        "version": APP_VERSION,
        "build_date": BUILD_DATE,
        "environment": "preview",
        "python_version": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
        "framework": "FastAPI",
        "frontend": "React 18 + Tailwind CSS + shadcn/ui",
        "database": "MongoDB",
        "integrations": {
            "apify": {
                "actors": {
                    "username_scraper": {"id": APIFY_ACTOR_ID, "name": "Instagram Profile Scraper"},
                    "reel_scraper": {"id": APIFY_REEL_SCRAPER_ID, "name": "Instagram Reel Scraper"},
                    "hashtag_scraper": {"id": APIFY_HASHTAG_ACTOR_ID, "name": "Instagram Hashtag Scraper"},
                },
                "hashtag_token_configured": bool(APIFY_TOKEN),
                "username_token_configured": bool(APIFY_USERNAME_TOKEN),
            },
            "cloudinary": {
                "cloud_name": os.environ.get("CLOUDINARY_CLOUD_NAME", ""),
                "configured": bool(os.environ.get("CLOUDINARY_API_KEY")),
                "upload_folder": "Content for Vibe Check",
            },
        },
        "features": [
            "Username Search", "Profile URL Search", "Hashtag Search",
            "Cloudinary Upload (f_auto/q_auto/vc_auto)", "CSV Export",
            "Date Range Filter", "Search Caching (24h TTL)",
            "Stop Search / Partial Results", "Audit Logging",
        ],
    }


@router.get("/settings/check-cloudinary")
async def check_cloudinary(user_email: str = Depends(get_current_user)):
    cloud_name = os.environ.get("CLOUDINARY_CLOUD_NAME")
    api_key = os.environ.get("CLOUDINARY_API_KEY")
    api_secret = os.environ.get("CLOUDINARY_API_SECRET")

    if not cloud_name or not api_key or not api_secret:
        return {
            "connected": False,
            "error": "Cloudinary credentials not configured",
            "checked_at": datetime.now(timezone.utc).isoformat(),
        }

    try:
        result = cloudinary.api.ping()
        return {
            "connected": result.get("status") == "ok",
            "cloud_name": cloud_name,
            "api_key_hint": "***" + api_key[-4:] if api_key else "",
            "checked_at": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        logger.error(f"Cloudinary ping failed: {e}")
        return {
            "connected": False,
            "error": str(e),
            "checked_at": datetime.now(timezone.utc).isoformat(),
        }


@router.get("/settings/check-mongodb")
async def check_mongodb(user_email: str = Depends(get_current_user)):
    try:
        result = await db.command("ping")
        collections = await db.list_collection_names()
        counts = {}
        for col in collections:
            counts[col] = await db[col].estimated_document_count()
        return {
            "connected": True,
            "database": os.environ.get("DB_NAME", ""),
            "collections": counts,
            "checked_at": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        logger.error(f"MongoDB ping failed: {e}")
        return {
            "connected": False,
            "error": str(e),
            "checked_at": datetime.now(timezone.utc).isoformat(),
        }
