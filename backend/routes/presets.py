"""Saved Search Presets — minimal CRUD scoped per user_email."""
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
from typing import Any, Dict
from pydantic import BaseModel, Field
import uuid

from config import db, logger
from routes.auth import get_current_user, log_audit

router = APIRouter(prefix="/api")

PRESET_NAME_MAX = 60
PRESETS_PER_USER_MAX = 50


class PresetCreateRequest(BaseModel):
    name: str
    config: Dict[str, Any] = Field(default_factory=dict)


def _doc_to_public(doc: dict) -> dict:
    return {
        "id": doc.get("id"),
        "name": doc.get("name"),
        "config": doc.get("config", {}),
        "created_at": doc.get("created_at"),
        "updated_at": doc.get("updated_at"),
    }


@router.get("/presets")
async def list_presets(user_email: str = Depends(get_current_user)):
    cursor = db.search_presets.find(
        {"user_email": user_email}, {"_id": 0}
    ).sort("created_at", -1)
    presets = [_doc_to_public(doc) async for doc in cursor]
    return {"presets": presets}


@router.post("/presets")
async def create_preset(
    request: PresetCreateRequest,
    user_email: str = Depends(get_current_user),
):
    name = (request.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Preset name cannot be empty")
    if len(name) > PRESET_NAME_MAX:
        raise HTTPException(
            status_code=400,
            detail=f"Preset name must be {PRESET_NAME_MAX} characters or less",
        )

    count = await db.search_presets.count_documents({"user_email": user_email})
    if count >= PRESETS_PER_USER_MAX:
        raise HTTPException(
            status_code=400,
            detail=f"Preset limit reached ({PRESETS_PER_USER_MAX}). Delete one before saving.",
        )

    existing = await db.search_presets.find_one(
        {"user_email": user_email, "name": name}
    )
    if existing:
        raise HTTPException(status_code=400, detail="A preset with this name already exists")

    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": str(uuid.uuid4()),
        "user_email": user_email,
        "name": name,
        "config": request.config or {},
        "created_at": now,
        "updated_at": now,
    }
    await db.search_presets.insert_one(doc)
    await log_audit("preset_created", user_email, {"preset_id": doc["id"], "name": name})
    logger.info(f"Preset created by {user_email}: {name}")
    return {"ok": True, "preset": _doc_to_public(doc)}


@router.delete("/presets/{preset_id}")
async def delete_preset(preset_id: str, user_email: str = Depends(get_current_user)):
    result = await db.search_presets.delete_one(
        {"id": preset_id, "user_email": user_email}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Preset not found")
    await log_audit("preset_deleted", user_email, {"preset_id": preset_id})
    return {"ok": True}
