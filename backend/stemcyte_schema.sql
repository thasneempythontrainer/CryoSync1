-- Stemcyte Cord Blood Banking Database Schema
-- Run this against your Databricks Lakebase (Postgres) database

-- ============================================================
-- ENUM TYPES
-- ============================================================
CREATE TYPE enrollment_status AS ENUM (
    'pending', 'active', 'cancelled', 'expired', 'on_hold'
);

CREATE TYPE collection_status AS ENUM (
    'kit_shipped', 'kit_received_at_hospital', 'collected', 'in_transit', 
    'received_at_lab', 'processing', 'completed', 'rejected', 'insufficient_volume'
);

CREATE TYPE processing_method AS ENUM (
    'standard_cell', 'maxcell', 'prepacyte_cb', 'autoxpress', 'sepax', 'manual'
);

CREATE TYPE processing_status AS ENUM (
    'pending', 'in_progress', 'completed', 'failed', 'quarantined'
);

CREATE TYPE storage_status AS ENUM (
    'cryopreserved', 'quarantined', 'released_for_transplant', 'shipped', 
    'thawed', 'expired', 'discarded', 'transferred_out'
);

CREATE TYPE transplant_status AS ENUM (
    'requested', 'matched', 'shipped', 'delivered', 'infused', 
    'engrafted', 'failed', 'cancelled'
);

CREATE TYPE test_type AS ENUM (
    'tnc', 'cd34', 'viability', 'sterility', 'hla_typing', 'infectious_disease',
    'cfu', 'maternal_blood', 'hemoglobinopathy', 'chromosomal_analysis'
);

CREATE TYPE test_result_status AS ENUM (
    'pending', 'passed', 'failed', 'conditional', 'under_review'
);

CREATE TYPE crm_sync_status AS ENUM (
    'pending', 'synced', 'failed', 'conflict'
);

-- ============================================================
-- CORE TABLES
-- ============================================================

-- Families/Clients (from CRM/ERP)
CREATE TABLE families (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    crm_id VARCHAR(100) UNIQUE,  -- External CRM/ERP ID
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    address JSONB,
    date_of_birth DATE,
    medical_history JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    synced_at TIMESTAMPTZ,
    sync_status crm_sync_status DEFAULT 'pending'
);

-- Enrollments (Contract/Plan)
CREATE TABLE enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_number VARCHAR(30) UNIQUE NOT NULL,  -- e.g., ENR-2024-001234
    family_id UUID REFERENCES families(id) ON DELETE CASCADE,
    plan_type VARCHAR(50) NOT NULL,  -- 'cord_blood', 'cord_tissue', 'cord_blood_tissue', 'lifetime'
    processing_method processing_method DEFAULT 'standard_cell',
    storage_plan VARCHAR(50) DEFAULT 'annual',  -- 'annual', '18_year', 'lifetime'
    status enrollment_status DEFAULT 'pending',
    contract_signed_at TIMESTAMPTZ,
    payment_plan VARCHAR(20),  -- 'full', '6_month', '12_month'
    total_amount DECIMAL(10,2),
    amount_paid DECIMAL(10,2) DEFAULT 0,
    expected_due_date DATE,
    hospital_id UUID,  -- Reference to hospital/collection site
    sales_rep_id VARCHAR(100),  -- CRM user ID
    referral_code VARCHAR(50),
    special_programs JSONB,  -- Sibling donor, medical professional, etc.
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    synced_at TIMESTAMPTZ,
    sync_status crm_sync_status DEFAULT 'pending'
);

-- Collection Kits
CREATE TABLE collection_kits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kit_number VARCHAR(30) UNIQUE NOT NULL,  -- e.g., KIT-2024-001234
    enrollment_id UUID REFERENCES enrollments(id) ON DELETE CASCADE,
    barcode VARCHAR(100) UNIQUE,
    qr_code VARCHAR(500),
    anticoagulant VARCHAR(20) DEFAULT 'CPD',
    gel_pack_count INTEGER DEFAULT 2,
    shipped_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    received_at_hospital TIMESTAMPTZ,
    collected_at TIMESTAMPTZ,
    collector_name VARCHAR(100),
    collector_credentials VARCHAR(200),
    hospital_name VARCHAR(200),
    hospital_address JSONB,
    delivery_courier VARCHAR(100),
    tracking_number VARCHAR(100),
    temperature_log JSONB,  -- Array of {timestamp, temp_celsius, location}
    status collection_status DEFAULT 'kit_shipped',
    rejection_reason TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Cord Blood Units (The core product)
