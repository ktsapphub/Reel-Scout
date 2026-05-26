from fastapi import APIRouter, Depends, HTTPException
import cloudinary
import cloudinary.api
from datetime import datetime, timezone
import sys
import os
import httpx

from config import (
    logger, db, get_runtime_value, set_runtime_value,
    APIFY_ACTOR_ID, APIFY_REEL_SCRAPER_ID, APIFY_HASHTAG_ACTOR_ID,
)
from models import UpdateCredentialRequest
from routes.auth import get_current_user, log_audit
from services.credentials_service import (
    EDITABLE_CREDENTIALS, save_override, delete_override,
    get_credential_metadata,
)
from services.health_service import (
    record_health_check, get_all_health_statuses, validity_minutes_for,
)

router = APIRouter(prefix="/api")

APP_VERSION = "2.2.0"
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
                "hashtag_token_configured": bool(get_runtime_value("APIFY_TOKEN")),
                "username_token_configured": bool(get_runtime_value("APIFY_USERNAME_TOKEN")),
            },
            "cloudinary": {
                "cloud_name": get_runtime_value("CLOUDINARY_CLOUD_NAME") or "",
                "configured": bool(get_runtime_value("CLOUDINARY_API_KEY")),
                "upload_folder": "Content for Vibe Check",
            },
        },
        "features": [
            "Username Search", "Profile URL Search", "Hashtag Search",
            "Cloudinary Upload (f_auto/q_auto/vc_auto)", "CSV Export",
            "Date Range Filter", "Search Caching (24h TTL)",
            "Stop Search / Partial Results", "Audit Logging",
            "Editable Credentials (DB Override)",
        ],
    }


# --- Connection health checks ---

@router.get("/settings/check-cloudinary")
async def check_cloudinary(user_email: str = Depends(get_current_user)):
    cloud_name = get_runtime_value("CLOUDINARY_CLOUD_NAME")
    api_key = get_runtime_value("CLOUDINARY_API_KEY")
    api_secret = get_runtime_value("CLOUDINARY_API_SECRET")

    if not cloud_name or not api_key or not api_secret:
        health = await record_health_check("cloudinary", False, {"error": "missing_credentials"})
        return {
            "connected": False,
            "error": "Cloudinary credentials not configured",
            **_health_fields(health),
        }

    try:
        result = cloudinary.api.ping()
        connected = result.get("status") == "ok"
        health = await record_health_check("cloudinary", connected)
        return {
            "connected": connected,
            "cloud_name": cloud_name,
            "api_key_hint": "***" + api_key[-4:] if api_key else "",
            **_health_fields(health),
        }
    except Exception as e:
        logger.error(f"Cloudinary ping failed: {e}")
        health = await record_health_check("cloudinary", False, {"error": str(e)})
        return {
            "connected": False,
            "error": str(e),
            **_health_fields(health),
        }


@router.get("/settings/check-mongodb")
async def check_mongodb(user_email: str = Depends(get_current_user)):
    try:
        await db.command("ping")
        collections = await db.list_collection_names()
        counts = {}
        for col in collections:
            counts[col] = await db[col].estimated_document_count()
        health = await record_health_check("mongodb", True)
        return {
            "connected": True,
            "database": os.environ.get("DB_NAME", ""),
            "collections": counts,
            **_health_fields(health),
        }
    except Exception as e:
        logger.error(f"MongoDB ping failed: {e}")
        health = await record_health_check("mongodb", False, {"error": str(e)})
        return {
            "connected": False,
            "error": str(e),
            **_health_fields(health),
        }


def _health_fields(health: dict) -> dict:
    return {
        "checked_at": health.get("checked_at"),
        "valid_until": health.get("valid_until"),
        "validity_minutes": health.get("validity_minutes"),
    }


@router.get("/settings/health-status")
async def get_health_status_summary(user_email: str = Depends(get_current_user)):
    """Returns the last recorded health-check (with validity TTL) for all services."""
    statuses = await get_all_health_statuses()
    now = datetime.now(timezone.utc)
    out = {}
    for svc in ("apify", "cloudinary", "mongodb"):
        doc = statuses.get(svc)
        if not doc:
            out[svc] = {
                "service": svc,
                "checked_at": None,
                "connected": None,
                "valid_until": None,
                "validity_minutes": validity_minutes_for(svc),
                "is_stale": True,
                "remaining_seconds": 0,
            }
            continue
        valid_until = doc.get("valid_until")
        remaining = 0
        is_stale = True
        if valid_until:
            vu = datetime.fromisoformat(valid_until)
            if vu.tzinfo is None:
                vu = vu.replace(tzinfo=timezone.utc)
            remaining = max(0, int((vu - now).total_seconds()))
            is_stale = remaining <= 0
        out[svc] = {
            "service": svc,
            "checked_at": doc.get("checked_at"),
            "connected": doc.get("connected"),
            "valid_until": valid_until,
            "validity_minutes": doc.get("validity_minutes"),
            "is_stale": is_stale,
            "remaining_seconds": remaining,
        }
    return out


