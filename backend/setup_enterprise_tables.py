"""Create the enterprise (CBU-lifecycle + operational) tables in the Databricks
bronze schema that the app's ``seed_enterprise`` module expects but which were
not created by the initial migration (the core 14 tables already exist).

Idempotent: uses CREATE TABLE IF NOT EXISTS. Safe to run repeatedly.
"""

import os

from dotenv import load_dotenv
from databricks import sql as dbsql

load_dotenv()

HOST = os.getenv("DATABRICKS_HOST", "").replace("https://", "").rstrip("/")
HTTP_PATH = os.getenv("DATABRICKS_HTTP_PATH", "")
TOKEN = os.getenv("DATABRICKS_TOKEN", "")
CATALOG = os.getenv("CRYOSYNC_DB_CATALOG", "cryosync_catalog")
SCHEMA = os.getenv("CRYOSYNC_DB_SCHEMA", "bronze")

# Column name/type maps reproduced from backend/database.py SCHEMA.
TABLES = {
    "families": """
        CREATE TABLE IF NOT EXISTS `{cat}`.`{sch}`.`families` (
            id STRING, crm_id STRING, first_name STRING, last_name STRING,
            email STRING, phone STRING, address STRING, date_of_birth STRING,
            medical_history STRING, created_at STRING, updated_at STRING,
            synced_at STRING, sync_status STRING
        ) USING DELTA
    """,
    "enrollments": """
        CREATE TABLE IF NOT EXISTS `{cat}`.`{sch}`.`enrollments` (
            id STRING, enrollment_number STRING, family_id STRING, plan_type STRING,
            processing_method STRING, storage_plan STRING, status STRING,
            contract_signed_at STRING, payment_plan STRING, total_amount DOUBLE,
            amount_paid DOUBLE, expected_due_date STRING, hospital_id STRING,
            sales_rep_id STRING, referral_code STRING, special_programs STRING,
            metadata STRING, created_at STRING, updated_at STRING, synced_at STRING,
            sync_status STRING
        ) USING DELTA
    """,
    "collection_kits": """
        CREATE TABLE IF NOT EXISTS `{cat}`.`{sch}`.`collection_kits` (
            id STRING, kit_number STRING, enrollment_id STRING, barcode STRING,
            qr_code STRING, anticoagulant STRING, gel_pack_count BIGINT,
            shipped_at STRING, delivered_at STRING, received_at_hospital STRING,
            collected_at STRING, collector_name STRING, collector_credentials STRING,
            hospital_name STRING, hospital_address STRING, delivery_courier STRING,
            tracking_number STRING, temperature_log STRING, status STRING,
            rejection_reason STRING, metadata STRING, created_at STRING,
            updated_at STRING
        ) USING DELTA
    """,
    "cord_blood_units": """
        CREATE TABLE IF NOT EXISTS `{cat}`.`{sch}`.`cord_blood_units` (
            id STRING, unit_number STRING, enrollment_id STRING, collection_kit_id STRING,
            collect_accession STRING, collected_at STRING, collection_volume_ml DOUBLE,
            collection_weight_g DOUBLE, maternal_blood_collected BIGINT,
            delayed_clamping BIGINT, delayed_clamping_duration_min BIGINT,
            processing_method STRING, processing_started_at STRING,
            processing_completed_at STRING, processed_by STRING, equipment_used STRING,
            processing_technician_id STRING, pre_process_tnc BIGINT, post_process_tnc BIGINT,
            tnc_recovery_pct DOUBLE, pre_process_cd34 BIGINT, post_process_cd34 BIGINT,
            cd34_recovery_pct DOUBLE, viability_pct DOUBLE, volume_ml DOUBLE,
            rbc_depletion_pct DOUBLE, plasma_depletion_pct DOUBLE, storage_bag_type STRING,
            storage_bag_barcode STRING, storage_location STRING, cryopreserved_at STRING,
            storage_status STRING, storage_tank_id STRING, storage_temperature_c DOUBLE,
            hla_typing STRING, abo_rh STRING, infectious_disease_results STRING,
            sterility_result STRING, cfu_result DOUBLE, fact_compliant BIGINT,
            aabb_compliant BIGINT, fda_licensed BIGINT, cgmp_compliant BIGINT,
            transplant_count BIGINT, last_transplant_at STRING, public_bank_access BIGINT,
            public_bank_listed_at STRING, nmdp_id STRING, notes STRING, metadata STRING,
            created_at STRING, updated_at STRING
        ) USING DELTA
    """,
    "transplant_records": """
        CREATE TABLE IF NOT EXISTS `{cat}`.`{sch}`.`transplant_records` (
            id STRING, transplant_number STRING, cord_blood_unit_id STRING,
            enrollment_id STRING, patient_id STRING, transplant_center STRING,
            transplant_center_id STRING, physician_name STRING, diagnosis STRING,
            indication STRING, requested_at STRING, matched_at STRING,
            hla_match_score DOUBLE, hla_match_details STRING, shipped_at STRING,
            shipping_courier STRING, shipping_tracking STRING,
            shipping_temperature_log STRING, delivered_at STRING, thawed_at STRING,
            infused_at STRING, infused_volume_ml DOUBLE, infused_tnc BIGINT,
            infused_cd34 BIGINT, post_thaw_viability_pct DOUBLE, post_thaw_cfu BIGINT,
            engraftment_at STRING, engraftment_type STRING, status STRING,
            outcome_notes STRING, follow_up_schedule STRING, metadata STRING,
            created_at STRING, updated_at STRING
        ) USING DELTA
    """,
    "storage_tanks": """
        CREATE TABLE IF NOT EXISTS `{cat}`.`{sch}`.`storage_tanks` (
            id STRING, tank_id STRING, facility STRING, tank_type STRING,
            capacity_units BIGINT, current_units BIGINT, temperature_c DOUBLE,
            ln2_level_pct DOUBLE, status STRING, last_inspection_at STRING,
            next_inspection_at STRING, monitoring_enabled BIGINT,
            alarm_thresholds STRING, metadata STRING, created_at STRING,
            updated_at STRING
        ) USING DELTA
    """,
    "tank_temperature_logs": """
        CREATE TABLE IF NOT EXISTS `{cat}`.`{sch}`.`tank_temperature_logs` (
            id STRING, tank_id STRING, recorded_at STRING, temperature_c DOUBLE,
            ln2_level_pct DOUBLE, sensor_id STRING, alert_triggered BIGINT,
            alert_type STRING, created_at STRING
        ) USING DELTA
    """,
    "payment_transactions": """
        CREATE TABLE IF NOT EXISTS `{cat}`.`{sch}`.`payment_transactions` (
            id STRING, txn_number STRING, family_id STRING, plan_type STRING,
            amount DOUBLE, method STRING, status STRING, milestone STRING,
            paid_at STRING, created_at STRING, updated_at STRING
        ) USING DELTA
    """,
    "referral_sources": """
        CREATE TABLE IF NOT EXISTS `{cat}`.`{sch}`.`referral_sources` (
            id STRING, source_name STRING, source_type STRING, region STRING,
            contact STRING, referrals BIGINT, conversions BIGINT, revenue DOUBLE,
            status STRING, created_at STRING, updated_at STRING
        ) USING DELTA
    """,
    "branches": """
        CREATE TABLE IF NOT EXISTS `{cat}`.`{sch}`.`branches` (
            id STRING, branch_number STRING, name STRING, manager STRING,
            region STRING, status STRING, collections BIGINT, quality_score DOUBLE,
            accreditation STRING, last_audit STRING, next_audit STRING,
            staff BIGINT, readiness BIGINT, created_at STRING, updated_at STRING
        ) USING DELTA
    """,
    "content_documents": """
        CREATE TABLE IF NOT EXISTS `{cat}`.`{sch}`.`content_documents` (
            id STRING, doc_number STRING, title STRING, content_type STRING,
            status STRING, author STRING, version STRING, updated_at STRING,
            views BIGINT, downloads BIGINT, shares BIGINT, language STRING,
            created_at STRING
        ) USING DELTA
    """,
}


def main():
    if not all([HOST, HTTP_PATH, TOKEN]):
        raise SystemExit("Missing DATABRICKS_HOST / HTTP_PATH / TOKEN in backend/.env")
    conn = dbsql.connect(
        server_hostname=HOST,
        http_path=HTTP_PATH,
        access_token=TOKEN,
        catalog=CATALOG,
        schema=SCHEMA,
    )
    try:
        with conn.cursor() as cur:
            cur.execute(f"CREATE DATABASE IF NOT EXISTS `{CATALOG}`.`{SCHEMA}`")
        conn.commit()
        for name, ddl in TABLES.items():
            with conn.cursor() as cur:
                cur.execute(ddl.format(cat=CATALOG, sch=SCHEMA))
            conn.commit()
            print(f"ok  {name}")
        print("All enterprise tables ensured in", f"{CATALOG}.{SCHEMA}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