CREATE TABLE cord_blood_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_number VARCHAR(30) UNIQUE NOT NULL,  -- e.g., CBU-2024-001234
    enrollment_id UUID REFERENCES enrollments(id) ON DELETE CASCADE,
    collection_kit_id UUID REFERENCES collection_kits(id),
    -- Collection data
    collected_at TIMESTAMPTZ,
    collection_volume_ml DECIMAL(8,2),
    collection_weight_g DECIMAL(8,2),
    maternal_blood_collected BOOLEAN DEFAULT false,
    delayed_clamping BOOLEAN DEFAULT false,
    delayed_clamping_duration_min INTEGER,
    -- Processing
    processing_method processing_method,
    processing_started_at TIMESTAMPTZ,
    processing_completed_at TIMESTAMPTZ,
    processed_by VARCHAR(100),
    equipment_used VARCHAR(100),  -- Sepax, AXP, manual
    processing_technician_id VARCHAR(100),
    -- Processing results
    pre_process_tnc BIGINT,  -- Total Nucleated Cells pre-processing
    post_process_tnc BIGINT,
    tnc_recovery_pct DECIMAL(5,2),
    pre_process_cd34 BIGINT,
    post_process_cd34 BIGINT,
    cd34_recovery_pct DECIMAL(5,2),
    viability_pct DECIMAL(5,2),
    volume_ml DECIMAL(8,2),  -- Final volume after processing
    rbc_depletion_pct DECIMAL(5,2),
    plasma_depletion_pct DECIMAL(5,2),
    -- Storage
    storage_bag_type VARCHAR(50) DEFAULT 'five_chamber',  -- five_chamber, single_chamber
    storage_bag_barcode VARCHAR(100),
    storage_location JSONB,  -- {tank: 'TNK-001', rack: 'R-05', position: 'P-12', level: 'vapor'}
    cryopreserved_at TIMESTAMPTZ,
    storage_status storage_status DEFAULT 'cryopreserved',
    storage_tank_id VARCHAR(50),
    storage_temperature_c DECIMAL(5,2) DEFAULT -196.0,
    -- Testing
    hla_typing JSONB,  -- {A: ['02:01', '24:02'], B: [...], DRB1: [...]}
    abo_rh VARCHAR(10),
    infectious_disease_results JSONB,  -- HIV, Hep B/C, HTLV, Syphilis, CMV, etc.
    sterility_result test_result_status,
    cfu_result INTEGER,  -- Colony Forming Units
    -- Quality & Compliance
    fact_compliant BOOLEAN DEFAULT true,
    aabb_compliant BOOLEAN DEFAULT true,
    fda_licensed BOOLEAN DEFAULT true,
    cgmp_compliant BOOLEAN DEFAULT true,
    -- Transplant tracking
    transplant_count INTEGER DEFAULT 0,
    last_transplant_at TIMESTAMPTZ,
    -- Public bank access
    public_bank_access BOOLEAN DEFAULT false,
    public_bank_listed_at TIMESTAMPTZ,
    nmdp_id VARCHAR(50),
    -- Metadata
    notes TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Lab Test Reports (from CSV imports)
CREATE TABLE lab_test_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id VARCHAR(50) UNIQUE NOT NULL,  -- Lab's internal report ID
    cord_blood_unit_id UUID REFERENCES cord_blood_units(id) ON DELETE CASCADE,
    test_type test_type NOT NULL,
    test_name VARCHAR(100) NOT NULL,
    test_method VARCHAR(100),
    instrument VARCHAR(100),
    performed_at TIMESTAMPTZ NOT NULL,
    performed_by VARCHAR(100),
    result_value DECIMAL(15,4),
    result_unit VARCHAR(30),
    result_text TEXT,
    reference_range_low DECIMAL(15,4),
    reference_range_high DECIMAL(15,4),
    reference_range_text VARCHAR(100),
    status test_result_status DEFAULT 'pending',
    reviewed_by VARCHAR(100),
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    csv_source_filename VARCHAR(255),
    csv_row_number INTEGER,
    raw_csv_data JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Transplant/Release Records
