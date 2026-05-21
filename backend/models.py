from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone


class LoginRequest(BaseModel):
    email: str
    password: str

class LoginResponse(BaseModel):
    token: str
    email: str

class SearchRequest(BaseModel):
    search_type: str
    usernames: Optional[List[str]] = None
    urls: Optional[List[str]] = None
    hashtag: Optional[str] = None
    max_results: int = 25
    only_posts_newer_than: Optional[str] = None
    only_posts_older_than: Optional[str] = None
    include_tagged_posts: Optional[bool] = False

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
    status: str
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
    items_processed: int = 0

class ApifyConnectionStatus(BaseModel):
    connected: bool
    hashtag_token_valid: bool
    username_token_valid: bool
    username_actor_accessible: bool
    reel_scraper_accessible: bool
    hashtag_actor_accessible: bool
    account_info: Optional[dict] = None
    errors: List[str] = []
    message: str
