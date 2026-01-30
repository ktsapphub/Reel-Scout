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
APIFY_ACTOR_ID = "xMc5Ga1oCONPmWJIa"

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

# Store active runs
active_runs: Dict[str, Dict[str, Any]] = {}

@api_router.post("/reels/search/start", response_model=StartSearchResponse)
async def start_search(request: SearchRequest, user_email: str = Depends(get_current_user)):
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
        return StartSearchResponse(
            run_id="",
            status="NOT_SUPPORTED",
            message="Current Apify actor does not support direct URL mode. Use Username or Hashtag, or switch actors."
        )
    elif request.search_type == "hashtag":
        if not request.hashtag:
            raise HTTPException(status_code=400, detail="Hashtag required")
        # For now, hashtag also uses username search with hashtag as username prefix
        return StartSearchResponse(
            run_id="",
            status="NOT_SUPPORTED",
            message="Hashtag mode requires a hashtag-capable actor. Use Username mode or add a second Apify actor for hashtags."
        )
    else:
        raise HTTPException(status_code=400, detail="Invalid search type")
    
    # Start Apify actor
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            run_response = await client.post(
                f"https://api.apify.com/v2/acts/{APIFY_ACTOR_ID}/runs?token={APIFY_TOKEN}",
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
                "search_type": request.search_type
            }
            
            logger.info(f"Started Apify run: {run_id}")
            
            await log_audit("search_started", user_email, {
                "run_id": run_id,
                "search_type": request.search_type,
                "usernames": request.usernames,
                "max_results": request.max_results
            })
            
            return StartSearchResponse(run_id=run_id, status="RUNNING")
            
        except httpx.HTTPError as e:
            logger.error(f"Apify API error: {e}")
            raise HTTPException(status_code=500, detail=f"Apify API error: {str(e)}")

@api_router.get("/reels/search/status/{run_id}", response_model=SearchStatusResponse)
async def get_search_status(run_id: str, user_email: str = Depends(get_current_user)):
    if not APIFY_TOKEN:
        raise HTTPException(status_code=500, detail="Apify token not configured")
    
    run_info = active_runs.get(run_id, {})
    started_at = run_info.get("started_at", datetime.now(timezone.utc))
    max_results = run_info.get("max_results", 25)
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            status_response = await client.get(
                f"https://api.apify.com/v2/acts/{APIFY_ACTOR_ID}/runs/{run_id}?token={APIFY_TOKEN}"
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
                    
                    # Cleanup
                    if run_id in active_runs:
                        del active_runs[run_id]
                    
                    return SearchStatusResponse(
                        status=status,
                        progress=100,
                        estimated_seconds_remaining=0,
                        results=results,
                        total=len(results)
                    )
                else:
                    if run_id in active_runs:
                        del active_runs[run_id]
                    return SearchStatusResponse(
                        status=status,
                        progress=progress,
                        message=f"Search {status.lower()}"
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
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            abort_response = await client.post(
                f"https://api.apify.com/v2/acts/{APIFY_ACTOR_ID}/runs/{run_id}/abort?token={APIFY_TOKEN}"
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
    
    for item in items:
        # Only video reels
        if item.get("type") != "Video" and item.get("videoUrl") is None:
            continue
        
        # Duration filter (<= 120 seconds)
        duration = item.get("videoDuration", 0) or 0
        if duration > 120:
            continue
        
        # De-duplicate
        reel_url = item.get("url", "")
        reel_id = extract_reel_id(reel_url)
        if reel_id in seen_ids or reel_url in saved_urls:
            continue
        seen_ids.add(reel_id)
        
        # Extract music info
        music_info = item.get("musicInfo", {}) or {}
        
        # Map to our schema
        reel = ReelResult(
            owner_username=item.get("ownerUsername", ""),
            owner_full_name=item.get("ownerFullName", ""),
            reel_url=reel_url,
            downloaded_video_url=item.get("videoUrl", "") or item.get("downloadedVideoUrl", "") or "",
            original_video_url=item.get("videoUrl", "") or "",
            timestamp=item.get("timestamp", ""),
            video_duration_seconds=duration,
            video_transcript=item.get("transcript", "") or "",
            tagged_users=item.get("taggedUsers", []) or [],
            music_artist=music_info.get("artist_name", "") or "",
            music_song=music_info.get("song_name", "") or "",
            music_original_audio=music_info.get("is_original_audio", False) or False
        )
        results.append(reel)
    
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