CREATE TABLE transplant_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transplant_number VARCHAR(30) UNIQUE NOT NULL,  -- e.g., TXP-2024-001234
    cord_blood_unit_id UUID REFERENCES cord_blood_units(id) ON DELETE CASCADE,
    enrollment_id UUID REFERENCES enrollments(id),
    patient_id VARCHAR(100),  -- External patient ID from transplant center
    transplant_center VARCHAR(200),
    transplant_center_id VARCHAR(100),
    physician_name VARCHAR(200),
    diagnosis VARCHAR(200),
    indication VARCHAR(200),
    requested_at TIMESTAMPTZ,
    matched_at TIMESTAMPTZ,
    hla_match_score DECIMAL(5,2),  -- 0-100%
    hla_match_details JSONB,  -- Locus-level match details
    shipped_at TIMESTAMPTZ,
    shipping_courier VARCHAR(100),
    shipping_tracking VARCHAR(100),
    shipping_temperature_log JSONB,
    delivered_at TIMESTAMPTZ,
    thawed_at TIMESTAMPTZ,
    infused_at TIMESTAMPTZ,
    infused_volume_ml DECIMAL(8,2),
    infused_tnc BIGINT,
    infused_cd34 BIGINT,
    post_thaw_viability_pct DECIMAL(5,2),
    post_thaw_cfu INTEGER,
    engraftment_at TIMESTAMPTZ,
    engraftment_type VARCHAR(50),  -- 'neutrophil', 'platelet', 'full'
    status transplant_status DEFAULT 'requested',
    outcome_notes TEXT,
    follow_up_schedule JSONB,  -- Scheduled follow-ups
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Storage Tanks & Monitoring
CREATE TABLE storage_tanks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tank_id VARCHAR(50) UNIQUE NOT NULL,
    facility VARCHAR(100) NOT NULL,  -- 'Baldwin Park', 'Taiwan', 'Ahmedabad'
    tank_type VARCHAR(50) DEFAULT 'vapor_phase_ln2',
    capacity_units INTEGER,
    current_units INTEGER DEFAULT 0,
    temperature_c DECIMAL(5,2) DEFAULT -196.0,
    ln2_level_pct DECIMAL(5,2),
    status VARCHAR(20) DEFAULT 'active',  -- 'active', 'maintenance', 'offline', 'decommissioned'
    last_inspection_at TIMESTAMPTZ,
    next_inspection_at TIMESTAMPTZ,
    monitoring_enabled BOOLEAN DEFAULT true,
    alarm_thresholds JSONB,  -- {temp_max: -170, ln2_min_pct: 20}
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tank temperature logs (IoT sensor data)
CREATE TABLE tank_temperature_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tank_id UUID REFERENCES storage_tanks(id) ON DELETE CASCADE,
    recorded_at TIMESTAMPTZ NOT NULL,
    temperature_c DECIMAL(5,2) NOT NULL,
    ln2_level_pct DECIMAL(5,2),
    sensor_id VARCHAR(50),
    alert_triggered BOOLEAN DEFAULT false,
    alert_type VARCHAR(50),  -- 'temp_high', 'ln2_low', 'sensor_fault'
    created_at TIMESTAMPTZ DEFAULT now()
);

-- CRM/ERP Sync Log
CREATE TABLE crm_sync_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(50) NOT NULL,  -- 'family', 'enrollment', 'collection', 'unit', 'transplant'
    entity_id UUID NOT NULL,
    crm_id VARCHAR(100),
    operation VARCHAR(20) NOT NULL,  -- 'create', 'update', 'delete', 'sync'
    payload JSONB,
    response JSONB,
    status crm_sync_status DEFAULT 'pending',
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- CSV Import Batches
CREATE TABLE csv_import_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id VARCHAR(50) UNIQUE NOT NULL,
    filename VARCHAR(255) NOT NULL,
    file_size_bytes BIGINT,
    file_hash VARCHAR(64),  -- SHA256
    imported_by VARCHAR(100),
    total_rows INTEGER,
    successful_rows INTEGER DEFAULT 0,
    failed_rows INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'processing',  -- 'processing', 'completed', 'failed', 'partial'
    error_summary JSONB,
    started_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'
);

-- KPIs / Aggregated Metrics (Materialized views refreshed periodically)
CREATE TABLE stemcyte_kpis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_date DATE NOT NULL,
    metric_name VARCHAR(100) NOT NULL,
    metric_category VARCHAR(50),  -- 'enrollment', 'collection', 'processing', 'storage', 'transplant', 'quality', 'financial'
    facility VARCHAR(100),
    region VARCHAR(50),
    value NUMERIC,
    target_value NUMERIC,
    unit VARCHAR(20),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(metric_date, metric_name, facility, region)
);

