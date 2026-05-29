from dotenv import load_dotenv
from pathlib import Path
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import cloudinary

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# MongoDB
mongo_url = os.environ['MONGO_URL']
mongo_client = AsyncIOMotorClient(mongo_url)
db = mongo_client[os.environ['DB_NAME']]

# JWT
JWT_SECRET = os.environ.get("JWT_SECRET")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

# Auth
ALLOWLIST_USERS = os.environ.get("ALLOWLIST_USERS", "").split(",")
USER_PASSWORD = os.environ.get("USER_PASSWORD")

# Apify (static actor IDs — not editable at runtime)
APIFY_ACTOR_ID = "xMc5Ga1oCONPmWJIa"
APIFY_REEL_SCRAPER_ID = "apify~instagram-reel-scraper"
APIFY_GENERAL_SCRAPER_ID = "apify~instagram-scraper"  # General — supports directUrls
APIFY_HASHTAG_ACTOR_ID = "reGe1ST3OBgYZSsZJ"
APIFY_CACHE_STORE_NAME = "ig-reel-finder-cache"
APIFY_HASHTAG_KV_STORE_ID = "SvuIw7S8Yl3wY5Lvb"


# --- Runtime credential container ---
# Keys whose values can be overridden by DB at runtime. .env is the fallback.
_RUNTIME_KEYS = (
    "APIFY_TOKEN",
    "APIFY_USERNAME_TOKEN",
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET",
)

_runtime = {k: os.environ.get(k) for k in _RUNTIME_KEYS}


def get_runtime_value(key: str):
    return _runtime.get(key)


def env_value(key: str):
    """Original .env value (for source detection)."""
    return os.environ.get(key)


def _reconfigure_cloudinary():
    cloudinary.config(
        cloud_name=_runtime.get("CLOUDINARY_CLOUD_NAME"),
        api_key=_runtime.get("CLOUDINARY_API_KEY"),
        api_secret=_runtime.get("CLOUDINARY_API_SECRET"),
        secure=True,
    )


def set_runtime_value(key: str, value):
    if key not in _RUNTIME_KEYS:
        raise ValueError(f"Unknown runtime key: {key}")
    _runtime[key] = value
    if key.startswith("CLOUDINARY_"):
        _reconfigure_cloudinary()


def apply_overrides(overrides: dict):
    """Bulk apply DB overrides at startup."""
    for k, v in overrides.items():
        if k in _RUNTIME_KEYS and v:
            _runtime[k] = v
    _reconfigure_cloudinary()


# Initial Cloudinary configuration (from .env)
_reconfigure_cloudinary()


# --- Backwards-compatible attribute access (e.g. config.APIFY_TOKEN) ---
# Existing code reading `APIFY_TOKEN` at module level captured a static value at import.
# To avoid breaking it during migration, use get_runtime_value() in services/routes.
APIFY_TOKEN = _runtime.get("APIFY_TOKEN")
APIFY_USERNAME_TOKEN = _runtime.get("APIFY_USERNAME_TOKEN")
