from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime, timezone
import httpx
import re
import csv
import io
from fastapi.responses import StreamingResponse

from config import (
    logger, APIFY_TOKEN, APIFY_USERNAME_TOKEN,
    APIFY_ACTOR_ID, APIFY_HASHTAG_ACTOR_ID
)
from models import (
    SearchRequest, SearchResponse, ReelResult,
    UploadRequest, UploadProgressItem, UploadResponse,
    ExportRequest, ExecutionError, StartSearchResponse, SearchStatusResponse
)
from routes.auth import get_current_user, log_audit
from services.apify_service import (
    active_runs, generate_cache_key, get_cached_results,
    save_to_cache, process_apify_results
)
from services.cloudinary_service import upload_reel_to_cloudinary

router = APIRouter(prefix="/api")


@router.post("/reels/search/start", response_model=StartSearchResponse)
async def start_search(request: SearchRequest, user_email: str = Depends(get_current_user)):
    if not APIFY_TOKEN:
        raise HTTPException(status_code=500, detail="Apify token not configured")

    actor_id = APIFY_ACTOR_ID
    apify_input = {}
    cache_key = None

    if request.search_type == "username":
        if not request.usernames or len(request.usernames) == 0:
            raise HTTPException(status_code=400, detail="At least one username required")
        cache_key = generate_cache_key("username", usernames=request.usernames, max_results=request.max_results)
        apify_input = {
            "username": request.usernames,
            "resultsLimit": request.max_results,
            "skipPinnedPosts": True,
            "includeSharesCount": False,
            "includeTranscript": True,
            "includeDownloadedVideo": True
        }
        if request.only_posts_newer_than:
            apify_input["onlyPostsNewerThan"] = request.only_posts_newer_than
        if request.only_posts_older_than:
            apify_input["onlyPostsOlderThan"] = request.only_posts_older_than
        if request.include_tagged_posts:
            apify_input["includeTaggedPosts"] = True

    elif request.search_type == "url":
        if not request.urls or len(request.urls) == 0:
            raise HTTPException(status_code=400, detail="At least one profile URL required")
        extracted_usernames = []
        for url in request.urls:
            url = url.strip()
            match = re.search(r'instagram\.com/([A-Za-z0-9._]+)/?(?:\?|$|#)?', url)
            if match:
                username = match.group(1)
                if username.lower() not in ['p', 'reel', 'reels', 'stories', 'explore', 'direct', 'accounts']:
                    extracted_usernames.append(username)
            elif url and not url.startswith('http'):
                extracted_usernames.append(url.replace('@', ''))

        if not extracted_usernames:
            return StartSearchResponse(
                run_id="", status="ERROR",
                message="Could not extract any valid usernames from the provided URLs",
                error=ExecutionError(
                    error_type="INVALID_INPUT", error_message="No valid Instagram profile URLs found",
                    error_code="URL_PARSE_ERROR",
                    possible_cause="The URLs provided are not valid Instagram profile URLs",
                    suggested_solution="Enter URLs in format: https://www.instagram.com/username",
                    technical_details=f"Provided URLs: {request.urls}"
                )
            )
        cache_key = generate_cache_key("username", usernames=extracted_usernames, max_results=request.max_results)
        apify_input = {
            "username": extracted_usernames,
            "resultsLimit": request.max_results,
            "skipPinnedPosts": True,
            "includeSharesCount": False,
            "includeTranscript": True,
            "includeDownloadedVideo": True
        }
        if request.only_posts_newer_than:
            apify_input["onlyPostsNewerThan"] = request.only_posts_newer_than
        if request.only_posts_older_than:
            apify_input["onlyPostsOlderThan"] = request.only_posts_older_than
        logger.info(f"Extracted usernames from URLs: {extracted_usernames}")

    elif request.search_type == "hashtag":
        if not request.hashtag:
            raise HTTPException(status_code=400, detail="Hashtag required")
        actor_id = APIFY_HASHTAG_ACTOR_ID
        hashtag = request.hashtag.replace("#", "").strip()
        cache_key = generate_cache_key("hashtag", hashtag=hashtag, max_results=request.max_results)
        apify_input = {
            "hashtags": [hashtag],
            "resultsType": "reels",
            "resultsCount": request.max_results
        }
        logger.info(f"Hashtag search using hashtag-scraper: {apify_input}")
    else:
        raise HTTPException(status_code=400, detail="Invalid search type")

    # Check cache
    if cache_key:
        cached_results = await get_cached_results(cache_key)
        if cached_results:
            logger.info(f"Returning {len(cached_results)} cached results for {cache_key}")
            cache_run_id = f"cache_{cache_key}_{datetime.now(timezone.utc).timestamp()}"
            active_runs[cache_run_id] = {
                "user_email": user_email, "started_at": datetime.now(timezone.utc),
                "max_results": request.max_results, "search_type": request.search_type,
                "actor_id": actor_id, "cached_results": cached_results, "is_cached": True
            }
            await log_audit("search_cached", user_email, {
                "cache_key": cache_key, "search_type": request.search_type,
                "results_count": len(cached_results)
            })
            return StartSearchResponse(
                run_id=cache_run_id, status="CACHED",
                message=f"Found {len(cached_results)} cached results from previous search"
            )

    api_token = APIFY_TOKEN if request.search_type == "hashtag" else APIFY_USERNAME_TOKEN
    if not api_token:
        token_type = "APIFY_TOKEN" if request.search_type == "hashtag" else "APIFY_USERNAME_TOKEN"
        raise HTTPException(status_code=500, detail=f"{token_type} not configured")

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            run_response = await client.post(
                f"https://api.apify.com/v2/acts/{actor_id}/runs?token={api_token}",
                json=apify_input,
                headers={"Content-Type": "application/json"}
            )
            run_response.raise_for_status()
            run_data = run_response.json()
            run_id = run_data["data"]["id"]

            active_runs[run_id] = {
                "user_email": user_email, "started_at": datetime.now(timezone.utc),
                "max_results": request.max_results, "search_type": request.search_type,
                "actor_id": actor_id, "cache_key": cache_key, "api_token": api_token
            }
            logger.info(f"Started Apify run: {run_id} with actor: {actor_id}")

            await log_audit("search_started", user_email, {
                "run_id": run_id, "search_type": request.search_type,
                "usernames": request.usernames, "hashtag": request.hashtag,
                "max_results": request.max_results, "actor_id": actor_id
            })
            return StartSearchResponse(run_id=run_id, status="RUNNING")

        except httpx.TimeoutException as e:
            logger.error(f"Apify API timeout: {e}")
            return StartSearchResponse(run_id="", status="ERROR", message="Request timed out",
                error=ExecutionError(error_type="TIMEOUT", error_message="The request to Apify API timed out",
                    error_code="APIFY_TIMEOUT", possible_cause="Apify servers may be experiencing high load",
                    suggested_solution="Try again in a few minutes.", technical_details=str(e)))
        except httpx.HTTPStatusError as e:
            logger.error(f"Apify API HTTP error: {e}")
            sc = e.response.status_code
            body = e.response.text[:500] if e.response.text else ""
            error_map = {
                401: ("AUTHENTICATION", "Invalid or expired Apify API token", "Verify the Apify API token is correct."),
                403: ("AUTHORIZATION", "You don't have permission to use this actor", "Check Apify account permissions."),
                429: ("RATE_LIMIT", "Too many requests to Apify API", "Wait a few minutes before trying again."),
            }
            et, em, es = error_map.get(sc, ("API_ERROR", f"Apify API returned an error", "Try again later."))
            return StartSearchResponse(run_id="", status="ERROR", message=em,
                error=ExecutionError(error_type=et, error_message=em, error_code=f"HTTP_{sc}",
                    possible_cause=em, suggested_solution=es, technical_details=f"Status: {sc}, Response: {body}"))
        except Exception as e:
            logger.error(f"Unexpected error: {e}")
            return StartSearchResponse(run_id="", status="ERROR", message="Unexpected error occurred",
                error=ExecutionError(error_type="UNEXPECTED", error_message="An unexpected error occurred",
                    error_code="INTERNAL_ERROR", possible_cause="An internal server error occurred",
                    suggested_solution="Try again.", technical_details=str(e)))