# --- Credential management ---

@router.get("/settings/credentials")
async def list_credentials(user_email: str = Depends(get_current_user)):
    """Returns all editable credentials with masked values and source info."""
    creds = []
    for key in EDITABLE_CREDENTIALS.keys():
        meta = await get_credential_metadata(key)
        creds.append(meta)
    return {"credentials": creds}


@router.get("/settings/credentials/{key}/reveal")
async def reveal_credential(key: str, user_email: str = Depends(get_current_user)):
    """Return the plaintext credential value (audit-logged every call)."""
    if key not in EDITABLE_CREDENTIALS:
        raise HTTPException(status_code=400, detail=f"Unknown credential: {key}")
    from config import get_runtime_value as _grv
    value = _grv(key)
    await log_audit("credential_revealed", user_email, {"key": key})
    return {"key": key, "value": value or ""}


@router.put("/settings/credentials")
async def update_credential(
    request: UpdateCredentialRequest,
    user_email: str = Depends(get_current_user),
):
    """Update a credential — tests it against the live API before persisting."""
    key = request.key
    new_value = (request.value or "").strip()

    if key not in EDITABLE_CREDENTIALS:
        raise HTTPException(status_code=400, detail=f"Unknown credential: {key}")
    if not new_value:
        raise HTTPException(status_code=400, detail="Value cannot be empty")

    # Validate the new value live
    test_result = await _test_credential(key, new_value)
    if not test_result["ok"]:
        await log_audit("credential_update_rejected", user_email, {
            "key": key, "reason": test_result.get("error"),
        })
        raise HTTPException(status_code=400, detail=test_result.get("error", "Credential test failed"))

    # Persist + apply at runtime
    await save_override(key, new_value, updated_by=user_email)
    set_runtime_value(key, new_value)

    await log_audit("credential_updated", user_email, {"key": key})
    meta = await get_credential_metadata(key)

    return {
        "ok": True,
        "message": "Credential updated and verified",
        "credential": meta,
        "test_details": test_result.get("details", {}),
    }


@router.delete("/settings/credentials/{key}")
async def reset_credential(key: str, user_email: str = Depends(get_current_user)):
    """Remove DB override — falls back to .env value."""
    if key not in EDITABLE_CREDENTIALS:
        raise HTTPException(status_code=400, detail=f"Unknown credential: {key}")
    await delete_override(key)
    # Reload runtime value from env
    env_val = os.environ.get(key)
    set_runtime_value(key, env_val)
    await log_audit("credential_reset", user_email, {"key": key})
    meta = await get_credential_metadata(key)
    return {"ok": True, "credential": meta}


async def _test_credential(key: str, value: str) -> dict:
    """Test a credential against its provider's live API."""
    try:
        if key in ("APIFY_TOKEN", "APIFY_USERNAME_TOKEN"):
            async with httpx.AsyncClient(timeout=15.0) as client:
                r = await client.get(f"https://api.apify.com/v2/users/me?token={value}")
                if r.status_code == 200:
                    data = r.json().get("data", {})
                    return {"ok": True, "details": {
                        "username": data.get("username"),
                        "email": data.get("email"),
                    }}
                return {"ok": False, "error": f"Apify validation failed (HTTP {r.status_code})"}

        if key.startswith("CLOUDINARY_"):
            # For Cloudinary we need all three fields to test
            cur_cloud = get_runtime_value("CLOUDINARY_CLOUD_NAME")
            cur_key = get_runtime_value("CLOUDINARY_API_KEY")
            cur_secret = get_runtime_value("CLOUDINARY_API_SECRET")
            test_cloud = value if key == "CLOUDINARY_CLOUD_NAME" else cur_cloud
            test_key = value if key == "CLOUDINARY_API_KEY" else cur_key
            test_secret = value if key == "CLOUDINARY_API_SECRET" else cur_secret
            if not test_cloud or not test_key or not test_secret:
                return {"ok": False, "error": "Need all three Cloudinary fields (cloud_name, api_key, api_secret) to verify"}
            # Temporarily reconfigure and ping
            cloudinary.config(
                cloud_name=test_cloud, api_key=test_key,
                api_secret=test_secret, secure=True,
            )
            try:
                result = cloudinary.api.ping()
                if result.get("status") == "ok":
                    return {"ok": True, "details": {"cloud_name": test_cloud}}
                return {"ok": False, "error": "Cloudinary ping failed"}
            finally:
                # Restore current config (will be re-set by set_runtime_value on success)
                cloudinary.config(
                    cloud_name=cur_cloud, api_key=cur_key,
                    api_secret=cur_secret, secure=True,
                )

        return {"ok": False, "error": f"No validator implemented for {key}"}
    except Exception as e:
        logger.error(f"Credential test failed for {key}: {e}")
        return {"ok": False, "error": str(e)}