-- ============================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================
CREATE INDEX idx_enrollments_family ON enrollments(family_id);
CREATE INDEX idx_enrollments_status ON enrollments(status);
CREATE INDEX idx_enrollments_due_date ON enrollments(expected_due_date);
CREATE INDEX idx_enrollments_crm_id ON enrollments(family_id) WHERE crm_id IS NOT NULL;

CREATE INDEX idx_kits_enrollment ON collection_kits(enrollment_id);
CREATE INDEX idx_kits_barcode ON collection_kits(barcode);
CREATE INDEX idx_kits_status ON collection_kits(status);

CREATE INDEX idx_units_enrollment ON cord_blood_units(enrollment_id);
CREATE INDEX idx_units_kit ON cord_blood_units(collection_kit_id);
CREATE INDEX idx_units_storage_status ON cord_blood_units(storage_status);
CREATE INDEX idx_units_storage_tank ON cord_blood_units(storage_tank_id);
CREATE INDEX idx_units_public_bank ON cord_blood_units(public_bank_access) WHERE public_bank_access = true;
CREATE INDEX idx_units_cryopreserved ON cord_blood_units(cryopreserved_at);

CREATE INDEX idx_tests_unit ON lab_test_reports(cord_blood_unit_id);
CREATE INDEX idx_tests_type ON lab_test_reports(test_type);
CREATE INDEX idx_tests_performed ON lab_test_reports(performed_at);
CREATE INDEX idx_tests_csv_batch ON lab_test_reports(csv_source_filename, csv_row_number);

CREATE INDEX idx_transplants_unit ON transplant_records(cord_blood_unit_id);
CREATE INDEX idx_transplants_enrollment ON transplant_records(enrollment_id);
CREATE INDEX idx_transplants_status ON transplant_records(status);
CREATE INDEX idx_transplants_center ON transplant_records(transplant_center_id);

CREATE INDEX idx_tank_logs_tank_time ON tank_temperature_logs(tank_id, recorded_at DESC);
CREATE INDEX idx_tank_logs_alert ON tank_temperature_logs(alert_triggered) WHERE alert_triggered = true;

CREATE INDEX idx_crm_sync_entity ON crm_sync_log(entity_type, entity_id);
CREATE INDEX idx_crm_sync_status ON crm_sync_log(status);
CREATE INDEX idx_crm_sync_created ON crm_sync_log(created_at DESC);

CREATE INDEX idx_csv_batches_status ON csv_import_batches(status);
CREATE INDEX idx_csv_batches_filename ON csv_import_batches(filename);

CREATE INDEX idx_kpis_date_cat ON stemcyte_kpis(metric_date DESC, metric_category);

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Generate enrollment number
CREATE OR REPLACE FUNCTION generate_enrollment_number()
RETURNS VARCHAR AS $$
DECLARE
    year INT := EXTRACT(YEAR FROM now())::INT;
    seq INT;
