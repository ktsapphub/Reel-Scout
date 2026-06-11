from fastapi import APIRouter, Depends
from fastapi.exceptions import HTTPException
from typing import Optional
import httpx

from config import (
    logger, db, get_runtime_value,
    APIFY_ACTOR_ID, APIFY_REEL_SCRAPER_ID, APIFY_HASHTAG_ACTOR_ID,
    APIFY_CACHE_STORE_NAME
)
from models import ApifyConnectionStatus, ReelResult
from routes.auth import get_current_user, log_audit
from services.apify_service import get_or_create_cache_store

router = APIRouter(prefix="/api")


# --- Connection check helpers ---

async def _check_token(client: httpx.AsyncClient, token: str, label: str) -> tuple:
    """Check if an Apify token is valid. Returns (is_valid, account_info_or_none, error_or_none)."""
    if not token:
        return False, None, f"{label} not configured"
    try:
        response = await client.get(f"https://api.apify.com/v2/users/me?token={token}")
        if response.status_code == 200:
            data = response.json().get("data", {})
            plan = data.get("plan", {})
            plan_name = plan.get("id") if isinstance(plan, dict) else str(plan) if plan else "N/A"
            info = {
                "username": data.get("username", "N/A"),
                "email": data.get("email", "N/A"),
                "plan": plan_name,
            }
            return True, info, None
        return False, None, f"{label} validation failed: HTTP {response.status_code}"
    except Exception as e:
        return False, None, f"{label} error: {str(e)}"


async def _check_actor(client: httpx.AsyncClient, token: str, actor_id: str, label: str) -> tuple:
    """Check if an Apify actor is accessible. Returns (is_accessible, error_or_none)."""
    if not token:
        return False, f"No token to check {label}"
    try:
        r = await client.get(f"https://api.apify.com/v2/acts/{actor_id}?token={token}")
        if r.status_code == 200:
            return True, None
        return False, f"{label} not accessible: HTTP {r.status_code}"
    except Exception as e:
        return False, f"{label} check error: {str(e)}"


@router.get("/apify/status", response_model=ApifyConnectionStatus)
async def check_apify_connection(user_email: str = Depends(get_current_user)):
    apify_token = get_runtime_value("APIFY_TOKEN")
    apify_username_token = get_runtime_value("APIFY_USERNAME_TOKEN")
    if not apify_token and not apify_username_token:
        return ApifyConnectionStatus(
            connected=False, hashtag_token_valid=False, username_token_valid=False,
            username_actor_accessible=False, reel_scraper_accessible=False,
            hashtag_actor_accessible=False, errors=["No Apify tokens configured"],
            message="Apify tokens not configured",
        )

    errors = []
    account_info = None

    async with httpx.AsyncClient(timeout=15.0) as client:
        # Token checks
        hashtag_valid, ht_info, ht_err = await _check_token(client, apify_token, "Hashtag token")
        if ht_err:
            errors.append(ht_err)
        if ht_info:
            account_info = {**ht_info, "hashtag_token": "***" + apify_token[-8:]}

        username_valid, ut_info, ut_err = await _check_token(client, apify_username_token, "Username token")
        if ut_err:
            errors.append(ut_err)
        if account_info and apify_username_token:
            account_info["username_token"] = "***" + apify_username_token[-8:]

        # Actor checks
        username_actor_ok, ua_err = await _check_actor(client, apify_username_token, APIFY_ACTOR_ID, "Username actor")
        if ua_err:
            errors.append(ua_err)

        reel_scraper_ok, rs_err = await _check_actor(client, apify_username_token, APIFY_REEL_SCRAPER_ID, "Reel Scraper")
        if rs_err:
            errors.append(rs_err)

        hashtag_actor_ok, ha_err = await _check_actor(client, apify_token, APIFY_HASHTAG_ACTOR_ID, "Hashtag actor")
        if ha_err:
            errors.append(ha_err)

    connected = (hashtag_valid or username_valid) and (username_actor_ok or reel_scraper_ok or hashtag_actor_ok)
    message = "Apify connection failed"
    if connected and not errors:
        message = "All Apify connections working correctly"
    elif hashtag_valid or username_valid:
        message = "Tokens valid but some actors not accessible"

    await log_audit("apify_connection_check", user_email, {
        "connected": connected, "hashtag_token_valid": hashtag_valid,
        "username_token_valid": username_valid, "errors": errors,
    })

    # Record health (for validity TTL on Settings page)
    from services.health_service import record_health_check
    health = await record_health_check("apify", connected, {
        "hashtag_token_valid": hashtag_valid,
        "username_token_valid": username_valid,
    })

    return ApifyConnectionStatus(
        connected=connected, hashtag_token_valid=hashtag_valid,
        username_token_valid=username_valid, username_actor_accessible=username_actor_ok,
        reel_scraper_accessible=reel_scraper_ok, hashtag_actor_accessible=hashtag_actor_ok,
        account_info=account_info, errors=errors, message=message,
        checked_at=health.get("checked_at"), valid_until=health.get("valid_until"),
        validity_minutes=health.get("validity_minutes"),
    )


