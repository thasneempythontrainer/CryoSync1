"""
CryoSync medallion transformation: Bronze -> Silver -> Gold.

Run this on a Databricks all-purpose cluster or as a Databricks job notebook.
It reads the raw Bronze tables (including Zoho CRM data already loaded into the
catalog by your custom connector) and produces:

  Silver  (cryosync_catalog.silver):
    - Clean, typed, deduplicated core tables with FK enrichment.
    - CRM + operational data stitched on `crm_id`.

  Gold    (cryosync_catalog.gold):
    - Business-ready denormalised fact tables for dashboards and Genie.

Tables expected from your Zoho CRM connector (adjust names to match yours):
  bronze.zoho_crm_contacts  -> maps to families
  bronze.zoho_crm_deals     -> maps to enrollments

This script is written for PySpark on Databricks (not the sql-connector), so it
should be pasted into a Notebook or a .py file run with `spark-submit`.
"""
from pyspark.sql import functions as F
from pyspark.sql.window import Window

CATALOG = "cryosync_catalog"
BRONZE = "bronze"
SILVER = "silver"
GOLD = "gold"

spark.conf.set("spark.sql.shuffle.partitions", "8")


def exists(catalog, schema, table):
    return spark.catalog.tableExists(f"{catalog}.{schema}.{table}")


# ---------------------------------------------------------------------------
# 1. Bronze -> Silver: dedupe + type normalisation + CRM stitching
# ---------------------------------------------------------------------------

def silver_families():
    """Stitch operational families (bronze.families) with Zoho CRM contacts."""
    cols = ["id", "crm_id", "first_name", "last_name", "email", "phone",
            "address", "date_of_birth", "medical_history", "created_at",
            "updated_at", "sync_status"]
    op = spark.table(f"{CATALOG}.{BRONZE}.families").select(*cols) if exists(CATALOG, BRONZE, "families") else None

    crm = None
    # Try a few common Zoho naming conventions.
    for name in ("zoho_crm_contacts", "contacts", "zoho_contacts"):
        if exists(CATALOG, BRONZE, name):
            crm = spark.table(f"{CATALOG}.{BRONZE}.{name}").select(
                F.col("id").alias("crm_id"),
                F.col("first_name"),
                F.col("last_name"),
                F.col("email"),
                F.col("phone"),
            ).dropDuplicates(["crm_id"])
            break

    if crm is not None:
        # Start from CRM as the master contact record, enrich with operational.
        base = crm
        if op is not None:
            base = crm.join(op.select("crm_id", "address", "date_of_birth",
                                      "medical_history", "created_at", "updated_at"),
                            "crm_id", "full_outer")
        result = base.select(
            F.coalesce("crm_id", F.monotonically_increasing_id().cast("string")).alias("id"),
            "crm_id",
            F.coalesce(F.col("first_name"), F.lit("Unknown")).alias("first_name"),
            F.coalesce(F.col("last_name"), F.lit("")).alias("last_name"),
            "email", "phone", "address",
            F.to_date("date_of_birth").alias("date_of_birth"),
            "medical_history", F.current_timestamp().alias("created_at"),
            F.current_timestamp().alias("updated_at"),
            F.lit("synced").alias("sync_status"),
        )
    else:
        result = op.select(
            "id", "crm_id", "first_name", "last_name", "email", "phone",
            "address", F.to_date("date_of_birth").alias("date_of_birth"),
            "medical_history", "created_at", "updated_at", "sync_status",
        )

    result = result.dropDuplicates(["crm_id"] if "crm_id" in result.columns else ["id"])
    result.write.mode("overwrite").format("delta").saveAsTable(f"{CATALOG}.{SILVER}.families")


def silver_cord_blood_units():
    if not exists(CATALOG, BRONZE, "cord_blood_units"):
        return
    df = spark.table(f"{CATALOG}.{BRONZE}.cord_blood_units")
    # Parse stored JSON metadata into struct columns when present.
    df = df.withColumn("_meta", F.when(F.col("data").isNotNull(), F.from_json(F.col("data"), "map<string,string>")).otherwise(F.lit(None)))
    df = df.select(
        "id", "unit_number", "enrollment_id", "collection_kit_id",
        F.to_timestamp("collected_at").alias("collected_at"),
        F.col("collection_volume_ml").cast("decimal(8,2)").alias("collection_volume_ml"),
        F.col("pre_process_tnc").cast("long").alias("pre_process_tnc"),
        F.col("post_process_tnc").cast("long").alias("post_process_tnc"),
        F.col("tnc_recovery_pct").cast("double").alias("tnc_recovery_pct"),
        F.col("viability_pct").cast("double").alias("viability_pct"),
        F.col("volume_ml").cast("double").alias("volume_ml"),
        F.col("storage_temperature_c").cast("double").alias("storage_temperature_c"),
        "storage_tank_id", "storage_status",
        F.to_timestamp("cryopreserved_at").alias("cryopreserved_at"),
        "abo_rh", "hla_typing", "notes", "metadata",
    ).dropDuplicates(["unit_number"] if "unit_number" in df.columns else ["id"])
    df.write.mode("overwrite").format("delta").saveAsTable(f"{CATALOG}.{SILVER}.cord_blood_units")


