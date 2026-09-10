import re

content = open('C:\Users\thasn\Desktop\proreact\lab-intelligence-platform\backend\main.py').read()

# Replace the lifespan function
old_pattern = r'''@asynccontextmanager\s+async def lifespan\(app: FastAPI\):\s+print\("Initializing database\.\.\."\)\s+await init_db\(\)
    pool = await get_pool\(\)
    await seed_database\(pool\)
    scanner_task = asyncio\.create_task\(background_temp_incident_scanner\(\)\)\s+print\("Server ready!"\)\s+yield\s+scanner_task\.cancel\(\)
    await close_pool\(\)\s+print\("Server shut down\.\)"'''

# Simpler approach - just replace the specific lines
content = content.replace(
    'pool = await get_pool()\n    await seed_database(pool)',
    '# seed_database skipped for SQL connector'
)

content = content.replace(
    'scanner_task.cancel()\n    await close_pool()\n    print("Server shut down.")',
    'scanner_task.cancel()'
)

open('C:\Users\thasn\Desktop\proreact\lab-intelligence-platform\backend\main.py', 'w').write(content)
print('main.py fixed')