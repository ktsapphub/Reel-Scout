from fastapi import APIRouter, HTTPException, Depends
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


@router.get("/apify/status", response_model=ApifyConnectionStatus)
async def check_apify_connection(user_email: str = Depends(get_current_user)):
    errors = []
    hashtag_token_valid = False
    username_token_valid = False
    username_actor_accessible = False
    reel_scraper_accessible = False
    hashtag_actor_accessible = False
    account_info = None

    if not APIFY_TOKEN and not APIFY_USERNAME_TOKEN:
        return ApifyConnectionStatus(
            connected=False, hashtag_token_valid=False, username_token_valid=False,
            username_actor_accessible=False, reel_scraper_accessible=False,
            hashtag_actor_accessible=False, errors=["No Apify tokens configured"],
            message="Apify tokens not configured"
        )

    async with httpx.AsyncClient(timeout=15.0) as client:
        if APIFY_TOKEN:
            try:
                user_response = await client.get(f"https://api.apify.com/v2/users/me?token={APIFY_TOKEN}")
                if user_response.status_code == 200:
                    hashtag_token_valid = True
                    user_data = user_response.json().get("data", {})
                    plan_data = user_data.get("plan", {})
                    plan_name = plan_data.get("id") if isinstance(plan_data, dict) else str(plan_data) if plan_data else "N/A"
                    account_info = {
                        "username": user_data.get("username", "N/A"),
                        "email": user_data.get("email", "N/A"),
                        "plan": plan_name,
                        "hashtag_token": "***" + APIFY_TOKEN[-8:],
                    }
                else:
                    errors.append(f"Hashtag token validation failed: HTTP {user_response.status_code}")
            except Exception as e:
                errors.append(f"Hashtag token error: {str(e)}")
        else:
            errors.append("APIFY_TOKEN (for hashtags) not configured")

        if APIFY_USERNAME_TOKEN:
            try:
                user_response = await client.get(f"https://api.apify.com/v2/users/me?token={APIFY_USERNAME_TOKEN}")
                if user_response.status_code == 200:
                    username_token_valid = True
                    if account_info:
                        account_info["username_token"] = "***" + APIFY_USERNAME_TOKEN[-8:]
                else:
                    errors.append(f"Username token validation failed: HTTP {user_response.status_code}")
            except Exception as e:
                errors.append(f"Username token error: {str(e)}")
        else:
            errors.append("APIFY_USERNAME_TOKEN not configured")

        if APIFY_USERNAME_TOKEN:
            try:
                r = await client.get(f"https://api.apify.com/v2/acts/{APIFY_ACTOR_ID}?token={APIFY_USERNAME_TOKEN}")
                username_actor_accessible = r.status_code == 200
                if not username_actor_accessible:
                    errors.append(f"Username actor not accessible: HTTP {r.status_code}")
            except Exception as e:
                errors.append(f"Username actor check error: {str(e)}")

        if APIFY_USERNAME_TOKEN:
            try:
                r = await client.get(f"https://api.apify.com/v2/acts/{APIFY_REEL_SCRAPER_ID}?token={APIFY_USERNAME_TOKEN}")
                reel_scraper_accessible = r.status_code == 200
                if not reel_scraper_accessible:
                    errors.append(f"Reel Scraper not accessible: HTTP {r.status_code}")
            except Exception as e:
                errors.append(f"Reel Scraper check error: {str(e)}")

        if APIFY_TOKEN:
            try:
                r = await client.get(f"https://api.apify.com/v2/acts/{APIFY_HASHTAG_ACTOR_ID}?token={APIFY_TOKEN}")
                hashtag_actor_accessible = r.status_code == 200
                if not hashtag_actor_accessible:
                    errors.append(f"Hashtag actor not accessible: HTTP {r.status_code}")
            except Exception as e:
                errors.append(f"Hashtag actor check error: {str(e)}")

    connected = (hashtag_token_valid or username_token_valid) and (username_actor_accessible or reel_scraper_accessible or hashtag_actor_accessible)
    if connected and not errors:
        message = "All Apify connections working correctly"
    elif hashtag_token_valid or username_token_valid:
        message = "Tokens valid but some actors not accessible"
    else:
        message = "Apify connection failed"

    await log_audit("apify_connection_check", user_email, {
        "connected": connected, "hashtag_token_valid": hashtag_token_valid,
        "username_token_valid": username_token_valid, "errors": errors
    })
    return ApifyConnectionStatus(
        connected=connected, hashtag_token_valid=hashtag_token_valid,
        username_token_valid=username_token_valid, username_actor_accessible=username_actor_accessible,
        reel_scraper_accessible=reel_scraper_accessible, hashtag_actor_accessible=hashtag_actor_accessible,
        account_info=account_info, errors=errors, message=message
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
                            search_term = ""
                            if results and search_type == "username":
                                usernames = list(set(r.get("owner_username", "") for r in results if r.get("owner_username")))
                                search_term = ", ".join(usernames[:3])
                                if len(usernames) > 3:
                                    search_term += f" (+{len(usernames) - 3} more)"
                            elif results and search_type == "hashtag":
                                search_term = "hashtag search"
                            history.append({
                                "cache_key": key, "search_type": search_type,
                                "search_term": search_term, "results_count": len(results),
                                "cached_at": record_data.get("cached_at", ""), "store_id": store_id
                            })
                    except Exception as e:
                        logger.error(f"Error fetching record {key}: {e}")
        except Exception as e:
            logger.error(f"Error listing cache keys: {e}")

    history.sort(key=lambda x: x.get("cached_at", ""), reverse=True)
    return {"history": history, "store_id": store_id, "store_name": APIFY_CACHE_STORE_NAME}


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
                    "results": reel_results, "total": len(reel_results)
                }
            else:
                raise HTTPException(status_code=404, detail="Cached search not found")
        except httpx.HTTPError as e:
            raise HTTPException(status_code=500, detail=f"Error fetching cached search: {str(e)}")
