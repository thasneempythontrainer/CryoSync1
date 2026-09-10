"""Check table sizes in the database."""

import asyncio
from database import get_connection, close_connection

async def check_sizes():
    conn = await get_connection()
    try:
        # Get all table sizes
        rows = await conn.fetch("""
            SELECT 
                table_name,
                pg_size_pretty(pg_total_relation_size(quote_ident(table_name))) as total_size,
                pg_size_pretty(pg_relation_size(quote_ident(table_name))) as table_size,
                pg_size_pretty(pg_total_relation_size(quote_ident(table_name)) - pg_relation_size(quote_ident(table_name))) as index_size,
                (SELECT count(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
            FROM information_schema.tables t
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
            ORDER BY pg_total_relation_size(quote_ident(table_name)) DESC
        """)
        
        print(f"{'Table':<30} {'Total Size':<15} {'Table Size':<15} {'Index Size':<15} {'Columns'}")
        print("-" * 95)
        total_bytes = 0
        for row in rows:
            size_bytes = await conn.fetchval(f"SELECT pg_total_relation_size('{row['table_name']}')")
            total_bytes += size_bytes or 0
            print(f"{row['table_name']:<30} {row['total_size']:<15} {row['table_size']:<15} {row['index_size']:<15} {row['column_count']}")
        
        print("-" * 95)
        print(f"Total database size: {await conn.fetchval('SELECT pg_size_pretty(pg_database_size(current_database()))')}")
        
        # Also check row counts for the main tables
        print("\nRow counts for main tables:")
        for table in ['inventory_lots', 'system_logs', 'shipments', 'compliance_incidents', 'suppliers', 'products', 'facilities', 'storage_zones']:
            try:
                count = await conn.fetchval(f"SELECT count(*) FROM {table}")
                print(f"  {table}: {count:,}")
            except Exception as e:
                print(f"  {table}: Error - {e}")
                
    finally:
        await close_connection(conn)

if __name__ == "__main__":
    asyncio.run(check_sizes())