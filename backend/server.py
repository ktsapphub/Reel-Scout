from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import httpx
import cloudinary
import cloudinary.uploader
import re
import csv
import io
from fastapi.responses import StreamingResponse

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Cloudinary config
cloudinary.config(
    cloud_name=os.environ.get("CLOUDINARY_CLOUD_NAME"),
    api_key=os.environ.get("CLOUDINARY_API_KEY"),
    api_secret=os.environ.get("CLOUDINARY_API_SECRET"),
    secure=True
)

# JWT config
JWT_SECRET = os.environ.get("JWT_SECRET", "default_secret")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

# Allowlist
ALLOWLIST_USERS = os.environ.get("ALLOWLIST_USERS", "").split(",")
# Password hash for #Test1234
USER_PASSWORD = "#Test1234"

# Apify config
APIFY_TOKEN = os.environ.get("APIFY_TOKEN")
APIFY_ACTOR_ID = "xMc5Ga1oCONPmWJIa"  # Username scraper
APIFY_HASHTAG_ACTOR_ID = "reGe1ST3OBgYZSsZJ"  # Hashtag scraper
APIFY_CACHE_STORE_NAME = "ig-reel-finder-cache"

async def get_or_create_cache_store() -> str:
    """Get or create the key-value store for caching search results"""
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            # Try to get existing store
            response = await client.get(
                f"https://api.apify.com/v2/key-value-stores?token={APIFY_TOKEN}&unnamed=false"
            )
            stores = response.json().get("data", {}).get("items", [])
            
            for store in stores:
                if store.get("name") == APIFY_CACHE_STORE_NAME:
                    return store.get("id")
            
            # Create new store if not found
            create_response = await client.post(
                f"https://api.apify.com/v2/key-value-stores?token={APIFY_TOKEN}&name={APIFY_CACHE_STORE_NAME}"
            )
            if create_response.status_code == 201:
                return create_response.json().get("data", {}).get("id")
            
            return None
        except Exception as e:
            logger.error(f"Error getting/creating cache store: {e}")
            return None

def generate_cache_key(search_type: str, usernames: List[str] = None, hashtag: str = None, max_results: int = 25) -> str:
    """Generate a consistent cache key for search criteria"""
    import hashlib
    if search_type == "username" and usernames:
        # Sort usernames for consistent key
        sorted_users = sorted([u.lower().strip() for u in usernames])
        key_data = f"username:{','.join(sorted_users)}:limit:{max_results}"
    elif search_type == "hashtag" and hashtag:
        key_data = f"hashtag:{hashtag.lower().strip()}:limit:{max_results}"
    else:
        return None
    
    # Create hash for shorter key
    hash_obj = hashlib.md5(key_data.encode())
    return f"{search_type}_{hash_obj.hexdigest()[:16]}"

async def get_cached_results(cache_key: str) -> Optional[List[Dict]]:
    """Check if we have cached results for this search"""
    if not cache_key:
        return None
    
    store_id = await get_or_create_cache_store()
    if not store_id:
        return None
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.get(
                f"https://api.apify.com/v2/key-value-stores/{store_id}/records/{cache_key}?token={APIFY_TOKEN}"
            )
            if response.status_code == 200:
                data = response.json()
                # Check if cache is still valid (less than 24 hours old)
                cached_at = data.get("cached_at", "")
                if cached_at:
                    from datetime import datetime
                    cache_time = datetime.fromisoformat(cached_at.replace("Z", "+00:00"))
                    if (datetime.now(timezone.utc) - cache_time).total_seconds() < 86400:  # 24 hours
                        logger.info(f"Cache hit for key: {cache_key}")
                        return data.get("results", [])
            return None
        except Exception as e:
            logger.debug(f"Cache miss or error: {e}")
            return None

async def save_to_cache(cache_key: str, results: List[Dict]):
    """Save search results to cache"""
    if not cache_key or not results:
        return
    
    store_id = await get_or_create_cache_store()
    if not store_id:
        return
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            cache_data = {
                "cached_at": datetime.now(timezone.utc).isoformat(),
                "results": [r.model_dump() if hasattr(r, 'model_dump') else r for r in results]
            }
            await client.put(
                f"https://api.apify.com/v2/key-value-stores/{store_id}/records/{cache_key}?token={APIFY_TOKEN}",
                json=cache_data,
                headers={"Content-Type": "application/json"}
            )
            logger.info(f"Saved {len(results)} results to cache: {cache_key}")
        except Exception as e:
            logger.error(f"Error saving to cache: {e}")

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")
security = HTTPBearer()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ===================== MODELS =====================

