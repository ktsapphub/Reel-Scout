from fastapi import APIRouter, Depends
from fastapi.exceptions import HTTPException
from typing import Optional
import httpx

from config import (
    logger, APIFY_TOKEN, APIFY_USERNAME_TOKEN,
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
    if not APIFY_TOKEN and not APIFY_USERNAME_TOKEN:
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
        hashtag_valid, ht_info, ht_err = await _check_token(client, APIFY_TOKEN, "Hashtag token")
        if ht_err:
            errors.append(ht_err)
        if ht_info:
            account_info = {**ht_info, "hashtag_token": "***" + APIFY_TOKEN[-8:]}

        username_valid, ut_info, ut_err = await _check_token(client, APIFY_USERNAME_TOKEN, "Username token")
        if ut_err:
            errors.append(ut_err)
        if account_info and APIFY_USERNAME_TOKEN:
            account_info["username_token"] = "***" + APIFY_USERNAME_TOKEN[-8:]

        # Actor checks
        username_actor_ok, ua_err = await _check_actor(client, APIFY_USERNAME_TOKEN, APIFY_ACTOR_ID, "Username actor")
        if ua_err:
            errors.append(ua_err)

        reel_scraper_ok, rs_err = await _check_actor(client, APIFY_USERNAME_TOKEN, APIFY_REEL_SCRAPER_ID, "Reel Scraper")
        if rs_err:
            errors.append(rs_err)

        hashtag_actor_ok, ha_err = await _check_actor(client, APIFY_TOKEN, APIFY_HASHTAG_ACTOR_ID, "Hashtag actor")
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
    return ApifyConnectionStatus(
        connected=connected, hashtag_token_valid=hashtag_valid,
        username_token_valid=username_valid, username_actor_accessible=username_actor_ok,
        reel_scraper_accessible=reel_scraper_ok, hashtag_actor_accessible=hashtag_actor_ok,
        account_info=account_info, errors=errors, message=message,
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
                f"https://api.apify.com/v2/key-value-stores/{store_id}/keys?token={APIFY_TOKEN}"
            )
            if response.status_code == 200:
                keys = response.json().get("data", {}).get("items", [])
                for key_item in keys:
                    key = key_item.get("key", "")
                    search_type = "username" if key.startswith("username_") else "hashtag" if key.startswith("hashtag_") else "unknown"
                    try:
                        record_response = await client.get(
                            f"https://api.apify.com/v2/key-value-stores/{store_id}/records/{key}?token={APIFY_TOKEN}"
                        )
                        if record_response.status_code == 200:
                            record_data = record_response.json()
                            results = record_data.get("results", [])
                            search_term = _derive_search_term(results, search_type)
                            history.append({
                                "cache_key": key, "search_type": search_type,
                                "search_term": search_term, "results_count": len(results),
                                "cached_at": record_data.get("cached_at", ""), "store_id": store_id,
                            })
                    except Exception as e:
                        logger.error(f"Error fetching record {key}: {e}")
        except Exception as e:
            logger.error(f"Error listing cache keys: {e}")

    history.sort(key=lambda x: x.get("cached_at", ""), reverse=True)
    return {"history": history, "store_id": store_id, "store_name": APIFY_CACHE_STORE_NAME}


def _derive_search_term(results: list, search_type: str) -> str:
    """Derive a human-readable search term from cached results."""
    if not results:
        return ""
    if search_type == "username":
        usernames = list(set(r.get("owner_username", "") for r in results if r.get("owner_username")))
        term = ", ".join(usernames[:3])
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
                f"https://api.apify.com/v2/key-value-stores/{store_id}/records/{cache_key}?token={APIFY_TOKEN}"
            )
            if response.status_code == 200:
                data = response.json()
                results = data.get("results", [])
                reel_results = []
                for item in results:
                    try:
                        reel_results.append(ReelResult(**item))
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
