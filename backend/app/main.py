from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, HTMLResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from app.api.agents import router as agents_router
from app.api.auth import router as auth_router
from app.api.cases import router as cases_router
from app.api.devices import router as devices_router
from app.api.runs import router as runs_router
from app.core.config import settings
from app.services.state import store

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api")
app.include_router(cases_router, prefix="/api")
app.include_router(devices_router, prefix="/api")
app.include_router(runs_router, prefix="/api")
app.include_router(agents_router, prefix="/api")

ROOT_DIR = Path(__file__).resolve().parents[2]
FRONTEND_DIST_DIR = ROOT_DIR / "frontend" / "dist"
FRONTEND_INDEX = FRONTEND_DIST_DIR / "index.html"

if FRONTEND_DIST_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST_DIR / "assets")), name="assets")


@app.get("/health")
async def health() -> dict:
    return {"ok": True, "service": settings.app_name}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await store.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await store.disconnect(websocket)


@app.get("/")
async def serve_spa_root() -> Response:
    if FRONTEND_INDEX.exists():
        return FileResponse(FRONTEND_INDEX)
    return HTMLResponse(
        "<h2>Frontend build not found</h2><p>Run frontend build first: npm run build (in frontend folder).</p>",
        status_code=503,
    )


@app.get("/{full_path:path}")
async def serve_spa_fallback(full_path: str) -> Response:
    reserved_prefixes = ("api", "ws", "docs", "redoc", "openapi.json", "health", "assets")
    if full_path.startswith(reserved_prefixes):
        return HTMLResponse("Not Found", status_code=404)

    static_path = FRONTEND_DIST_DIR / full_path
    if static_path.exists() and static_path.is_file():
        return FileResponse(static_path)

    if FRONTEND_INDEX.exists():
        return FileResponse(FRONTEND_INDEX)
    return HTMLResponse("Not Found", status_code=404)
