import os, asyncio, time
os.environ.setdefault("CRYOSYNC_DB_BACKEND","databricks")
os.environ.setdefault("CRYOSYNC_DB_CATALOG","cryosync_catalog")
os.environ.setdefault("CRYOSYNC_DB_SCHEMA","bronze")
from fastapi.testclient import TestClient
import main

t0=time.time()
with TestClient(main.app) as client:
    print("boot", round(time.time()-t0,1),"s")
    tok = client.post("/api/auth/login", json={"username":"admin","password":"admin123"}).json()["token"]
    H={"Authorization": f"Bearer {tok}"}
    r = client.post("/api/admin/sync-zoho", json={"modules":["Facilities"]}, headers=H)
    print("status:", r.status_code)
    j=r.json()
    print("summary keys:", list(j.keys()))
    print("modules:", j.get("modules"), "records:", j.get("records"), "failed:", j.get("failed"))
print("TOTAL", round(time.time()-t0,1),"s")
