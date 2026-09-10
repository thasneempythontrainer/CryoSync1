"""Clean up database to free space."""

import asyncio
import argparse
from database import get_connection, close_connection

async def clean_bulk_data(confirm=False):
    """Delete bulk-seeded data (rows with bulk- prefix)."""
    conn = await get_connection()
    try:
        if not confirm:
            print("DRY RUN - Use --confirm to actually delete")
            
        # Count bulk rows first
        tables = ['inventory_lots', 'system_logs', 'shipments', 'compliance_incidents']
        total_to_delete = 0
        
        for table in tables:
            try:
                count = await conn.fetchval(f"SELECT count(*) FROM {table} WHERE id LIKE 'bulk-%'")
                print(f"  {table}: {count:,} bulk rows")
                total_to_delete += count
            except Exception as e:
                print(f"  {table}: Error - {e}")
        
        print(f"\nTotal bulk rows to delete: {total_to_delete:,}")
        
        if not confirm:
            return
            
        # Delete bulk rows
        for table in tables:
            try:
                result = await conn.execute(f"DELETE FROM {table} WHERE id LIKE 'bulk-%'")
                print(f"  {table}: {result}")
            except Exception as e:
                print(f"  {table}: Error - {e}")
                
        print("\nRunning VACUUM to reclaim space...")
        await conn.execute("VACUUM FULL inventory_lots")
        await conn.execute("VACUUM FULL system_logs")
        await conn.execute("VACUUM FULL shipments")
        await conn.execute("VACUUM FULL compliance_incidents")
        print("VACUUM complete")
        
    finally:
        await close_connection(conn)

async def clean_keep_recent(keep_days=30, confirm=False):
    """Keep only recent data in main tables."""
    conn = await get_connection()
    try:
        if not confirm:
            print(f"DRY RUN - Would keep last {keep_days} days. Use --confirm to execute")
            
        # This works for tables with timestamp columns
        tables = [
            ('system_logs', 'timestamp'),
            ('shipments', 'created_at'),
            ('compliance_incidents', 'createdAt'),
        ]
        
        for table, ts_col in tables:
            try:
                # Count what would be deleted
                count = await conn.fetchval(f"""
                    SELECT count(*) FROM {table} 
                    WHERE {ts_col} < now() - interval '{keep_days} days'
                    AND id NOT LIKE 'bulk-%'
                """)
                print(f"  {table}: {count:,} old rows to delete")
            except Exception as e:
                print(f"  {table}: Error - {e}")
                
        if not confirm:
            return
            
        for table, ts_col in tables:
            try:
                result = await conn.execute(f"""
                    DELETE FROM {table} 
                    WHERE {ts_col} < now() - interval '{keep_days} days'
                    AND id NOT LIKE 'bulk-%'
                """)
                print(f"  {table}: {result}")
            except Exception as e:
                print(f"  {table}: Error - {e}")
                
    finally:
        await close_connection(conn)

async def vacuum_all(confirm=False):
    """Run VACUUM FULL on all tables."""
    conn = await get_connection()
    try:
        if not confirm:
            print("DRY RUN - Use --confirm to run VACUUM FULL")
            return
            
        tables = await conn.fetch("""
            SELECT table_name FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        """)
        
        for row in tables:
            table = row['table_name']
            try:
                print(f"VACUUM FULL {table}...")
                await conn.execute(f"VACUUM FULL {table}")
            except Exception as e:
                print(f"  {table}: Error - {e}")
                
    finally:
        await close_connection(conn)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Clean up database")
    parser.add_argument("--bulk", action="store_true", help="Delete bulk-seeded data (bulk- prefix)")
    parser.add_argument("--recent", type=int, help="Keep only last N days of non-bulk data")
    parser.add_argument("--vacuum", action="store_true", help="Run VACUUM FULL on all tables")
    parser.add_argument("--confirm", action="store_true", help="Actually perform the operations")
    args = parser.parse_args()
    
    if not any([args.bulk, args.recent, args.vacuum]):
        parser.print_help()
    else:
        if args.bulk:
            asyncio.run(clean_bulk_data(args.confirm))
        if args.recent:
            asyncio.run(clean_keep_recent(args.recent, args.confirm))
        if args.vacuum:
            asyncio.run(vacuum_all(args.confirm))