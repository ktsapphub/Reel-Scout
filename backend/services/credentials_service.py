"""
Credentials service: stores encrypted runtime credential overrides in MongoDB.
At runtime, DB overrides take precedence over .env values.
"""
import base64
import os
from typing import Optional, Dict
from datetime import datetime, timezone
from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

from config import db, logger, JWT_SECRET


# Editable credentials -> human metadata
EDITABLE_CREDENTIALS = {
    "APIFY_TOKEN": {
        "service": "apify",
        "label": "Apify Hashtag Token",
        "description": "API token used for hashtag scraping",
        "sensitive": True,
    },
    "APIFY_USERNAME_TOKEN": {
        "service": "apify",
        "label": "Apify Username Token",
        "description": "API token used for profile/username scraping",
        "sensitive": True,
    },
    "CLOUDINARY_CLOUD_NAME": {
        "service": "cloudinary",
        "label": "Cloud Name",
        "description": "Cloudinary cloud identifier",
        "sensitive": False,
    },
    "CLOUDINARY_API_KEY": {
        "service": "cloudinary",
        "label": "API Key",
        "description": "Cloudinary API key",
        "sensitive": True,
    },
    "CLOUDINARY_API_SECRET": {
        "service": "cloudinary",
        "label": "API Secret",
        "description": "Cloudinary API secret",
        "sensitive": True,
    },
}


def _derive_key() -> bytes:
    """Derive a Fernet key from JWT_SECRET (PBKDF2)."""
    if not JWT_SECRET:
        raise RuntimeError("JWT_SECRET not configured; cannot encrypt credentials")
    salt = b"ig-reel-finder-creds-v1"
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=200_000)
    return base64.urlsafe_b64encode(kdf.derive(JWT_SECRET.encode()))


_fernet: Optional[Fernet] = None


def _cipher() -> Fernet:
    global _fernet
    if _fernet is None:
        _fernet = Fernet(_derive_key())
    return _fernet


def encrypt_value(value: str) -> str:
    return _cipher().encrypt(value.encode()).decode()


def decrypt_value(token: str) -> Optional[str]:
    try:
        return _cipher().decrypt(token.encode()).decode()
    except (InvalidToken, Exception) as e:
        logger.error(f"Failed to decrypt credential: {e}")
        return None


def mask_value(value: Optional[str], key: str) -> str:
    """Mask a credential for display (preserves last 4 chars)."""
    if not value:
        return ""
    meta = EDITABLE_CREDENTIALS.get(key, {})
    if not meta.get("sensitive"):
        return value
    if len(value) <= 6:
        return "•" * len(value)
    return f"{'•' * 8}{value[-4:]}"


async def load_all_overrides() -> Dict[str, str]:
    """Load all decrypted credential overrides from MongoDB."""
    overrides: Dict[str, str] = {}
    async for doc in db.service_credentials.find({}, {"_id": 0}):
        key = doc.get("key")
        enc = doc.get("encrypted_value")
        if key and enc:
            plain = decrypt_value(enc)
            if plain is not None:
                overrides[key] = plain
    return overrides


async def save_override(key: str, value: str, updated_by: str) -> None:
    """Encrypt and persist a credential override."""
    if key not in EDITABLE_CREDENTIALS:
        raise ValueError(f"Credential '{key}' is not editable")
    encrypted = encrypt_value(value)
    await db.service_credentials.update_one(
        {"key": key},
        {"$set": {
            "key": key,
            "encrypted_value": encrypted,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": updated_by,
        }},
        upsert=True,
    )


async def delete_override(key: str) -> None:
    """Remove a DB override (falls back to .env)."""
    await db.service_credentials.delete_one({"key": key})


async def get_credential_metadata(key: str) -> dict:
    """Return masked credential + source info for the Settings UI."""
    from config import get_runtime_value, env_value
    current = get_runtime_value(key)
    env_val = env_value(key)
    override_doc = await db.service_credentials.find_one({"key": key}, {"_id": 0})
    return {
        "key": key,
        "label": EDITABLE_CREDENTIALS.get(key, {}).get("label", key),
        "description": EDITABLE_CREDENTIALS.get(key, {}).get("description", ""),
        "service": EDITABLE_CREDENTIALS.get(key, {}).get("service", ""),
        "sensitive": EDITABLE_CREDENTIALS.get(key, {}).get("sensitive", True),
        "masked_value": mask_value(current, key),
        "has_value": bool(current),
        "source": "database" if override_doc else ("env" if env_val else "none"),
        "updated_at": override_doc.get("updated_at") if override_doc else None,
        "updated_by": override_doc.get("updated_by") if override_doc else None,
    }
