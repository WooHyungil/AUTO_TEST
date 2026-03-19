from datetime import datetime

from fastapi import APIRouter

from app.schemas.auth import LoginRequest, LoginResponse
from app.services.state import UserSession, store

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest) -> LoginResponse:
    display_name = body.username
    session = UserSession(
        username=body.username,
        display_name=display_name,
        status=f"{display_name}님, 현재 작업 중입니다",
        updated_at=datetime.utcnow(),
    )
    store.user_sessions[body.username] = session
    await store.broadcast(
        "user_status",
        {
            "username": session.username,
            "display_name": session.display_name,
            "status": session.status,
            "updated_at": session.updated_at.isoformat(),
        },
    )
    return LoginResponse(
        username=body.username,
        display_name=display_name,
        message=session.status,
    )


@router.get("/sessions")
async def list_sessions() -> list[dict]:
    return [
        {
            "username": s.username,
            "display_name": s.display_name,
            "status": s.status,
            "updated_at": s.updated_at.isoformat(),
        }
        for s in store.user_sessions.values()
    ]
