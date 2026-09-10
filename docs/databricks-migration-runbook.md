# CryoSync -> Databricks Implementation Runbook

End-to-end guide to move the CryoSync (StemCyte) data onto Databricks, stitch it
with the Zoho CRM data already in your catalog, and enable **Databricks Genie**
for natural-language querying.

---

## Architecture summary

```
                              Unity Catalog: cryosync_catalog
┌─────────────────────┐      ┌────────────────────────────────────────────┐
│ CryoSync (SQLite)   │      │ bronze   silver   gold                     │
│ backend/cryosync.db │─┐    │         ▲        ▲                         │
└─────────────────────┘ │    │         │        │                         │
migrate_to_databricks.py│    │  families (CRM stitched on crm_id)         │
(Bronze)                │    │  cord_blood_units   unit_summary  ◄── Genie│
sync_to_databricks.py   │    │  lab_test_reports   enrollment_funnel      │
(incremental)           │    │  ...                kpis                   │
                        │    └────────────────────────────────────────────┘
┌─────────────────────┐ │
│ Zoho CRM (already   │─┘   build_silver_gold.py (scheduled Databricks job)
│  in your catalog)   │     bronze -> silver -> gold
└─────────────────────┘
```

**Layers:**
- **Bronze** – raw copy of SQLite tables + Zoho CRM tables (your connector).
- **Silver** – cleaned, deduplicated, CRM joined on `crm_id`.
- **Gold** – business-ready tables (`unit_summary`, `enrollment_funnel`, `kpis`)
  that dashboards and Genie query directly.

---

## Phase 0 — Prerequisites

1. **Install the Databricks SQL connector** (local machine):
   ```bash
   pip install databricks-sql-connector
   ```
   (already added to `backend/requirements.txt`)

2. **Set credentials** in `backend/.env` (gitignored — do NOT commit):
   ```
   DATABRICKS_HOST=dbc-2a25661e-3f93.cloud.databricks.com
   DATABRICKS_HTTP_PATH=/sql/1.0/endpoints/primary
   DATABRICKS_TOKEN=<personal access token or service-principal secret>
   DATABRICKS_CATALOG=cryosync_catalog
   DATABRICKS_BRONZE_SCHEMA=bronze
   ```
   > The `DATABRICKS_TOKEN` currently in `backend/.env` is reported invalid and
   > is committed to the repo — rotate it and move it to a secret store.

3. **Create the catalog & schemas** in Databricks (run
   `SQL/setup_unity_catalog.sql` in the SQL editor / notebook). Update the
   grant principal from `your-service-principal` to your real one.

---

## Phase 1 — Full load SQLite -> Bronze

Run the one-time migration:

```bash
python backend/migrate_to_databricks.py --dry-run    # review the plan
python backend/migrate_to_databricks.py              # execute
python backend/migrate_to_databricks.py --table lab_test_reports
python backend/migrate_to_databricks.py --catalog cryosync_catalog --schema bronze
```

What it does per table:
- Creates a Delta table in `cryosync_catalog.bronze.<table>`.
- Inserts every row, casting SQLite types to Delta types.
- Stores JSON blobs (`data`, `details`, etc.) as JSON strings.
- Adds Unity Catalog column comments so Genie can map business terms.

---

## Phase 2 — Confirm / prepare Zoho CRM data

Your custom connector already lands Zoho data in the catalog (e.g.
`cryosync_catalog.bronze.zoho_crm_contacts`). Verify the tables exist and note
their exact names:

```sql
SHOW TABLES IN cryosync_catalog.bronze;
DESCRIBE cryosync_catalog.bronze.zoho_crm_contacts;
```

`build_silver_gold.py` auto-detects common names (`zoho_crm_contacts`,
`contacts`, `zoho_contacts`) and stitches contacts onto operational `families`
by `crm_id`. If your table uses another name, edit the list in
`build_silver_gold.py` (and the matching notebook).

---

## Phase 3 — Bronze -> Silver -> Gold transform

Do this once after the Bronze load, then schedule it to run nightly (a
CryoSync `/Shared` notebook is referenced by `databricks.yml`).

Two equivalent ways to run it:

