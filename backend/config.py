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

# Cloudinary
cloudinary.config(
    cloud_name=os.environ.get("CLOUDINARY_CLOUD_NAME"),
    api_key=os.environ.get("CLOUDINARY_API_KEY"),
    api_secret=os.environ.get("CLOUDINARY_API_SECRET"),
    secure=True
)

# JWT
JWT_SECRET = os.environ.get("JWT_SECRET")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

# Auth
ALLOWLIST_USERS = os.environ.get("ALLOWLIST_USERS", "").split(",")
USER_PASSWORD = os.environ.get("USER_PASSWORD")

# Apify
APIFY_TOKEN = os.environ.get("APIFY_TOKEN")
APIFY_USERNAME_TOKEN = os.environ.get("APIFY_USERNAME_TOKEN")
APIFY_ACTOR_ID = "xMc5Ga1oCONPmWJIa"
APIFY_REEL_SCRAPER_ID = "apify~instagram-reel-scraper"
APIFY_HASHTAG_ACTOR_ID = "reGe1ST3OBgYZSsZJ"
APIFY_CACHE_STORE_NAME = "ig-reel-finder-cache"
APIFY_HASHTAG_KV_STORE_ID = "SvuIw7S8Yl3wY5Lvb"
