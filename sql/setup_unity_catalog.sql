-- ============================================================================
-- CryoSync: Unity Catalog + Genie setup
-- ============================================================================
-- Run once in the Databricks SQL editor or a notebook. Adjust the principal
-- name (service principal / user) to the identity that runs the app.
--
-- Creates:
--   * catalog cryosync_catalog with bronze / silver / gold schemas
--   * descriptive metadata so Genie can answer natural-language questions
--   * views tailored for Genie Spaces
-- ============================================================================

-- 0. Catalog & schemas -------------------------------------------------------
CREATE CATALOG IF NOT EXISTS cryosync_catalog;
CREATE SCHEMA IF NOT EXISTS cryosync_catalog.bronze;
CREATE SCHEMA IF NOT EXISTS cryosync_catalog.silver;
CREATE SCHEMA IF NOT EXISTS cryosync_catalog.gold;

-- 1. Grant access to the application service principal / user ----------------
-- Replace `your-service-principal` with the actual principal name.
GRANT USE CATALOG ON CATALOG cryosync_catalog TO `your-service-principal`;
GRANT USE SCHEMA ON SCHEMA cryosync_catalog.bronze TO `your-service-principal`;
GRANT USE SCHEMA ON SCHEMA cryosync_catalog.silver TO `your-service-principal`;
GRANT USE SCHEMA ON SCHEMA cryosync_catalog.gold TO `your-service-principal`;
GRANT SELECT, CREATE, MODIFY ON SCHEMA cryosync_catalog.bronze TO `your-service-principal`;
GRANT SELECT ON SCHEMA cryosync_catalog.silver TO `your-service-principal`;
GRANT SELECT ON SCHEMA cryosync_catalog.gold TO `your-service-principal`;

-- 2. Table-level descriptions (Genie reads these) -----------------------------
COMMENT ON TABLE cryosync_catalog.gold.unit_summary IS
  'Analytical summary of every cord blood unit with its most recent lab test result. This is the primary table to answer questions about units.';

COMMENT ON TABLE cryosync_catalog.gold.enrollment_funnel IS
  'Counts at each stage of the cord blood journey: enrollment, collection, processing, cryopreservation, transplantation.';

COMMENT ON TABLE cryosync_catalog.gold.kpis IS
  'Key business metrics keyed by metric_name (e.g. cord_blood_units_total, avg_viability_pct, total_families, total_transplants).';

COMMENT ON TABLE cryosync_catalog.silver.families IS
  'Customers / clients merged from operational data and Zoho CRM, keyed on crm_id.';

COMMENT ON TABLE cryosync_catalog.silver.cord_blood_units IS
  'Cord blood units (CBU). Each unit belongs to an enrollment and is the core product with processing and viability metrics.';

COMMENT ON TABLE cryosync_catalog.silver.lab_test_reports IS
  'Laboratory test results per cord blood unit (TNC, CD34, viability, sterility, HLA typing, etc.).';

COMMENT ON TABLE cryosync_catalog.silver.enrollments IS
  'Enrollment / storage contracts. Ties a family to a storage plan and tracks payment status.';

COMMENT ON TABLE cryosync_catalog.silver.transplant_records IS
  'Clinical transplant / release records for cord blood units.';

COMMENT ON TABLE cryosync_catalog.silver.storage_tanks IS
  'Cryogenic storage tanks with capacity, temperature and LN2 levels.';

COMMENT ON TABLE cryosync_catalog.silver.tank_temperature_logs IS
  'IoT temperature sensor readings from storage tanks over time.';

-- 3. Genie-friendly analytical views ------------------------------------------
CREATE OR REPLACE VIEW cryosync_catalog.gold.v_unit_inventory AS
SELECT
    u.unit_number,
    u.storage_status,
    u.storage_tank_id,
    u.collection_volume_ml,
    u.pre_process_tnc,
    u.post_process_tnc,
    u.tnc_recovery_pct,
    u.viability_pct,
    u.volume_ml,
    u.abo_rh,
    t.test_type  AS latest_test_type,
    t.result_value AS latest_result_value,
    t.result_unit  AS latest_result_unit,
    t.performed_at AS latest_test_at
FROM cryosync_catalog.gold.unit_summary u
LEFT JOIN cryosync_catalog.silver.lab_test_reports t ON u.id = t.cord_blood_unit_id;

-- 4. Registration / sync notes -------------------------------------------------
-- The Zoho CRM data lands in cryosync_catalog.bronze (zoho_crm_* tables). The
-- Bronze->Silver/Gold job in build_silver_gold.py stitches CRM contacts to
-- operational families on crm_id. Schedule that notebook daily:
--   Databricks -> Workflows -> Create job -> notebook build_silver_gold
--   -> SQL warehouse / serverless -> schedule "0 2 * * *"
