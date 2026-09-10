"""Build CryoSync silver + gold layers entirely in SQL on the serverless SQL warehouse.

Runs pure Spark SQL via the databricks sql-connector (no all-purpose cluster needed),
so it also works on a free-tier workspace. Mirrors what build_silver_gold.py would do
in PySpark, expressed as CREATE OR REPLACE TABLE ... AS SELECT.
"""
import os, asyncio
os.environ.setdefault("CRYOSYNC_DB_BACKEND", "databricks")
os.environ.setdefault("CRYOSYNC_DB_CATALOG", "cryosync_catalog")
os.environ.setdefault("CRYOSYNC_DB_SCHEMA", "bronze")
import database as db

CAT = "cryosync_catalog"

STATEMENTS = {
    # ------------------------------------------------------------------ SILVER
    "silver.families": f"""
        CREATE OR REPLACE TABLE {CAT}.silver.families AS
        SELECT id, crm_id, first_name, last_name, email, phone, address,
               date_of_birth, medical_history, created_at, updated_at, sync_status
        FROM {CAT}.bronze.families""",

    "silver.cord_blood_units": f"""
        CREATE OR REPLACE TABLE {CAT}.silver.cord_blood_units AS
        SELECT id, unit_number, enrollment_id, collection_kit_id,
               collect_accession, collected_at,
               CAST(collection_volume_ml AS DOUBLE)  AS collection_volume_ml,
               CAST(pre_process_tnc AS BIGINT)       AS pre_process_tnc,
               CAST(post_process_tnc AS BIGINT)      AS post_process_tnc,
               CAST(tnc_recovery_pct AS DOUBLE)      AS tnc_recovery_pct,
               CAST(viability_pct AS DOUBLE)         AS viability_pct,
               CAST(volume_ml AS DOUBLE)             AS volume_ml,
               CAST(storage_temperature_c AS DOUBLE) AS storage_temperature_c,
               storage_tank_id, storage_status, cryopreserved_at, abo_rh,
               hla_typing, notes, metadata,
               transplant_count, last_transplant_at
        FROM (
            SELECT *, ROW_NUMBER() OVER (PARTITION BY unit_number ORDER BY created_at) AS __rn
            FROM {CAT}.bronze.cord_blood_units
        ) WHERE __rn = 1""",

    "silver.lab_test_reports": f"""
        CREATE OR REPLACE TABLE {CAT}.silver.lab_test_reports AS
        SELECT id, report_id, unit_number, cord_blood_unit_id, sample_reference,
               test_type, test_name, test_method, instrument, performed_at, performed_by,
               CAST(result_value AS STRING) AS result_value, result_unit, result_text,
               CAST(reference_low AS STRING)  AS reference_low,
               CAST(reference_high AS STRING) AS reference_high,
               reference_text, status, reviewed_by, reviewed_at, review_notes,
               batch_id, source_filename, source_row, details
        FROM (
            SELECT *, ROW_NUMBER() OVER (PARTITION BY report_id ORDER BY performed_at) AS __rn
            FROM {CAT}.bronze.lab_test_reports
        ) WHERE __rn = 1""",

    "silver.enrollments": f"""
        CREATE OR REPLACE TABLE {CAT}.silver.enrollments AS
        SELECT id, enrollment_number, family_id, plan_type, processing_method,
               storage_plan, status, contract_signed_at, payment_plan,
               CAST(total_amount AS DECIMAL(20,2)) AS total_amount,
               CAST(amount_paid AS DECIMAL(20,2))  AS amount_paid,
               expected_due_date, hospital_id, sales_rep_id, referral_code,
               special_programs, metadata, created_at, updated_at, sync_status
        FROM {CAT}.bronze.enrollments""",

    "silver.collection_kits": f"""
        CREATE OR REPLACE TABLE {CAT}.silver.collection_kits AS
        SELECT id, kit_number, enrollment_id, barcode, qr_code, anticoagulant,
               gel_pack_count, shipped_at, delivered_at, received_at_hospital,
               collected_at, collector_name, collector_credentials, hospital_name,
               hospital_address, delivery_courier, tracking_number, temperature_log,
               status, rejection_reason, metadata, created_at, updated_at
        FROM {CAT}.bronze.collection_kits""",

    "silver.storage_tanks": f"""
        CREATE OR REPLACE TABLE {CAT}.silver.storage_tanks AS
        SELECT id, tank_id, facility, tank_type,
               CAST(capacity_units AS BIGINT) AS capacity_units,
               CAST(current_units AS BIGINT)  AS current_units,
               CAST(temperature_c AS DOUBLE)  AS temperature_c,
               CAST(ln2_level_pct AS DOUBLE)  AS ln2_level_pct,
               status, last_inspection_at, next_inspection_at, monitoring_enabled,
               alarm_thresholds, metadata, created_at, updated_at
        FROM {CAT}.bronze.storage_tanks""",

    "silver.tank_temperature_logs": f"""
        CREATE OR REPLACE TABLE {CAT}.silver.tank_temperature_logs AS
        SELECT id, tank_id, recorded_at,
               CAST(temperature_c AS DOUBLE) AS temperature_c,
               CAST(ln2_level_pct AS DOUBLE) AS ln2_level_pct,
               sensor_id, alert_triggered, alert_type, created_at
        FROM {CAT}.bronze.tank_temperature_logs""",

    "silver.transplant_records": f"""
        CREATE OR REPLACE TABLE {CAT}.silver.transplant_records AS
        SELECT id, transplant_number, cord_blood_unit_id, enrollment_id,
               patient_id, transplant_center, transplant_center_id, physician_name,
               diagnosis, indication, requested_at, matched_at,
               CAST(hla_match_score AS DOUBLE) AS hla_match_score,
               hla_match_details, shipped_at, shipping_courier, shipping_tracking,
               shipping_temperature_log, delivered_at, thawed_at, infused_at,
               CAST(infused_volume_ml AS DOUBLE) AS infused_volume_ml,
               CAST(infused_tnc AS BIGINT) AS infused_tnc,
               CAST(infused_cd34 AS BIGINT) AS infused_cd34,
               CAST(post_thaw_viability_pct AS DOUBLE) AS post_thaw_viability_pct,
               CAST(post_thaw_cfu AS DOUBLE) AS post_thaw_cfu,
               engraftment_at, engraftment_type, status, outcome_notes,
               follow_up_schedule, metadata, created_at, updated_at
        FROM {CAT}.bronze.transplant_records""",

    "silver.payment_transactions": f"""
        CREATE OR REPLACE TABLE {CAT}.silver.payment_transactions AS
        SELECT id, txn_number, family_id, plan_type,
               CAST(amount AS DECIMAL(20,2)) AS amount,
               method, status, milestone, paid_at, created_at, updated_at
        FROM {CAT}.bronze.payment_transactions""",

    "silver.shipments": f"""
        CREATE OR REPLACE TABLE {CAT}.silver.shipments AS
        SELECT * FROM {CAT}.bronze.shipments""",

    "silver.suppliers": f"""
        CREATE OR REPLACE TABLE {CAT}.silver.suppliers AS
        SELECT * FROM {CAT}.bronze.suppliers""",

    "silver.products": f"""
        CREATE OR REPLACE TABLE {CAT}.silver.products AS
        SELECT * FROM {CAT}.bronze.products""",

    "silver.facilities": f"""
        CREATE OR REPLACE TABLE {CAT}.silver.facilities AS
        SELECT * FROM {CAT}.bronze.facilities""",

    "silver.storage_zones": f"""
        CREATE OR REPLACE TABLE {CAT}.silver.storage_zones AS
        SELECT * FROM {CAT}.bronze.storage_zones""",

    "silver.compliance_incidents": f"""
        CREATE OR REPLACE TABLE {CAT}.silver.compliance_incidents AS
        SELECT * FROM {CAT}.bronze.compliance_incidents""",

    "silver.inventory_lots": f"""
        CREATE OR REPLACE TABLE {CAT}.silver.inventory_lots AS
        SELECT * FROM {CAT}.bronze.inventory_lots""",

    "silver.branches": f"""
        CREATE OR REPLACE TABLE {CAT}.silver.branches AS
        SELECT * FROM {CAT}.bronze.branches""",

    "silver.referral_sources": f"""
        CREATE OR REPLACE TABLE {CAT}.silver.referral_sources AS
        SELECT * FROM {CAT}.bronze.referral_sources""",

    "silver.content_documents": f"""
        CREATE OR REPLACE TABLE {CAT}.silver.content_documents AS
        SELECT * FROM {CAT}.bronze.content_documents""",

    "silver.users": f"""
        CREATE OR REPLACE TABLE {CAT}.silver.users AS
        SELECT * FROM {CAT}.bronze.users""",

    # ------------------------------------------------------------------ GOLD
    "gold.unit_summary": f"""
        CREATE OR REPLACE TABLE {CAT}.gold.unit_summary AS
        SELECT
            u.id, u.unit_number, u.enrollment_id, u.collection_kit_id,
            u.storage_status, u.storage_tank_id,
            u.collection_volume_ml, u.pre_process_tnc, u.post_process_tnc,
            u.tnc_recovery_pct, u.viability_pct, u.volume_ml,
            u.storage_temperature_c, u.cryopreserved_at, u.abo_rh, u.hla_typing,
            t.test_type     AS latest_test_type,
            t.test_name     AS latest_test_name,
            t.result_value  AS latest_result_value,
            t.result_unit   AS latest_result_unit,
            t.performed_at  AS latest_test_at
        FROM {CAT}.silver.cord_blood_units u
        LEFT JOIN (
            SELECT cord_blood_unit_id, test_type, test_name, result_value,
                   result_unit, performed_at
            FROM (
                SELECT *, ROW_NUMBER() OVER (
                    PARTITION BY cord_blood_unit_id ORDER BY performed_at DESC
                ) AS __rn
                FROM {CAT}.silver.lab_test_reports
            ) WHERE __rn = 1
        ) t ON u.id = t.cord_blood_unit_id""",

    "gold.enrollment_funnel": f"""
        CREATE OR REPLACE TABLE {CAT}.gold.enrollment_funnel AS
        SELECT 'enrollment'    AS stage, COUNT(*) AS count FROM {CAT}.silver.enrollments
        UNION ALL SELECT 'collected',     COUNT(*) FROM {CAT}.silver.collection_kits WHERE status='collected'
        UNION ALL SELECT 'processed',     COUNT(*) FROM {CAT}.silver.cord_blood_units WHERE storage_status IN ('cryopreserved','released_for_transplant','shipped')
        UNION ALL SELECT 'cryopreserved', COUNT(*) FROM {CAT}.silver.cord_blood_units WHERE storage_status='cryopreserved'
        UNION ALL SELECT 'transplanted',  COUNT(*) FROM {CAT}.silver.transplant_records WHERE status IN ('infused','engrafted')""",

    "gold.kpis": f"""
        CREATE OR REPLACE TABLE {CAT}.gold.kpis AS
        SELECT 'cord_blood_units_total'        AS metric_name, COUNT(*) AS value FROM {CAT}.silver.cord_blood_units
        UNION ALL SELECT 'cord_blood_units_cryopreserved', COUNT(*) FROM {CAT}.silver.cord_blood_units WHERE storage_status='cryopreserved'
        UNION ALL SELECT 'avg_viability_pct',  COALESCE(ROUND(AVG(viability_pct),2),0) FROM {CAT}.silver.cord_blood_units WHERE viability_pct IS NOT NULL
        UNION ALL SELECT 'total_families',     COUNT(*) FROM {CAT}.silver.families
        UNION ALL SELECT 'total_transplants',  COUNT(*) FROM {CAT}.silver.transplant_records
        UNION ALL SELECT 'engrafted_transplants', COUNT(*) FROM {CAT}.silver.transplant_records WHERE engraftment_at IS NOT NULL
        UNION ALL SELECT 'lab_reports_total',  COUNT(*) FROM {CAT}.silver.lab_test_reports""",
}


async def main():
    await db.init_db()
    conn = await db.get_connection()
    # ensure schemas exist
    for s in ("silver", "gold"):
        await conn.execute(f"CREATE SCHEMA IF NOT EXISTS {CAT}.`{s}`")
    for name, sql in STATEMENTS.items():
        try:
            await conn.execute(sql)
            print(f"OK   {name}")
        except Exception as e:
            print(f"FAIL {name}: {type(e).__name__}: {str(e)[:300]}")
    await db.close_pool()


if __name__ == "__main__":
    asyncio.run(main())