def silver_lab_test_reports():
    if not exists(CATALOG, BRONZE, "lab_test_reports"):
        return
    df = spark.table(f"{CATALOG}.{BRONZE}.lab_test_reports")
    df = df.select(
        "id", "report_id", "unit_number", "cord_blood_unit_id",
        "test_type", "test_name", "test_method", "instrument",
        F.to_timestamp("performed_at").alias("performed_at"),
        F.col("result_value").cast("string").alias("result_value"),  # preserve text/numeric
        "result_unit", "result_text",
        F.col("reference_low").cast("string").alias("reference_low"),
        F.col("reference_high").cast("string").alias("reference_high"),
        "reference_text", "status", "reviewed_by",
        F.to_timestamp("reviewed_at").alias("reviewed_at"), "review_notes",
        "batch_id", "source_filename", "source_row", "details",
    ).dropDuplicates(["report_id"] if "report_id" in df.columns else ["id"])
    df.write.mode("overwrite").format("delta").saveAsTable(f"{CATALOG}.{SILVER}.lab_test_reports")


def silver_all():
    # Mirror every remaining Bronze table to Silver (clean naming/typing later).
    for table in ["suppliers", "products", "facilities", "storage_zones",
                  "storage_tanks", "tank_temperature_logs", "collection_kits",
                  "enrollments", "transplant_records", "payment_transactions",
                  "compliance_incidents", "shipments", "inventory_lots",
                  "referral_sources", "branches", "content_documents"]:
        if exists(CATALOG, BRONZE, table):
            spark.table(f"{CATALOG}.{BRONZE}.{table}") \
                .write.mode("overwrite").format("delta") \
                .saveAsTable(f"{CATALOG}.{SILVER}.{table}")


# ---------------------------------------------------------------------------
# 2. Gold: business-ready fact/star tables for dashboards & Genie
# ---------------------------------------------------------------------------

def gold_unit_with_lab():
    """Join units with their latest lab results into one analytical table."""
    silver_units = f"{CATALOG}.{SILVER}.cord_blood_units"
    if not exists(CATALOG, SILVER, "cord_blood_units"):
        return
    units = spark.table(silver_units)
    if exists(CATALOG, SILVER, "lab_test_reports"):
        tests = spark.table(f"{CATALOG}.{SILVER}.lab_test_reports") \
            .withColumn("rn", F.row_number().over(
                Window.partitionBy("cord_blood_unit_id").orderBy(F.desc("performed_at")))) \
            .filter(F.col("rn") == 1)
        out = units.join(tests.select(
                "cord_blood_unit_id", "test_type", "test_name", "result_value",
                "result_unit", "test_status", "performed_at"),
                units["id"] == tests["cord_blood_unit_id"], "left_outer") \
            .drop(tests["cord_blood_unit_id"])
    else:
        out = units
    out.write.mode("overwrite").format("delta").saveAsTable(f"{CATALOG}.{GOLD}.unit_summary")


def gold_enrollment_funnel():
    """Funnel counts across enrollment -> collection -> cryopreservation."""
    silver = f"{CATALOG}.{SILVER}"
    cols = {"stage": "string", "count": "long"}
    funnel = spark.createDataFrame([], schema="")

    def count_for(table, stage, cond="1=1"):
        if exists(CATALOG, SILVER, table):
            return spark.table(f"{silver}.{table}").filter(cond).count()
        return 0

    rows = [
        ("enrollment", count_for("enrollments", "enrollment")),
        ("collected", count_for("collection_kits", "collected", "status='collected'")),
        ("processed", count_for("cord_blood_units", "processed", "storage_status IN ('cryopreserved','released_for_transplant','shipped')")),
        ("cryopreserved", count_for("cord_blood_units", "cryopreserved", "storage_status='cryopreserved'")),
        ("transplanted", count_for("transplant_records", "transplanted", "status IN ('infused','engrafted')")),
    ]
    funnel = spark.createDataFrame(rows, ["stage", "count"])
    funnel.write.mode("overwrite").format("delta").saveAsTable(f"{CATALOG}.{GOLD}.enrollment_funnel")


def gold_kpis():
    """Single KPI table Genie can query with natural language."""
    silver = f"{CATALOG}.{SILVER}"
    rows = []
    if exists(CATALOG, SILVER, "cord_blood_units"):
        u = spark.table(f"{silver}.cord_blood_units")
        rows.append(("cord_blood_units_total", u.count()))
        rows.append(("cord_blood_units_cryopreserved", u.filter("storage_status='cryopreserved'").count()))
        if "viability_pct" in u.columns:
            agg = u.filter("viability_pct IS NOT NULL").agg(F.avg("viability_pct"))
            rows.append(("avg_viability_pct", round(agg.first()[0] or 0, 2)))
    if exists(CATALOG, SILVER, "families"):
        f = spark.table(f"{silver}.families")
        rows.append(("total_families", f.count()))
    if exists(CATALOG, SILVER, "transplant_records"):
        t = spark.table(f"{silver}.transplant_records")
        rows.append(("total_transplants", t.count()))
        rows.append(("engrafted_transplants", t.filter("engraftment_at IS NOT NULL").count()))
    if exists(CATALOG, SILVER, "lab_test_reports"):
        rows.append(("lab_reports_total", spark.table(f"{silver}.lab_test_reports").count()))
    df = spark.createDataFrame(rows, ["metric_name", "value"])
    df.write.mode("overwrite").format("delta").saveAsTable(f"{CATALOG}.{GOLD}.kpis")


def run_all():
    spark.sql(f"CREATE SCHEMA IF NOT EXISTS {CATALOG}.{SILVER}")
    spark.sql(f"CREATE SCHEMA IF NOT EXISTS {CATALOG}.{GOLD}")
    print("== Silver ==")
    silver_families()
    silver_cord_blood_units()
    silver_lab_test_reports()
    silver_all()
    print("== Gold ==")
    gold_unit_with_lab()
    gold_enrollment_funnel()
    gold_kpis()
    print("Done.")


if __name__ == "__main__":
    run_all()
