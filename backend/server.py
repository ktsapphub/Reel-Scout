from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os

from config import mongo_client, logger, apply_overrides

app = FastAPI(title="Reel Scout API", version="2.6.15")

# Import and include routers
from routes.auth import router as auth_router
from routes.reels import router as reels_router
from routes.apify import router as apify_router
from routes.settings import router as settings_router
from routes.presets import router as presets_router

app.include_router(auth_router)
app.include_router(reels_router)
app.include_router(apify_router)
app.include_router(settings_router)
app.include_router(presets_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def load_credential_overrides():
    """At startup, load any DB-stored credential overrides into the runtime config."""
    try:
        from services.credentials_service import load_all_overrides
        overrides = await load_all_overrides()
        if overrides:
            apply_overrides(overrides)
            logger.info(f"Loaded {len(overrides)} credential override(s) from DB")
    except Exception as e:
        logger.error(f"Failed to load credential overrides: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    mongo_client.close()
