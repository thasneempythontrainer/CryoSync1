"""Self-hosted entry point for CryoSync.

Serves the FastAPI backend (backend/main.py) and the built React frontend
(dist/) as a single app so the whole platform is one URL.

Run locally (each in its own terminal):
    cd backend && python -m uvicorn main:app --reload --port 8000   # API only
or the all-in-one server below that also serves the built frontend:
    python run_server.py
"""

import os
import sys

import uvicorn
from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

# backend/main.py (and its siblings) use absolute imports like
# `from database import ...`, so backend/ must be on sys.path - the same
# layout used when running the backend locally (cd backend; uvicorn main:app).
_BACKEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend")
sys.path.insert(0, _BACKEND_DIR)

from main import app  # noqa: E402


def _dist_dir() -> str:
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), "dist")


def mount_frontend(application: FastAPI) -> None:
    """Mount the built frontend at / with an SPA fallback to index.html.

    API routes are registered first (via backend.main import), so /api/*
    still resolves to the backend. Anything else serves the React app,
    which handles client-side routing itself.
    """
    dist_dir = _dist_dir()
    if not os.path.isdir(dist_dir):
        print("dist/ not found - skipping frontend static mount (run `npm run build`)")
        return

    class SPAStaticFiles(StaticFiles):
        async def get_response(self, path, scope):
            try:
                return await super().get_response(path, scope)
            except StarletteHTTPException as exc:
                if exc.status_code == 404:
                    index = os.path.join(dist_dir, "index.html")
                    if os.path.isfile(index):
                        return FileResponse(index)
                raise

    application.mount("/", SPAStaticFiles(directory=dist_dir, html=True))


@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def api_route_not_found(path: str):
    return JSONResponse({"detail": f"API endpoint /api/{path} not found"}, status_code=404)


mount_frontend(app)


if __name__ == "__main__":
    port = int(os.getenv("CRYOSYNC_PORT", os.getenv("PORT", "8080")))
    host = os.getenv("CRYOSYNC_HOST", "0.0.0.0")
    uvicorn.run(app, host=host, port=port, log_level="info")
