import asyncio
from database import get_connection, close_connection
from auth import verify_password

async def test():
    conn = await get_connection()
    try:
        # Check what the authenticate_user query returns
        row = await conn.fetchrow("SELECT * FROM users WHERE username = $1", 'admin')
        if row:
            print("Row:", dict(row))
            print("Index 0 (id):", row[0])
            print("Index 1 (username):", row[1])
            print("Index 2 (email):", row[2])
            print("Index 3 (password_hash):", row[3])
            print("Index 4 (display_name):", row[4])
            print("Index 5 (title):", row[5])
            print("Index 6 (role):", row[6])
            
            # Now test verify_password with the actual hash from the row
            print("Verify:", verify_password('admin123', row[3]))
        else:
            print("No user found")
    finally:
        await close_connection(conn)

asyncio.run(test())