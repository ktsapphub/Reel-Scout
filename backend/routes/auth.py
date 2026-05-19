from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from datetime import datetime, timezone, timedelta
import jwt

from config import JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRATION_HOURS, ALLOWLIST_USERS, USER_PASSWORD, db, logger
from models import LoginRequest, LoginResponse, AuditLog

router = APIRouter(prefix="/api")
security = HTTPBearer()


def create_token(email: str) -> str:
    expiration = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    return jwt.encode({"sub": email, "exp": expiration}, JWT_SECRET, algorithm=JWT_ALGORITHM)


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


async def log_audit(action: str, user_email: str, details: dict = {}):
    audit = AuditLog(action=action, user_email=user_email, details=details)
    doc = audit.model_dump()
    doc['timestamp'] = doc['timestamp'].isoformat()
    await db.audit_logs.insert_one(doc)


@router.post("/auth/login", response_model=LoginResponse)
async def login(request: LoginRequest):
    email = request.email.strip().lower()
    if email not in [u.strip().lower() for u in ALLOWLIST_USERS]:
        raise HTTPException(status_code=403, detail="Email not in allowlist")
    if request.password != USER_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid password")
    token = create_token(email)
    await log_audit("login", email)
    return LoginResponse(token=token, email=email)


@router.get("/auth/me")
async def get_me(user_email: str = Depends(get_current_user)):
    return {"email": user_email}


@router.get("/audit-logs")
async def get_audit_logs(user_email: str = Depends(get_current_user)):
    logs = await db.audit_logs.find({}, {"_id": 0}).sort("timestamp", -1).to_list(100)
    return {"logs": logs}