class LoginRequest(BaseModel):
    email: str
    password: str

class LoginResponse(BaseModel):
    token: str
    email: str

class SearchRequest(BaseModel):
    search_type: str  # "username", "url", "hashtag"
    usernames: Optional[List[str]] = None
    urls: Optional[List[str]] = None
    hashtag: Optional[str] = None
    max_results: int = 25

class ReelResult(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    owner_username: str = ""
    owner_full_name: str = ""
    reel_url: str = ""
    downloaded_video_url: str = ""
    original_video_url: str = ""
    timestamp: str = ""
    video_duration_seconds: float = 0
    video_transcript: str = ""
    tagged_users: List[str] = []
    music_artist: str = ""
    music_song: str = ""
    music_original_audio: bool = False
    location_name: str = ""
    location_address: str = ""
    cloudinary_url: str = ""
    cloudinary_public_id: str = ""

class SearchResponse(BaseModel):
    results: List[ReelResult]
    total: int
    message: str = ""

class UploadRequest(BaseModel):
    reel_ids: List[str]
    reels: List[Dict[str, Any]]

class UploadProgressItem(BaseModel):
    reel_id: str
    status: str  # "pending", "uploading", "completed", "failed"
    progress: int = 0
    cloudinary_url: str = ""
    cloudinary_public_id: str = ""
    file_size_bytes: int = 0
    file_size_display: str = ""
    error: str = ""

class UploadResponse(BaseModel):
    total: int
    completed: int
    failed: int
    items: List[UploadProgressItem]

class ExportRequest(BaseModel):
    reels: List[Dict[str, Any]]
    selected_only: bool = False

class AuditLog(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    action: str
    user_email: str
    details: Dict[str, Any] = {}
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# ===================== AUTH HELPERS =====================

def create_token(email: str) -> str:
    expiration = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    payload = {
        "sub": email,
        "exp": expiration
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def verify_token(token: str) -> str:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload.get("sub")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    return verify_token(credentials.credentials)

async def log_audit(action: str, user_email: str, details: Dict[str, Any] = {}):
    audit = AuditLog(action=action, user_email=user_email, details=details)
    doc = audit.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    await db.audit_logs.insert_one(doc)

# ===================== AUTH ROUTES =====================

@api_router.post("/auth/login", response_model=LoginResponse)
async def login(request: LoginRequest):
    email = request.email.strip().lower()
    if email not in [u.strip().lower() for u in ALLOWLIST_USERS]:
        raise HTTPException(status_code=403, detail="Email not in allowlist")
    if request.password != USER_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid password")
    
    token = create_token(email)
    await log_audit("login", email)
    return LoginResponse(token=token, email=email)

@api_router.get("/auth/me")
async def get_me(user_email: str = Depends(get_current_user)):
    return {"email": user_email}

# ===================== REELS ROUTES =====================

def validate_instagram_reel_url(url: str) -> bool:
    patterns = [
        r'https?://(?:www\.)?instagram\.com/reel/[A-Za-z0-9_-]+',
        r'https?://(?:www\.)?instagram\.com/p/[A-Za-z0-9_-]+',
    ]
    return any(re.match(p, url) for p in patterns)

def extract_reel_id(url: str) -> str:
    match = re.search(r'/(?:reel|p)/([A-Za-z0-9_-]+)', url)
    return match.group(1) if match else url

def generate_content_slug(transcript: str) -> str:
    if not transcript:
        return "reel"
    # Take first 40 chars, lowercase, alphanumeric + hyphens
    slug = transcript[:60].lower()
    slug = re.sub(r'[^a-z0-9\s]', '', slug)
    slug = re.sub(r'\s+', '-', slug.strip())
    return slug[:40] if slug else "reel"

class ExecutionError(BaseModel):
    error_type: str = ""
    error_message: str = ""
    error_code: str = ""
    possible_cause: str = ""
    suggested_solution: str = ""
    technical_details: str = ""

class StartSearchResponse(BaseModel):
    run_id: str
    status: str
    message: str = ""
    error: Optional[ExecutionError] = None

class SearchStatusResponse(BaseModel):
    status: str
    progress: int = 0
    estimated_seconds_remaining: int = 0
    results: List[ReelResult] = []
    total: int = 0
    message: str = ""
    error: Optional[ExecutionError] = None

# Store active runs
active_runs: Dict[str, Dict[str, Any]] = {}

@api_router.post("/reels/search/start", response_model=StartSearchResponse)
async def start_search(request: SearchRequest, user_email: str = Depends(get_current_user)):
    if not APIFY_TOKEN:
        raise HTTPException(status_code=500, detail="Apify token not configured")
    
    actor_id = APIFY_ACTOR_ID  # Default to username actor
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
    elif request.search_type == "url":
        if not request.urls or len(request.urls) == 0:
            raise HTTPException(status_code=400, detail="At least one profile URL required")
        
        # Extract usernames from profile URLs
        extracted_usernames = []
        for url in request.urls:
            # Parse Instagram profile URL to get username
            # Supports: instagram.com/username, instagram.com/username/, www.instagram.com/username
            url = url.strip()
            match = re.search(r'instagram\.com/([A-Za-z0-9._]+)/?(?:\?|$|#)?', url)
            if match:
                username = match.group(1)
                # Filter out non-profile paths
                if username.lower() not in ['p', 'reel', 'reels', 'stories', 'explore', 'direct', 'accounts']:
                    extracted_usernames.append(username)
            else:
                # If not a URL, treat as username directly
                if url and not url.startswith('http'):
                    extracted_usernames.append(url.replace('@', ''))
        
        if not extracted_usernames:
            return StartSearchResponse(
                run_id="",
                status="ERROR",
                message="Could not extract any valid usernames from the provided URLs",
                error=ExecutionError(
                    error_type="INVALID_INPUT",
                    error_message="No valid Instagram profile URLs found",
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
        logger.info(f"Extracted usernames from URLs: {extracted_usernames}")
    elif request.search_type == "hashtag":
        if not request.hashtag:
            raise HTTPException(status_code=400, detail="Hashtag required")
        # Use hashtag actor
        actor_id = APIFY_HASHTAG_ACTOR_ID
        hashtag = request.hashtag.replace("#", "").strip()
        cache_key = generate_cache_key("hashtag", hashtag=hashtag, max_results=request.max_results)
        apify_input = {
            "hashtags": [hashtag],
            "resultsType": "posts",
            "resultsLimit": request.max_results
        }
    else:
        raise HTTPException(status_code=400, detail="Invalid search type")
    
    # Check cache first
    if cache_key:
        cached_results = await get_cached_results(cache_key)
        if cached_results:
            logger.info(f"Returning {len(cached_results)} cached results for {cache_key}")
            # Store in active_runs with special status for immediate retrieval
            cache_run_id = f"cache_{cache_key}_{datetime.now(timezone.utc).timestamp()}"
            active_runs[cache_run_id] = {
                "user_email": user_email,
                "started_at": datetime.now(timezone.utc),
                "max_results": request.max_results,
                "search_type": request.search_type,
                "actor_id": actor_id,
                "cached_results": cached_results,
                "is_cached": True
            }
            
            await log_audit("search_cached", user_email, {
                "cache_key": cache_key,
                "search_type": request.search_type,
                "results_count": len(cached_results)
            })
            
            return StartSearchResponse(
                run_id=cache_run_id,
                status="CACHED",
                message=f"Found {len(cached_results)} cached results from previous search"
            )
    
    # Start Apify actor
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            run_response = await client.post(
                f"https://api.apify.com/v2/acts/{actor_id}/runs?token={APIFY_TOKEN}",
                json=apify_input,
                headers={"Content-Type": "application/json"}
            )
            run_response.raise_for_status()
            run_data = run_response.json()
            run_id = run_data["data"]["id"]
            
            # Store run info
            active_runs[run_id] = {
                "user_email": user_email,
                "started_at": datetime.now(timezone.utc),
                "max_results": request.max_results,
                "search_type": request.search_type,
                "actor_id": actor_id,
                "cache_key": cache_key
            }
            
            logger.info(f"Started Apify run: {run_id} with actor: {actor_id}")
            
            await log_audit("search_started", user_email, {
                "run_id": run_id,
                "search_type": request.search_type,
                "usernames": request.usernames,
                "hashtag": request.hashtag,
                "max_results": request.max_results,
                "actor_id": actor_id
            })
            
            return StartSearchResponse(run_id=run_id, status="RUNNING")
            
        except httpx.TimeoutException as e:
            logger.error(f"Apify API timeout: {e}")
            return StartSearchResponse(
                run_id="",
                status="ERROR",
                message="Request timed out",
                error=ExecutionError(
                    error_type="TIMEOUT",
                    error_message="The request to Apify API timed out",
                    error_code="APIFY_TIMEOUT",
                    possible_cause="Apify servers may be experiencing high load or the request took too long to process",
                    suggested_solution="Try again in a few minutes. If the problem persists, reduce the number of results requested.",
                    technical_details=str(e)
                )
            )
        except httpx.HTTPStatusError as e:
            logger.error(f"Apify API HTTP error: {e}")
            status_code = e.response.status_code
            error_body = e.response.text[:500] if e.response.text else "No response body"
            
            if status_code == 401:
                return StartSearchResponse(
                    run_id="",
                    status="ERROR",
                    message="Authentication failed",
                    error=ExecutionError(
                        error_type="AUTHENTICATION",
                        error_message="Invalid or expired Apify API token",
                        error_code=f"HTTP_{status_code}",
                        possible_cause="The Apify API token is invalid, expired, or has been revoked",
                        suggested_solution="Contact your administrator to verify the Apify API token is correct and active.",
                        technical_details=f"Status: {status_code}, Response: {error_body}"
                    )
                )
            elif status_code == 403:
                return StartSearchResponse(
                    run_id="",
                    status="ERROR",
                    message="Access denied",
                    error=ExecutionError(
                        error_type="AUTHORIZATION",
                        error_message="You don't have permission to use this Apify actor",
                        error_code=f"HTTP_{status_code}",
                        possible_cause="The API token doesn't have permission to run this actor, or usage limits have been exceeded",
                        suggested_solution="Check your Apify account permissions and billing status.",
                        technical_details=f"Status: {status_code}, Response: {error_body}"
                    )
                )
            elif status_code == 429:
                return StartSearchResponse(
                    run_id="",
                    status="ERROR",
                    message="Rate limit exceeded",
                    error=ExecutionError(
                        error_type="RATE_LIMIT",
                        error_message="Too many requests to Apify API",
                        error_code=f"HTTP_{status_code}",
                        possible_cause="You've made too many requests in a short period of time",
                        suggested_solution="Wait a few minutes before trying again. Consider spacing out your searches.",
                        technical_details=f"Status: {status_code}, Response: {error_body}"
                    )
                )
            else:
                return StartSearchResponse(
                    run_id="",
                    status="ERROR",
                    message=f"API error (HTTP {status_code})",
                    error=ExecutionError(
                        error_type="API_ERROR",
                        error_message=f"Apify API returned an error",
                        error_code=f"HTTP_{status_code}",
                        possible_cause="There may be an issue with the Apify service or the request parameters",
                        suggested_solution="Try again later. If the problem persists, check Apify status page.",
                        technical_details=f"Status: {status_code}, Response: {error_body}"
                    )
                )
        except httpx.HTTPError as e:
            logger.error(f"Apify API error: {e}")
            return StartSearchResponse(
                run_id="",
                status="ERROR",
                message="Connection error",
                error=ExecutionError(
                    error_type="CONNECTION",
                    error_message="Failed to connect to Apify API",
                    error_code="CONNECTION_FAILED",
                    possible_cause="Network connectivity issues or Apify servers are unreachable",
                    suggested_solution="Check your internet connection and try again. The Apify service might be temporarily unavailable.",
                    technical_details=str(e)
                )
            )
        except Exception as e:
            logger.error(f"Unexpected error: {e}")
            return StartSearchResponse(
                run_id="",
                status="ERROR",
                message="Unexpected error occurred",
                error=ExecutionError(
                    error_type="UNEXPECTED",
                    error_message="An unexpected error occurred while starting the search",
                    error_code="INTERNAL_ERROR",
                    possible_cause="An internal server error occurred",
                    suggested_solution="Try again. If the problem persists, contact support.",
                    technical_details=str(e)
                )
            )

@api_router.get("/reels/search/status/{run_id}", response_model=SearchStatusResponse)
async def get_search_status(run_id: str, user_email: str = Depends(get_current_user)):
    if not APIFY_TOKEN:
        raise HTTPException(status_code=500, detail="Apify token not configured")
    
    run_info = active_runs.get(run_id, {})
    
    # Handle cached results
    if run_info.get("is_cached"):
        cached_results = run_info.get("cached_results", [])
        # Convert cached dicts back to ReelResult objects
        results = []
        for item in cached_results:
            try:
                results.append(ReelResult(**item))
            except Exception as e:
                logger.error(f"Error converting cached result: {e}")
        
        if run_id in active_runs:
            del active_runs[run_id]
        
        return SearchStatusResponse(
            status="SUCCEEDED",
            progress=100,
            estimated_seconds_remaining=0,
            results=results,
            total=len(results),
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
                f"https://api.apify.com/v2/acts/{actor_id}/runs/{run_id}?token={APIFY_TOKEN}"
            )
            status_data = status_response.json()
            status = status_data["data"]["status"]
            
            # Calculate progress and ETA
            elapsed = (datetime.now(timezone.utc) - started_at).total_seconds()
            # Estimate based on typical run times (roughly 2-3 seconds per result)
            estimated_total = max_results * 2.5
            progress = min(95, int((elapsed / estimated_total) * 100)) if estimated_total > 0 else 0
            estimated_remaining = max(0, int(estimated_total - elapsed))
            
            if status in ["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"]:
                progress = 100 if status == "SUCCEEDED" else progress
                
                if status == "SUCCEEDED":
                    # Get results
                    dataset_id = status_data["data"]["defaultDatasetId"]
                    dataset_response = await client.get(
                        f"https://api.apify.com/v2/datasets/{dataset_id}/items?token={APIFY_TOKEN}"
                    )
                    dataset_response.raise_for_status()
                    items = dataset_response.json()
                    
                    # Process results
                    results = await process_apify_results(items, user_email)
                    
                    # Save to cache for future use
                    if cache_key and results:
                        await save_to_cache(cache_key, results)
                    
                    # Cleanup
                    if run_id in active_runs:
                        del active_runs[run_id]
                    
                    return SearchStatusResponse(
                        status=status,
                        progress=100,
                        estimated_seconds_remaining=0,
                        results=results,
                        total=len(results),
                        message=f"Successfully retrieved {len(results)} reels" if results else "Search completed but no matching reels found"
                    )
                elif status == "FAILED":
                    if run_id in active_runs:
                        del active_runs[run_id]
                    return SearchStatusResponse(
                        status=status,
                        progress=progress,
                        message="Search failed",
                        error=ExecutionError(
                            error_type="ACTOR_FAILED",
                            error_message="The Apify actor failed to complete the search",
                            error_code="APIFY_RUN_FAILED",
                            possible_cause="The Instagram scraping actor encountered an error. This could be due to Instagram rate limiting, invalid usernames, or temporary Instagram API issues.",
                            suggested_solution="1. Verify the username(s) are correct and the accounts are public. 2. Try with fewer usernames. 3. Wait a few minutes and try again.",
                            technical_details=f"Run ID: {run_id}, Status: {status}"
                        )
                    )
                elif status == "ABORTED":
                    if run_id in active_runs:
                        del active_runs[run_id]
                    return SearchStatusResponse(
                        status=status,
                        progress=progress,
                        message="Search was stopped by user"
                    )
                elif status == "TIMED-OUT":
                    if run_id in active_runs:
                        del active_runs[run_id]
                    return SearchStatusResponse(
                        status=status,
                        progress=progress,
                        message="Search timed out",
                        error=ExecutionError(
                            error_type="TIMEOUT",
                            error_message="The search took too long and was automatically stopped",
                            error_code="APIFY_TIMEOUT",
                            possible_cause="The search requested too many results or Instagram is rate limiting requests",
                            suggested_solution="Try searching for fewer results (e.g., 25 instead of 100) or search for fewer usernames at once.",
                            technical_details=f"Run ID: {run_id}, Status: {status}"
                        )
                    )
                else:
                    if run_id in active_runs:
                        del active_runs[run_id]
                    return SearchStatusResponse(
                        status=status,
                        progress=progress,
                        message=f"Search ended with status: {status}"
                    )
            
            return SearchStatusResponse(
                status=status,
                progress=progress,
                estimated_seconds_remaining=estimated_remaining
            )
            
        except httpx.HTTPError as e:
            logger.error(f"Apify API error: {e}")
            raise HTTPException(status_code=500, detail=f"Apify API error: {str(e)}")

@api_router.post("/reels/search/stop/{run_id}")
async def stop_search(run_id: str, user_email: str = Depends(get_current_user)):
    if not APIFY_TOKEN:
        raise HTTPException(status_code=500, detail="Apify token not configured")
    
    run_info = active_runs.get(run_id, {})
    actor_id = run_info.get("actor_id", APIFY_ACTOR_ID)
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            abort_response = await client.post(
                f"https://api.apify.com/v2/acts/{actor_id}/runs/{run_id}/abort?token={APIFY_TOKEN}"
            )
            
            if run_id in active_runs:
                del active_runs[run_id]
            
            await log_audit("search_stopped", user_email, {"run_id": run_id})
            
            return {"status": "ABORTED", "message": "Search stopped successfully"}
            
        except httpx.HTTPError as e:
            logger.error(f"Apify abort error: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to stop search: {str(e)}")

async def process_apify_results(items: List[Dict], user_email: str) -> List[ReelResult]:
    """Process Apify results into ReelResult objects"""
    results = []
    seen_ids = set()
    
    # Get previously saved reel IDs for de-duplication
    saved_reels = await db.saved_reels.find({}, {"reel_url": 1, "_id": 0}).to_list(10000)
    saved_urls = {r["reel_url"] for r in saved_reels}
    
    logger.info(f"Processing {len(items)} items from Apify")
    
    for item in items:
        try:
            # Check if it's a video - be more lenient with type checking
            item_type = item.get("type", "")
            video_url = item.get("videoUrl") or item.get("video_url") or item.get("displayUrl")
            
            # Skip if not a video (but be lenient - if there's a video URL, include it)
            if item_type and item_type != "Video" and not video_url:
                logger.debug(f"Skipping non-video item: {item_type}")
                continue
            
            # Duration filter (<= 120 seconds) - be lenient if duration not available
            duration = item.get("videoDuration") or item.get("video_duration") or 0
            if duration and duration > 120:
                logger.debug(f"Skipping item with duration > 120s: {duration}")
                continue
            
            # De-duplicate
            reel_url = item.get("url") or item.get("shortCode") or ""
            if not reel_url:
                continue
                
            reel_id = extract_reel_id(reel_url)
            if reel_id in seen_ids or reel_url in saved_urls:
                continue
            seen_ids.add(reel_id)
            
            # Extract music info - handle different structures
            music_info = item.get("musicInfo") or item.get("music_info") or {}
            if isinstance(music_info, dict):
                music_artist = music_info.get("artist_name") or music_info.get("artistName") or ""
                music_song = music_info.get("song_name") or music_info.get("songName") or music_info.get("title") or ""
                music_original = music_info.get("is_original_audio") or music_info.get("isOriginalAudio") or False
            else:
                music_artist = ""
                music_song = ""
                music_original = False
            
            # Extract tagged users - handle both string arrays and object arrays
            raw_tagged = item.get("taggedUsers") or item.get("tagged_users") or []
            tagged_users = []
            if isinstance(raw_tagged, list):
                for user in raw_tagged:
                    if isinstance(user, str):
                        tagged_users.append(user)
                    elif isinstance(user, dict):
                        # Extract username from object
                        username = user.get("username") or user.get("user") or user.get("name") or ""
                        if username:
                            tagged_users.append(username)
            
            # Get video URLs
            downloaded_url = item.get("videoUrl") or item.get("video_url") or item.get("downloadedVideoUrl") or ""
            original_url = item.get("videoUrl") or item.get("displayUrl") or ""
            
            # Get transcript
            transcript = item.get("transcript") or item.get("caption") or item.get("text") or ""
            
            # Map to our schema
            reel = ReelResult(
                owner_username=item.get("ownerUsername") or item.get("owner_username") or item.get("username") or "",
                owner_full_name=item.get("ownerFullName") or item.get("owner_full_name") or item.get("fullName") or "",
                reel_url=reel_url,
                downloaded_video_url=downloaded_url,
                original_video_url=original_url,
                timestamp=item.get("timestamp") or item.get("taken_at") or item.get("takenAt") or "",
                video_duration_seconds=duration or 0,
                video_transcript=transcript,
                tagged_users=tagged_users,
                music_artist=music_artist,
                music_song=music_song,
                music_original_audio=music_original
            )
            results.append(reel)
            
        except Exception as e:
            logger.error(f"Error processing item: {e}")
            continue
    
    logger.info(f"Processed {len(results)} valid reels from {len(items)} items")
    return results

@api_router.post("/reels/search", response_model=SearchResponse)
async def search_reels(request: SearchRequest, user_email: str = Depends(get_current_user)):
    """Legacy synchronous search endpoint"""
    if not APIFY_TOKEN:
        raise HTTPException(status_code=500, detail="Apify token not configured")
    
    # Build Apify input
    apify_input = {
        "resultsLimit": request.max_results,
        "skipPinnedPosts": True,
        "includeSharesCount": False,
        "includeTranscript": True,
        "includeDownloadedVideo": True
    }
    
    if request.search_type == "username":
        if not request.usernames or len(request.usernames) == 0:
            raise HTTPException(status_code=400, detail="At least one username required")
        apify_input["username"] = request.usernames
    elif request.search_type == "url":
        return SearchResponse(
            results=[],
            total=0,
            message="Current Apify actor does not support direct URL mode. Use Username or Hashtag, or switch actors."
        )
    elif request.search_type == "hashtag":
        return SearchResponse(
            results=[],
            total=0,
            message="Hashtag mode requires a hashtag-capable actor. Use Username mode or add a second Apify actor for hashtags."
        )
    else:
        raise HTTPException(status_code=400, detail="Invalid search type")
    
    # Call Apify actor
    async with httpx.AsyncClient(timeout=300.0) as http_client:
        try:
            # Start the actor run
            run_response = await http_client.post(
                f"https://api.apify.com/v2/acts/{APIFY_ACTOR_ID}/runs?token={APIFY_TOKEN}",
                json=apify_input,
                headers={"Content-Type": "application/json"}
            )
            run_response.raise_for_status()
            run_data = run_response.json()
            run_id = run_data["data"]["id"]
            
            logger.info(f"Started Apify run: {run_id}")
            
            # Poll for completion
            import asyncio
            max_wait = 300  # 5 minutes
            poll_interval = 5
            elapsed = 0
            
            while elapsed < max_wait:
                status_response = await http_client.get(
                    f"https://api.apify.com/v2/acts/{APIFY_ACTOR_ID}/runs/{run_id}?token={APIFY_TOKEN}"
                )
                status_data = status_response.json()
                status = status_data["data"]["status"]
                
                if status in ["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"]:
                    break
                
                await asyncio.sleep(poll_interval)
                elapsed += poll_interval
            
            if status != "SUCCEEDED":
                raise HTTPException(status_code=500, detail=f"Apify run failed with status: {status}")
            
            # Get dataset results
            dataset_id = status_data["data"]["defaultDatasetId"]
            dataset_response = await http_client.get(
                f"https://api.apify.com/v2/datasets/{dataset_id}/items?token={APIFY_TOKEN}"
            )
            dataset_response.raise_for_status()
            items = dataset_response.json()
            
        except httpx.HTTPError as e:
            logger.error(f"Apify API error: {e}")
            raise HTTPException(status_code=500, detail=f"Apify API error: {str(e)}")
    
    # Process results
    results = await process_apify_results(items, user_email)
    
    await log_audit("search", user_email, {
        "search_type": request.search_type,
        "usernames": request.usernames,
        "max_results": request.max_results,
        "results_count": len(results)
    })
    
    return SearchResponse(results=results, total=len(results))

@api_router.post("/reels/upload")
async def upload_reels(request: UploadRequest, user_email: str = Depends(get_current_user)):
    uploaded = []
    errors = []
    
    for reel in request.reels:
        video_url = reel.get("downloaded_video_url") or reel.get("original_video_url")
        if not video_url:
            errors.append({"reel_id": reel.get("id"), "error": "No video URL"})
            continue
        
        try:
            # Generate public_id
            owner = reel.get("owner_username", "unknown")
            transcript = reel.get("video_transcript", "")
            content_slug = generate_content_slug(transcript)
            date_str = datetime.now().strftime("%b-%d-%Y")
            public_id = f"Content for Vibe Check/{owner}_{content_slug}_{date_str}"
            
            # Upload to Cloudinary
            result = cloudinary.uploader.upload(
                video_url,
                resource_type="video",
                folder="Content for Vibe Check",
                public_id=f"{owner}_{content_slug}_{date_str}",
                overwrite=True
            )
            
            uploaded.append({
                "reel_id": reel.get("id"),
                "cloudinary_url": result.get("secure_url"),
                "cloudinary_public_id": result.get("public_id")
            })
            
            # Save to de-dupe index
            await db.saved_reels.update_one(
                {"reel_url": reel.get("reel_url")},
                {"$set": {
                    "reel_url": reel.get("reel_url"),
                    "cloudinary_url": result.get("secure_url"),
                    "cloudinary_public_id": result.get("public_id"),
                    "uploaded_at": datetime.now(timezone.utc).isoformat(),
                    "uploaded_by": user_email
                }},
                upsert=True
            )
            
        except Exception as e:
            logger.error(f"Cloudinary upload error: {e}")
            errors.append({"reel_id": reel.get("id"), "error": str(e)})
    
    await log_audit("upload", user_email, {
        "uploaded_count": len(uploaded),
        "error_count": len(errors)
    })
    
    return {"uploaded": uploaded, "errors": errors}

@api_router.post("/reels/export")
async def export_reels(request: ExportRequest, user_email: str = Depends(get_current_user)):
    reels = request.reels
    if not reels:
        raise HTTPException(status_code=400, detail="No reels to export")
    
    # Determine filename
    owners = list(set(r.get("owner_username", "") for r in reels if r.get("owner_username")))
    date_str = datetime.now().strftime("%m-%d-%y")
    
    if len(owners) == 1:
        filename = f"{owners[0]}_{date_str}_results.csv"
    else:
        filename = f"multiple_owners_{date_str}_results.csv"
    
    # Create CSV
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Header
    headers = [
        "owner_username", "owner_full_name", "reel_url", "downloaded_video_url",
        "original_video_url", "timestamp", "video_duration_seconds", "video_transcript",
        "tagged_users", "music_artist", "music_song", "music_original_audio",
        "location_name", "location_address", "cloudinary_url", "cloudinary_public_id"
    ]
    writer.writerow(headers)
    
    # Data rows
    for reel in reels:
        tagged_users = reel.get("tagged_users", [])
        if isinstance(tagged_users, list):
            tagged_users = ", ".join(tagged_users)
        
        row = [
            reel.get("owner_username", ""),
            reel.get("owner_full_name", ""),
            reel.get("reel_url", ""),
            reel.get("downloaded_video_url", ""),
            reel.get("original_video_url", ""),
            reel.get("timestamp", ""),
            reel.get("video_duration_seconds", ""),
            reel.get("video_transcript", ""),
            tagged_users,
            reel.get("music_artist", ""),
            reel.get("music_song", ""),
            reel.get("music_original_audio", ""),
            reel.get("location_name", ""),
            reel.get("location_address", ""),
            reel.get("cloudinary_url", ""),
            reel.get("cloudinary_public_id", "")
        ]
        writer.writerow(row)
    
    output.seek(0)
    
    await log_audit("export", user_email, {
        "reels_count": len(reels),
        "filename": filename
    })
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@api_router.get("/audit-logs")
async def get_audit_logs(user_email: str = Depends(get_current_user)):
    logs = await db.audit_logs.find({}, {"_id": 0}).sort("timestamp", -1).to_list(100)
    return {"logs": logs}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
