import asyncio
from database import get_connection, close_connection
from auth import verify_password

async def check():
    conn = await get_connection()
    try:
        row = await conn.fetchrow("SELECT username, password_hash FROM users WHERE username = $1", 'admin')
        if row:
            print("Username:", row['username'])
            print("Full hash:", row['password_hash'])
            print("Verify admin123:", verify_password('admin123', row['password_hash']))
    finally:
        await close_connection(conn)

asyncio.run(check())