@router.get("/reels/search/status/{run_id}", response_model=SearchStatusResponse)
async def get_search_status(run_id: str, user_email: str = Depends(get_current_user)):
    run_info = active_runs.get(run_id, {})

    api_token = run_info.get("api_token")
    if not api_token:
        search_type = run_info.get("search_type", "username")
        api_token = APIFY_TOKEN if search_type == "hashtag" else APIFY_USERNAME_TOKEN
    if not api_token:
        raise HTTPException(status_code=500, detail="Apify token not configured")

    # Handle cached results
    if run_info.get("is_cached"):
        cached_results = run_info.get("cached_results", [])
        results = []
        for item in cached_results:
            try:
                results.append(ReelResult(**item))
            except Exception as e:
                logger.error(f"Error converting cached result: {e}")
        if run_id in active_runs:
            del active_runs[run_id]
        return SearchStatusResponse(
            status="SUCCEEDED", progress=100, estimated_seconds_remaining=0,
            results=results, total=len(results),
            message=f"Retrieved {len(results)} cached results (saved Apify credits!)"
        )

    started_at = run_info.get("started_at", datetime.now(timezone.utc))
    max_results = run_info.get("max_results", 25)
    actor_id = run_info.get("actor_id", APIFY_ACTOR_ID)
    search_type = run_info.get("search_type", "username")
    cache_key = run_info.get("cache_key")

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            status_response = await client.get(
                f"https://api.apify.com/v2/acts/{actor_id}/runs/{run_id}?token={api_token}"
            )
            status_data = status_response.json()
            status = status_data["data"]["status"]
            dataset_id = status_data["data"].get("defaultDatasetId")

            items_processed = 0
            if dataset_id and status == "RUNNING":
                try:
                    dataset_info = await client.get(
                        f"https://api.apify.com/v2/datasets/{dataset_id}?token={APIFY_TOKEN}"
                    )
                    if dataset_info.status_code == 200:
                        items_processed = dataset_info.json().get("data", {}).get("itemCount", 0)
                except:
                    pass

            elapsed = (datetime.now(timezone.utc) - started_at).total_seconds()
            estimated_total = max_results * 2.5
            progress = min(95, int((elapsed / estimated_total) * 100)) if estimated_total > 0 else 0
            estimated_remaining = max(0, int(estimated_total - elapsed))

            if status == "SUCCEEDED":
                dataset_id = status_data["data"]["defaultDatasetId"]
                dataset_response = await client.get(
                    f"https://api.apify.com/v2/datasets/{dataset_id}/items?token={api_token}"
                )
                dataset_response.raise_for_status()
                items = dataset_response.json()
                results = await process_apify_results(items, user_email, search_type)
                if cache_key and results:
                    await save_to_cache(cache_key, results)
                if run_id in active_runs:
                    del active_runs[run_id]
                return SearchStatusResponse(
                    status=status, progress=100, estimated_seconds_remaining=0,
                    results=results, total=len(results),
                    message=f"Successfully retrieved {len(results)} reels" if results else "Search completed but no matching reels found"
                )
            elif status == "FAILED":
                if run_id in active_runs:
                    del active_runs[run_id]
                return SearchStatusResponse(
                    status=status, progress=progress, message="Search failed",
                    error=ExecutionError(
                        error_type="ACTOR_FAILED", error_message="The Apify actor failed to complete the search",
                        error_code="APIFY_RUN_FAILED",
                        possible_cause="Instagram rate limiting, invalid usernames, or temporary API issues.",
                        suggested_solution="1. Verify username(s) are correct. 2. Try fewer usernames. 3. Wait and try again.",
                        technical_details=f"Run ID: {run_id}, Status: {status}"
                    )
                )
            elif status == "ABORTED":
                if run_id in active_runs:
                    del active_runs[run_id]
                return SearchStatusResponse(status=status, progress=progress, message="Search was stopped by user")
            elif status == "TIMED-OUT":
                if run_id in active_runs:
                    del active_runs[run_id]
                return SearchStatusResponse(
                    status=status, progress=progress, message="Search timed out",
                    error=ExecutionError(
                        error_type="TIMEOUT", error_message="The search took too long",
                        error_code="APIFY_TIMEOUT",
                        possible_cause="Too many results requested or Instagram rate limiting",
                        suggested_solution="Try fewer results (e.g., 25 instead of 100).",
                        technical_details=f"Run ID: {run_id}, Status: {status}"
                    )
                )

            return SearchStatusResponse(
                status=status, progress=progress, estimated_seconds_remaining=estimated_remaining,
                items_processed=items_processed,
                message=f"Processing... {items_processed} items collected" if items_processed > 0 else "Searching..."
            )
        except httpx.HTTPError as e:
            logger.error(f"Apify API error: {e}")
            raise HTTPException(status_code=500, detail=f"Apify API error: {str(e)}")


