"""
Health service: tracks last successful connection checks and computes validity windows.
"""
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict

from config import db


# Default freshness window — how long a successful check is considered valid
DEFAULT_VALIDITY_MINUTES = 60


SERVICE_VALIDITY_OVERRIDES: Dict[str, int] = {
    "apify": 60,
    "cloudinary": 60,
    "mongodb": 30,
}


def validity_minutes_for(service: str) -> int:
    return SERVICE_VALIDITY_OVERRIDES.get(service, DEFAULT_VALIDITY_MINUTES)


async def record_health_check(service: str, connected: bool, details: Optional[dict] = None) -> dict:
    """Persist a health check and return the resulting record with validity window."""
    now = datetime.now(timezone.utc)
    validity = validity_minutes_for(service)
    valid_until = (now + timedelta(minutes=validity)) if connected else None
    doc = {
        "service": service,
        "connected": connected,
        "checked_at": now.isoformat(),
        "valid_until": valid_until.isoformat() if valid_until else None,
        "validity_minutes": validity,
        "details": details or {},
    }
    await db.connection_health.update_one(
        {"service": service},
        {"$set": doc},
        upsert=True,
    )
    return doc


async def get_health_status(service: str) -> Optional[dict]:
    doc = await db.connection_health.find_one({"service": service}, {"_id": 0})
    return doc


async def get_all_health_statuses() -> Dict[str, dict]:
    """Return a map of {service: health_doc}."""
    out: Dict[str, dict] = {}
    async for doc in db.connection_health.find({}, {"_id": 0}):
        out[doc.get("service", "unknown")] = doc
    return out
