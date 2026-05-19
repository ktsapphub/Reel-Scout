from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os

from config import mongo_client, logger

app = FastAPI(title="IG Reel Finder API", version="2.0.0")

# Import and include routers
from routes.auth import router as auth_router
from routes.reels import router as reels_router
from routes.apify import router as apify_router

app.include_router(auth_router)
app.include_router(reels_router)
app.include_router(apify_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    mongo_client.close()