@router.get("/search-history")
async def get_search_history(user_email: str = Depends(get_current_user)):
    store_id = await get_or_create_cache_store()
    if not store_id:
        return {"history": [], "store_id": None, "store_name": APIFY_CACHE_STORE_NAME}

    history = []
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.get(
                f"https://api.apify.com/v2/key-value-stores/{store_id}/keys?token={get_runtime_value('APIFY_TOKEN')}"
            )
            if response.status_code == 200:
                keys = response.json().get("data", {}).get("items", [])
                for key_item in keys:
                    key = key_item.get("key", "")
                    search_type = "username" if key.startswith("username_") else "hashtag" if key.startswith("hashtag_") else "unknown"
                    try:
                        record_response = await client.get(
                            f"https://api.apify.com/v2/key-value-stores/{store_id}/records/{key}?token={get_runtime_value('APIFY_TOKEN')}"
                        )
                        if record_response.status_code == 200:
                            record_data = record_response.json()
                            results = record_data.get("results", [])
                            search_config = record_data.get("search_config")
                            search_term = _derive_search_term(results, search_type, search_config)
                            # Tally uploaded / exported counts from saved_reels DB
                            reel_urls = [r.get("reel_url") for r in results if r.get("reel_url")]
                            uploaded_count = 0
                            exported_count = 0
                            if reel_urls:
                                uploaded_count = await db.saved_reels.count_documents(
                                    {"reel_url": {"$in": reel_urls}, "cloudinary_url": {"$exists": True, "$ne": ""}}
                                )
                                exported_count = await db.saved_reels.count_documents(
                                    {"reel_url": {"$in": reel_urls}, "exported_at": {"$exists": True, "$ne": ""}}
                                )
                            # Heuristic: if the saved result count is below the user's
                            # requested max, this row was likely aborted / partial.
                            max_results = (search_config or {}).get("max_results")
                            is_partial = bool(
                                max_results and len(results) < max_results
                                and search_type in ("username", "hashtag")
                            )
                            history.append({
                                "cache_key": key, "search_type": search_type,
                                "search_term": search_term, "results_count": len(results),
                                "uploaded_count": uploaded_count,
                                "exported_count": exported_count,
                                "cached_at": record_data.get("cached_at", ""), "store_id": store_id,
                                "search_config": search_config,
                                "is_partial": is_partial,
                            })
                    except Exception as e:
                        logger.error(f"Error fetching record {key}: {e}")
        except Exception as e:
            logger.error(f"Error listing cache keys: {e}")

    history.sort(key=lambda x: x.get("cached_at", ""), reverse=True)
    return {"history": history, "store_id": store_id, "store_name": APIFY_CACHE_STORE_NAME}