@router.post("/reels/search/stop/{run_id}")
async def stop_search(run_id: str, user_email: str = Depends(get_current_user)):
    run_info = active_runs.get(run_id, {})
    actor_id = run_info.get("actor_id", APIFY_ACTOR_ID)
    search_type = run_info.get("search_type", "unknown")

    api_token = run_info.get("api_token")
    if not api_token:
        api_token = APIFY_TOKEN if search_type == "hashtag" else APIFY_USERNAME_TOKEN
    if not api_token:
        raise HTTPException(status_code=500, detail="Apify token not configured")

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            partial_results = []
            items_processed = 0
            try:
                status_response = await client.get(
                    f"https://api.apify.com/v2/acts/{actor_id}/runs/{run_id}?token={api_token}"
                )
                status_data = status_response.json()
                dataset_id = status_data["data"].get("defaultDatasetId")
                if dataset_id:
                    dataset_response = await client.get(
                        f"https://api.apify.com/v2/datasets/{dataset_id}/items?token={api_token}"
                    )
                    if dataset_response.status_code == 200:
                        items = dataset_response.json()
                        items_processed = len(items)
                        if items:
                            partial_results = await process_apify_results(items, user_email, search_type)
            except Exception as e:
                logger.warning(f"Could not retrieve partial results: {e}")

            await client.post(
                f"https://api.apify.com/v2/acts/{actor_id}/runs/{run_id}/abort?token={api_token}"
            )
            if run_id in active_runs:
                del active_runs[run_id]

            await log_audit("search_stopped", user_email, {
                "run_id": run_id, "partial_results_count": len(partial_results),
                "items_processed": items_processed
            })
            return {
                "status": "ABORTED",
                "message": f"Search stopped. Retrieved {len(partial_results)} reels from {items_processed} items processed.",
                "partial_results": [r.model_dump() for r in partial_results],
                "items_processed": items_processed,
                "results_count": len(partial_results)
            }
        except httpx.HTTPError as e:
            logger.error(f"Apify abort error: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to stop search: {str(e)}")