BEGIN
    SELECT COALESCE(MAX(
        (split_part(enrollment_number, '-', 3))::INT
    ), 0) + 1 INTO seq
    FROM enrollments
    WHERE enrollment_number LIKE 'ENR-' || year || '-%';
    RETURN 'ENR-' || year || '-' || LPAD(seq::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- Generate unit number
CREATE OR REPLACE FUNCTION generate_unit_number()
RETURNS VARCHAR AS $$
DECLARE
    year INT := EXTRACT(YEAR FROM now())::INT;
    seq INT;
BEGIN
    SELECT COALESCE(MAX(
        (split_part(unit_number, '-', 3))::INT
    ), 0) + 1 INTO seq
    FROM cord_blood_units
    WHERE unit_number LIKE 'CBU-' || year || '-%';
    RETURN 'CBU-' || year || '-' || LPAD(seq::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- Generate kit number
CREATE OR REPLACE FUNCTION generate_kit_number()
RETURNS VARCHAR AS $$
DECLARE
    year INT := EXTRACT(YEAR FROM now())::INT;
    seq INT;
BEGIN
    SELECT COALESCE(MAX(
        (split_part(kit_number, '-', 3))::INT
    ), 0) + 1 INTO seq
    FROM collection_kits
    WHERE kit_number LIKE 'KIT-' || year || '-%';
    RETURN 'KIT-' || year || '-' || LPAD(seq::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- Generate transplant number
CREATE OR REPLACE FUNCTION generate_transplant_number()
RETURNS VARCHAR AS $$
DECLARE
    year INT := EXTRACT(YEAR FROM now())::INT;
    seq INT;
BEGIN
    SELECT COALESCE(MAX(
        (split_part(transplant_number, '-', 3))::INT
    ), 0) + 1 INTO seq
    FROM transplant_records
    WHERE transplant_number LIKE 'TXP-' || year || '-%';
    RETURN 'TXP-' || year || '-' || LPAD(seq::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TRIGGERS FOR AUTO-UPDATED_AT
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_families_updated_at BEFORE UPDATE ON families FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_enrollments_updated_at BEFORE UPDATE ON enrollments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_kits_updated_at BEFORE UPDATE ON collection_kits FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_units_updated_at BEFORE UPDATE ON cord_blood_units FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_tests_updated_at BEFORE UPDATE ON lab_test_reports FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_transplants_updated_at BEFORE UPDATE ON transplant_records FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_tanks_updated_at BEFORE UPDATE ON storage_tanks FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY (Optional - for multi-tenant)
-- ============================================================
-- ALTER TABLE families ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE cord_blood_units ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE collection_kits ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE lab_test_reports ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE transplant_records ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- SAMPLE VIEWS FOR DASHBOARD
-- ============================================================

-- Enrollment pipeline view
CREATE OR REPLACE VIEW enrollment_pipeline AS
SELECT 
    status,
    COUNT(*) as count,
    SUM(total_amount) as pipeline_value,
    AVG(EXTRACT(DAY FROM (expected_due_date - now()))) as avg_days_to_due
FROM enrollments
WHERE status IN ('pending', 'active')
GROUP BY status;

-- Collection efficiency
CREATE OR REPLACE VIEW collection_efficiency AS
SELECT 
    DATE_TRUNC('week', collected_at) as week,
    COUNT(*) as total_collections,
    COUNT(*) FILTER (WHERE status = 'completed') as successful,
    COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
    AVG(collection_volume_ml) as avg_volume_ml,
    AVG(EXTRACT(EPOCH FROM (received_at_lab - collected_at))/3600) as avg_transit_hours
FROM collection_kits
WHERE collected_at IS NOT NULL
GROUP BY DATE_TRUNC('week', collected_at)
ORDER BY week DESC;

-- Processing quality metrics
CREATE OR REPLACE VIEW processing_quality AS
SELECT 
    processing_method,
    COUNT(*) as total_processed,
    AVG(tnc_recovery_pct) as avg_tnc_recovery,
    AVG(cd34_recovery_pct) as avg_cd34_recovery,
    AVG(viability_pct) as avg_viability,
    AVG(volume_ml) as avg_final_volume,
    COUNT(*) FILTER (WHERE viability_pct < 85) as low_viability_count
FROM cord_blood_units
WHERE processing_completed_at IS NOT NULL
GROUP BY processing_method;

-- Storage inventory by tank
CREATE OR REPLACE VIEW storage_inventory AS
SELECT 
    st.tank_id,
    st.facility,
    st.capacity_units,
    st.current_units,
    ROUND(st.current_units::NUMERIC / NULLIF(st.capacity_units, 0) * 100, 1) as utilization_pct,
    st.temperature_c,
    st.ln2_level_pct,
    COUNT(cbu.id) as actual_units
FROM storage_tanks st
LEFT JOIN cord_blood_units cbu ON cbu.storage_tank_id = st.tank_id AND cbu.storage_status = 'cryopreserved'
WHERE st.status = 'active'
GROUP BY st.tank_id, st.facility, st.capacity_units, st.current_units, st.temperature_c, st.ln2_level_pct;

-- Transplant outcomes
CREATE OR REPLACE VIEW transplant_outcomes AS
SELECT 
    DATE_TRUNC('month', infused_at) as month,
    COUNT(*) as total_transplants,
    COUNT(*) FILTER (WHERE engraftment_at IS NOT NULL) as engrafted,
    ROUND(COUNT(*) FILTER (WHERE engraftment_at IS NOT NULL)::NUMERIC / NULLIF(COUNT(*), 0) * 100, 1) as engraftment_rate_pct,
    AVG(hla_match_score) as avg_hla_match,
    AVG(post_thaw_viability_pct) as avg_post_thaw_viability
FROM transplant_records
WHERE infused_at IS NOT NULL
GROUP BY DATE_TRUNC('month', infused_at)
ORDER BY month DESC;

-- ============================================================
-- GRANTS (Adjust for your roles)
-- ============================================================
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO stemcyte_app;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO stemcyte_app;