### Option A — Databricks Job (recommended, scales & schedules)
1. Import `backend/build_silver_gold.py` as a notebook into your workspace at
   `/Shared/cryosync/prod/notebooks/build_silver_gold`.
2. Deploy the bundle (creates a nightly 02:00 UTC job):
   ```bash
   databricks bundle validate --target prod
   databricks bundle deploy --target prod
   ```
3. In the UI, open the `CryoSync analytics transform` job, UNPAUSE it, review
   the cluster, and run it once.

### Option B — Local PySpark (for testing only)
```bash
pip install pyspark
python backend/build_silver_gold.py
```

Outputs:
- `silver.families` (CRM + operational, merged)
- `silver.cord_blood_units`, `silver.lab_test_reports`, `silver.enrollments`, ...
- `gold.unit_summary`, `gold.enrollment_funnel`, `gold.kpis`

---

## Phase 4 — Ongoing incremental sync

After the full load, keep Bronze current as the SQLite store keeps receiving
uploads (lab reports, shipments, etc.):

```bash
python backend/sync_to_databricks.py --dry-run   # see what would sync
python backend/sync_to_databricks.py             # upsert since last watermark
python backend/sync_to_databricks.py --full      # reset watermark / re-merge
```

Watermarks are tracked in `cryosync_catalog.bronze.sync_watermark`. Schedule
this (cron / Task Scheduler / a Databricks job) alongside your Zoho sync so
Bronze reflects both sources.

---

## Phase 5 — Enable Databricks Genie

1. In Databricks, go to **AI/BI -> Genie -> Create a space**.
2. Point the space at the **Gold** tables (or the curated views created in
   `SQL/setup_unity_catalog.sql`):
   - `cryosync_catalog.gold.unit_summary`
   - `cryosync_catalog.gold.enrollment_funnel`
   - `cryosync_catalog.gold.kpis`
   - Optionally `silver.lab_test_reports`, `silver.cord_blood_units`.
3. Add **instructions** in the space, e.g.:
   > "This is cord blood banking data for StemCyte. A 'unit' or 'CBU' maps to
   > cord_blood_units. 'Viability' maps to viability_pct. 'Family' maps to
   > families. Report counts and aggregations over the gold tables."
4. Add **sample questions** so users learn what to ask:
   - "How many CBUs are currently cryopreserved?"
   - "Show average viability by processing method."
   - "List families with an active enrollment."
   - "How many transplants have engrafted this year?"
   - "What were the most recent lab results for royalty-free unit CBU-2024-001234?"
5. Run the query, review the generated SQL for correctness, and mark good
   answers as examples (this trains the space).

> Genie only reasons over data inside the Lakehouse/Unity Catalog. It works
> correctly because everything is registered in `cryosync_catalog` with column
> comments (added in Phase 1) and curated Gold tables (added in Phase 3).

---

## Phase 6 — (Optional) Re-point the app backend at Databricks

If you want the CryoSync app itself to query Databricks instead of SQLite:

- The backend's SQLite layer (`backend/database.py`) is a compatibility shim
  over the original Databricks Lakebase (Postgres) adapter.
- Point the app at the Gold/Delta tables via PySpark / the SQL warehouse, or use
  the Lakebase SQL endpoint with `backend/stemcyte_schema.sql` as the source of
  truth to rebuild the app's queries against Databricks tables.

---

## Files added

| File | Purpose |
|---|---|
| `backend/migrate_to_databricks.py` | Full SQLite -> Bronze load |
| `backend/sync_to_databricks.py` | Incremental upsert since last watermark |
| `backend/build_silver_gold.py` | Bronze -> Silver -> Gold (PySpark, for a Databricks job) |
| `backend/notebooks/build_silver_gold.py.txt` | Importable notebook copy of the transform |
| `SQL/setup_unity_catalog.sql` | Catalog/schema/grants/Genie views + descriptions |
| `databricks.yml` | Bundle defining the scheduled Silver/Gold job |

## Security notes

- The `backend/.env` file contains live tokens that are committed to the repo.
  Rotate them and move them to GitHub Secrets / a Databricks secret scope.
- Never commit `DATABRICKS_TOKEN`, Zoho OAuth tokens, or DB passwords.
