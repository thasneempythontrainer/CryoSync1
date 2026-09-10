"""Idempotent startup seeding for CryoSync.

Ensures the demo role-based accounts shown on the login screen exist so the
app is usable out of the box. Credentials mirror src/pages/Login/LoginPage.tsx.
"""

import secrets
from datetime import datetime

from auth import hash_password

DEMO_USERS = [
    {
        "username": "collection",
        "password": "col123",
        "email": "collection@cryosync.local",
        "display_name": "Collection Staff",
        "title": "Collection Coordinator",
        "role": "collection",
    },
    {
        "username": "processing",
        "password": "proc123",
        "email": "processing@cryosync.local",
        "display_name": "Processing Lab",
        "title": "Lab Technician",
        "role": "processing",
    },
    {
        "username": "cs",
        "password": "cs123",
        "email": "cs@cryosync.local",
        "display_name": "Customer Service",
        "title": "Customer Service Agent",
        "role": "cs",
    },
    {
        "username": "qa",
        "password": "qa123",
        "email": "qa@cryosync.local",
        "display_name": "Quality Assurance",
        "title": "QA Analyst",
        "role": "qa",
    },
    {
        "username": "admin",
        "password": "admin123",
        "email": "admin@cryosync.local",
        "display_name": "Administrator",
        "title": "Operations Supervisor",
        "role": "admin",
    },
]


def now_iso() -> str:
    return datetime.now().isoformat()


async def seed_database(pool) -> None:
    async with pool.acquire() as conn:
        for demo in DEMO_USERS:
            await conn.execute(
                "INSERT INTO users (id, username, email, display_name, title, role, "
                "password_hash, created_at, updated_at) "
                "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8) "
                "ON CONFLICT (username) DO UPDATE SET "
                "email = EXCLUDED.email, display_name = EXCLUDED.display_name, "
                "title = EXCLUDED.title, role = EXCLUDED.role, "
                "password_hash = EXCLUDED.password_hash, updated_at = EXCLUDED.updated_at",
                "user-" + secrets.token_hex(8),
                demo["username"],
                demo["email"],
                demo["display_name"],
                demo["title"],
                demo["role"],
                hash_password(demo["password"]),
                now_iso(),
            )
    print("Seeded demo users")
