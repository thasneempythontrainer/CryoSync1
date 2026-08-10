"""Shared Databricks workspace authentication for the CryoSync backend.

Single source of truth for resolving the workspace host and getting a valid
bearer token (static PAT or automatically refreshed machine-to-machine OAuth)
so the model-serving agent and the database credential rotation never have to
handle token expiry by hand.
"""

import asyncio
import base64
import os
import time
from typing import Any, Dict

import httpx

from dotenv import load_dotenv

load_dotenv()

_token_cache: Dict[str, Dict[str, Any]] = {}
_token_lock = asyncio.Lock()


def strip_host(host: str) -> str:
    """Normalize a Databricks workspace host (drops scheme and trailing slash)."""
    h = (host or "").strip()
    for scheme in ("https://", "http://"):
        if h.startswith(scheme):
            h = h[len(scheme):]
    return h.rstrip("/")


def workspace_host() -> str:
    host = os.getenv("DATABRICKS_HOST") or os.getenv("DATABRICKS_WORKSPACE_HOST")
    if not host:
        raise RuntimeError(
            "DATABRICKS_HOST is not set. Add it to backend/.env (see .env.example)."
        )
    return strip_host(host)


async def _fetch_m2m_token(client_id: str, client_secret: str, host: str) -> tuple[str, int]:
    """Request a fresh OAuth access token via the OAuth client-credentials flow.

    https://docs.databricks.com/authentication/oauth2.html#machine-to-machine
    """
    url = f"https://{host}/oidc/v1/token"
    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
        "Authorization": "Basic "
        + base64.b64encode(f"{client_id}:{client_secret}".encode("utf-8")).decode("ascii"),
    }
    data = {"grant_type": "client_credentials", "scope": "all-apis"}
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(url, headers=headers, data=data)
    if resp.status_code != 200:
        raise RuntimeError(
            f"Databricks OAuth token request failed (HTTP {resp.status_code}): "
            f"{resp.text[:300]}"
        )
    payload = resp.json()
    access_token = payload.get("access_token")
    if not access_token:
        raise RuntimeError("Databricks OAuth token response did not include an access_token")
    return access_token, int(payload.get("expires_in", 3600))


async def get_bearer_token() -> str:
    """Return a valid bearer token for Databricks REST and Model Serving APIs.

    Prefers DATABRICKS_TOKEN when set. Otherwise performs the OAuth
    client-credentials flow and caches the token until ~5 minutes before it
    expires, refreshing automatically afterwards.
    """
    static_token = os.getenv("DATABRICKS_TOKEN")
    if static_token:
        return static_token.strip()

    client_id = os.getenv("DATABRICKS_CLIENT_ID")
    client_secret = os.getenv("DATABRICKS_CLIENT_SECRET")
    if not (client_id and client_secret):
        raise RuntimeError(
            "No Databricks credentials configured. Set DATABRICKS_TOKEN, or set "
            "DATABRICKS_CLIENT_ID + DATABRICKS_CLIENT_SECRET + DATABRICKS_HOST for "
            "automatic OAuth token refresh in backend/.env (see .env.example)."
        )

    host = workspace_host()
    async with _token_lock:
        cached = _token_cache.get(host)
        if cached and cached["expires_at"] > time.time() + 300:
            return cached["access_token"]

        access_token, expires_in = await _fetch_m2m_token(client_id, client_secret, host)
        _token_cache[host] = {
            "access_token": access_token,
            "expires_at": time.time() + expires_in,
        }
        return access_token
