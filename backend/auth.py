"""CryoSync role-based authentication: users, password hashing, and sessions.

Accounts and sessions live in the `users` and `sessions` Delta Lake tables
(see backend/database.py). Passwords are stored as salted PBKDF2-SHA256
hashes so no plaintext is ever persisted.
"""

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta
from typing import Optional

from database import init_db, get_connection, close_connection

PBKDF2_ITERATIONS = 260_000
SESSION_TTL_HOURS = 24 * 7

_PASSWORD_SCHEME = "pbkdf2_sha256"


def now_iso() -> str:
    return datetime.now().isoformat()


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), bytes.fromhex(salt), PBKDF2_ITERATIONS
    ).hex()
    return f"{_PASSWORD_SCHEME}${PBKDF2_ITERATIONS}${salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, iterations, salt, expected = stored.split("$")
    except (TypeError, ValueError):
        return False
    if scheme != _PASSWORD_SCHEME:
        return False
    actual = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), bytes.fromhex(salt), int(iterations)
    ).hex()
    return hmac.compare_digest(actual, expected)


def public_user(user: dict) -> dict:
    """Map a users-table row to the public shape clients expect.

    The frontend consumes camelCase fields (AuthUser: displayName, title,
    role). Handles both raw snake_case rows from Delta Lake and an already-mapped
    dict, because authenticate_user()/get_user_by_token() also run this and the
    route handlers call it again on the result.
    """
    return {
        "id": user.get("id"),
        "username": user.get("username"),
        "email": user.get("email", ""),
        "displayName": user.get("display_name") or user.get("displayName") or "",
        "title": user.get("title", ""),
        "role": user.get("role", "dock"),
    }


async def _get_conn():
    """Get a database connection from the pool."""
    return await get_connection()


async def authenticate_user(username: str, password: str) -> Optional[dict]:
    if not username or not password:
        return None
    conn = await _get_conn()
    try:
        row = await conn.fetchrow("SELECT * FROM users WHERE username = $1", username)
    finally:
        await close_connection(conn)
    if row is None or not verify_password(password, row[6] if row else ""):
        return None
    return {
        "id": row[0],
        "username": row[1],
        "email": row[2] or "",
        "displayName": row[3] or "",
        "title": row[4] or "",
        "role": row[5] or "dock",
    }


async def create_session(user_id: str) -> str:
    token = secrets.token_urlsafe(48)
    created = now_iso()
    expires = (datetime.now() + timedelta(hours=SESSION_TTL_HOURS)).isoformat()
    conn = await _get_conn()
    try:
        await conn.execute(
            "INSERT INTO sessions (token, user_id, created_at, expires_at) "
            "VALUES ($1, $2, $3, $4)",
            token, user_id, created, expires,
        )
    finally:
        await close_connection(conn)
    return token


async def get_user_by_token(token: str) -> Optional[dict]:
    if not token:
        return None
    conn = await _get_conn()
    try:
        row = await conn.fetchrow(
            "SELECT u.* FROM sessions s "
            "JOIN users u ON u.id = s.user_id "
            "WHERE s.token = $1 AND s.expires_at > $2",
            token, now_iso(),
        )
    finally:
        await close_connection(conn)
    if row is None:
        return None
    return {
        "id": row[0],
        "username": row[1],
        "email": row[2] or "",
        "displayName": row[3] or "",
        "title": row[4] or "",
        "role": row[5] or "",
    }


async def delete_session(token: str) -> None:
    if not token:
        return
    conn = await _get_conn()
    try:
        await conn.execute("DELETE FROM sessions WHERE token = $1", token)
    finally:
        await close_connection(conn)