def _derive_search_term(results: list, search_type: str, search_config: Optional[dict] = None) -> str:
    """Derive a human-readable search term from cached results.
    Prefers the stored search_config (Resume metadata) when available.
    """
    if search_config:
        if search_type == "hashtag" and search_config.get("hashtag"):
            return f"#{search_config['hashtag']}"
        if search_type == "username" and search_config.get("usernames"):
            users = search_config["usernames"]
            term = ", ".join(f"@{u}" for u in users[:3])
            if len(users) > 3:
                term += f" (+{len(users) - 3} more)"
            return term
        if search_type == "post_url" and search_config.get("post_urls"):
            urls = search_config["post_urls"]
            return f"{len(urls)} post URL{'s' if len(urls) > 1 else ''}"
    if not results:
        return ""
    if search_type == "username":
        usernames = list(set(r.get("owner_username", "") for r in results if r.get("owner_username")))
        term = ", ".join(f"@{u}" for u in usernames[:3])
        if len(usernames) > 3:
            term += f" (+{len(usernames) - 3} more)"
        return term
    if search_type == "hashtag":
        return "hashtag search"
    return ""


@router.get("/search-history/{cache_key}")
async def get_cached_search(cache_key: str, user_email: str = Depends(get_current_user)):
    store_id = await get_or_create_cache_store()
    if not store_id:
        raise HTTPException(status_code=404, detail="Cache store not found")

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.get(
                f"https://api.apify.com/v2/key-value-stores/{store_id}/records/{cache_key}?token={get_runtime_value('APIFY_TOKEN')}"
            )
            if response.status_code == 200:
                data = response.json()
                results = data.get("results", [])

                # Bulk lookup uploaded/exported metadata from saved_reels
                reel_urls = [r.get("reel_url") for r in results if r.get("reel_url")]
                meta_by_url = {}
                if reel_urls:
                    async for doc in db.saved_reels.find(
                        {"reel_url": {"$in": reel_urls}},
                        {"_id": 0, "reel_url": 1, "cloudinary_url": 1,
                         "cloudinary_public_id": 1, "uploaded_at": 1, "uploaded_by": 1,
                         "exported_at": 1, "exported_by": 1, "file_size_bytes": 1},
                    ):
                        meta_by_url[doc.get("reel_url")] = doc

                reel_results = []
                for item in results:
                    # Inject DB metadata so the UI can show upload/export state
                    url = item.get("reel_url")
                    if url and url in meta_by_url:
                        d = meta_by_url[url]
                        item["cloudinary_url"] = item.get("cloudinary_url") or d.get("cloudinary_url", "")
                        item["cloudinary_public_id"] = item.get("cloudinary_public_id") or d.get("cloudinary_public_id", "")
                        item["uploaded_at"] = d.get("uploaded_at", "")
                        item["exported_at"] = d.get("exported_at", "")
                        item["file_size_bytes"] = d.get("file_size_bytes", 0)
                    try:
                        # Forward extra fields via dict to keep response shape stable.
                        reel = ReelResult(**{k: v for k, v in item.items() if k in ReelResult.model_fields})
                        rd = reel.model_dump()
                        # Re-attach annotation fields (not on model)
                        for k in ("cloudinary_url", "cloudinary_public_id", "uploaded_at", "exported_at"):
                            if item.get(k):
                                rd[k] = item.get(k)
                        reel_results.append(rd)
                    except Exception as e:
                        logger.error(f"Error converting cached result: {e}")
                return {
                    "cache_key": cache_key, "cached_at": data.get("cached_at", ""),
                    "results": reel_results, "total": len(reel_results),
                }
            else:
                raise HTTPException(status_code=404, detail="Cached search not found")
        except httpx.HTTPError as e:
            raise HTTPException(status_code=500, detail=f"Error fetching cached search: {str(e)}")