@router.post("/reels/upload", response_model=UploadResponse)
async def upload_reels(request: UploadRequest, user_email: str = Depends(get_current_user)):
    items = []
    completed = 0
    failed = 0

    for reel in request.reels:
        result = await upload_reel_to_cloudinary(reel, user_email)
        items.append(UploadProgressItem(**result))
        if result["status"] == "completed":
            completed += 1
        else:
            failed += 1

    await log_audit("upload", user_email, {"total": len(request.reels), "completed": completed, "failed": failed})
    return UploadResponse(total=len(request.reels), completed=completed, failed=failed, items=items)


@router.post("/reels/export")
async def export_reels(request: ExportRequest, user_email: str = Depends(get_current_user)):
    reels = request.reels
    if not reels:
        raise HTTPException(status_code=400, detail="No reels to export")

    owners = list(set(r.get("owner_username", "") for r in reels if r.get("owner_username")))
    date_str = datetime.now().strftime("%m-%d-%y")
    filename = f"{owners[0]}_{date_str}_results.csv" if len(owners) == 1 else f"multiple_owners_{date_str}_results.csv"

    def optimize_cloudinary_url(url: str) -> str:
        """Insert f_auto/q_auto/vc_auto between /upload/ and /v in Cloudinary URLs."""
        if not url or "/upload/" not in url:
            return url
        return url.replace("/upload/", "/upload/f_auto/q_auto/vc_auto/", 1)

    output = io.StringIO()
    writer = csv.writer(output)
    headers = [
        "owner_username", "owner_full_name", "reel_url", "downloaded_video_url",
        "original_video_url", "timestamp", "video_duration_seconds", "video_transcript",
        "tagged_users", "music_artist", "music_song", "music_original_audio",
        "location_name", "location_address", "cloudinary_url", "cloudinary_public_id"
    ]
    writer.writerow(headers)
    for reel in reels:
        tagged_users = reel.get("tagged_users", [])
        if isinstance(tagged_users, list):
            tagged_users = ", ".join(tagged_users)
        row = []
        for h in headers:
            if h == "tagged_users":
                row.append(tagged_users)
            elif h == "cloudinary_url":
                row.append(optimize_cloudinary_url(reel.get("cloudinary_url", "")))
            else:
                row.append(reel.get(h, ""))
        writer.writerow(row)
    output.seek(0)

    await log_audit("export", user_email, {"reels_count": len(reels), "filename": filename})
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
