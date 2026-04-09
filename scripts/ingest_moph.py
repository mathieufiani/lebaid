#!/usr/bin/env python3
"""
LebAid — MOPH ArcGIS Data Ingestion
Fetches hospitals, PHC/clinics, and pharmacies from the Lebanese Ministry of Health
ArcGIS API and upserts them into Supabase.

Source: https://maps.moph.gov.lb/server/rest/services/Health_Facility_Locator/MapServer/0/query
Coordinates: EPSG:3857 — converted to WGS84 before insertion.
"""

import math
import os
import sys
import json
import time
from datetime import datetime, timezone

import requests

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Load from .env.local (relative to this script's parent directory)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
ENV_FILE = os.path.join(PROJECT_DIR, ".env.local")


def load_env(path):
    env = {}
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    k, v = line.split("=", 1)
                    env[k.strip()] = v.strip()
    except FileNotFoundError:
        print(f"ERROR: {path} not found", file=sys.stderr)
        sys.exit(1)
    return env


env = load_env(ENV_FILE)

SUPABASE_URL = env.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
SERVICE_ROLE_KEY = env.get("SUPABASE_SERVICE_ROLE_KEY", "")

if not SUPABASE_URL or not SERVICE_ROLE_KEY:
    print("ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local", file=sys.stderr)
    sys.exit(1)

# MOPH ArcGIS REST API
MOPH_BASE = "https://maps.moph.gov.lb/server/rest/services/Health_Facility_Locator/MapServer/0/query"

# Lebanon bounding box (WGS84)
LB_LAT_MIN, LB_LAT_MAX = 33.05, 34.69
LB_LNG_MIN, LB_LNG_MAX = 35.10, 36.62

# Batch size for Supabase upserts
BATCH_SIZE = 100

# Request timeout (seconds)
REQUEST_TIMEOUT = 30

# ---------------------------------------------------------------------------
# Coordinate conversion
# ---------------------------------------------------------------------------

def epsg3857_to_wgs84(x: float, y: float) -> tuple:
    """Convert EPSG:3857 (Web Mercator) coordinates to WGS84 (lat, lng)."""
    lon = (x / 20037508.34) * 180.0
    lat = math.degrees(2.0 * math.atan(math.exp(y / 6378137.0)) - math.pi / 2.0)
    return lat, lon


def is_within_lebanon(lat: float, lng: float) -> bool:
    return LB_LAT_MIN <= lat <= LB_LAT_MAX and LB_LNG_MIN <= lng <= LB_LNG_MAX


# ---------------------------------------------------------------------------
# Governorate mapping (MOPH Arabic → LebAid French names)
# ---------------------------------------------------------------------------

GOV_MAP = {
    "بيروت": "Beyrouth",
    "جبل لبنان": "Mont-Liban",
    "الشمال": "Liban-Nord",
    "لبنان الشمالي": "Liban-Nord",
    "عكار": "Akkar",
    "الجنوب": "Liban-Sud",
    "لبنان الجنوبي": "Liban-Sud",
    "النبطية": "Nabatieh",
    "البقاع": "Bekaa",
    "بعلبك - الهرمل": "Baalbek-Hermel",
    "بعلبك الهرمل": "Baalbek-Hermel",
}


def map_governorate(raw):
    if not raw:
        return None
    raw = raw.strip()
    if raw in GOV_MAP:
        return GOV_MAP[raw]
    # Partial match fallback
    for arabic, french in GOV_MAP.items():
        if arabic in raw:
            return french
    return raw  # Return as-is if no mapping found


# ---------------------------------------------------------------------------
# MOPH API fetching (paginated)
# ---------------------------------------------------------------------------

def fetch_moph_facilities(facility_type):
    """
    Fetch all facilities of a given type from the MOPH ArcGIS API.
    Paginates with resultOffset until all records are retrieved.
    """
    all_features = []
    offset = 0
    page_size = 2000

    print(f"\n  Fetching {facility_type} from MOPH API...")

    while True:
        params = {
            "where": f"HEALTH_FACILITY_TYPE='{facility_type}'",
            "outFields": "NAME,NAME_AR,HEALTH_FACILITY_TYPE,FULL_ADDRESS,District_Name,Governorate_Name,PHONE_NUMBER",
            "returnGeometry": "true",
            "resultRecordCount": page_size,
            "resultOffset": offset,
            "f": "json",
        }

        try:
            resp = requests.get(MOPH_BASE, params=params, timeout=REQUEST_TIMEOUT)
            resp.raise_for_status()
            data = resp.json()
        except requests.exceptions.Timeout:
            print(f"  WARNING: Timeout fetching offset={offset}, retrying in 5s...")
            time.sleep(5)
            continue
        except requests.exceptions.RequestException as e:
            print(f"  ERROR: MOPH API request failed at offset={offset}: {e}", file=sys.stderr)
            break
        except json.JSONDecodeError as e:
            print(f"  ERROR: Invalid JSON response at offset={offset}: {e}", file=sys.stderr)
            break

        features = data.get("features", [])
        if not features:
            break

        all_features.extend(features)
        print(f"    Fetched {len(all_features)} {facility_type} records so far (page offset={offset})...")

        # If fewer records than page_size returned, we've reached the end
        if len(features) < page_size:
            break

        offset += page_size

    print(f"  Total {facility_type} records fetched: {len(all_features)}")
    return all_features


# ---------------------------------------------------------------------------
# Data transformation
# ---------------------------------------------------------------------------

def transform_hospital(feature, facility_type):
    """Transform a MOPH feature into a hospitals table record."""
    attrs = feature.get("attributes", {})
    geom = feature.get("geometry", {})

    x = geom.get("x")
    y = geom.get("y")

    if x is None or y is None:
        return None

    lat, lng = epsg3857_to_wgs84(float(x), float(y))

    if not is_within_lebanon(lat, lng):
        return None

    name = attrs.get("NAME") or attrs.get("NAME_AR") or "Unknown"
    if not name or name.strip() == "":
        name = "Unknown"

    # Map facility type to hospitals.type CHECK constraint
    if facility_type == "PHC":
        hosp_type = "clinic"
    elif facility_type == "HOSPITAL":
        hosp_type = "hospital"
    else:
        hosp_type = "clinic"  # fallback for any other types

    return {
        "name": name.strip(),
        "name_ar": attrs.get("NAME_AR", "").strip() if attrs.get("NAME_AR") else None,
        "type": hosp_type,
        "location": f"POINT({lng} {lat})",
        "status": "operational",
        "emergency_available": False,
        "district": attrs.get("District_Name", "").strip() if attrs.get("District_Name") else None,
        "governorate": map_governorate(attrs.get("Governorate_Name")),
        "contact_phone": attrs.get("PHONE_NUMBER", "").strip() if attrs.get("PHONE_NUMBER") else None,
        "source": "moph",
        "last_updated": datetime.now(timezone.utc).isoformat(),
    }


def transform_pharmacy(feature):
    """Transform a MOPH feature into a pharmacies table record."""
    attrs = feature.get("attributes", {})
    geom = feature.get("geometry", {})

    x = geom.get("x")
    y = geom.get("y")

    if x is None or y is None:
        return None

    lat, lng = epsg3857_to_wgs84(float(x), float(y))

    if not is_within_lebanon(lat, lng):
        return None

    name = attrs.get("NAME") or attrs.get("NAME_AR") or "Unknown"
    if not name or name.strip() == "":
        name = "Unknown"

    # pharmacies.governorate is NOT NULL — skip records without governorate
    gov = map_governorate(attrs.get("Governorate_Name"))
    if not gov:
        gov = "Unknown"  # Supabase NOT NULL requires a value

    return {
        "name": name.strip(),
        "name_ar": attrs.get("NAME_AR", "").strip() if attrs.get("NAME_AR") else None,
        "location": f"POINT({lng} {lat})",
        "status": "open",
        "district": attrs.get("District_Name", "").strip() if attrs.get("District_Name") else None,
        "governorate": gov,
        "contact_phone": attrs.get("PHONE_NUMBER", "").strip() if attrs.get("PHONE_NUMBER") else None,
        "source": "moph",
        "last_updated": datetime.now(timezone.utc).isoformat(),
    }


# ---------------------------------------------------------------------------
# Supabase upsert
# ---------------------------------------------------------------------------

def supabase_headers() -> dict:
    return {
        "apikey": SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }


def upsert_batch(table, records):
    """
    Upsert a batch of records into a Supabase table.
    Returns (inserted_count, error_count).
    """
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    try:
        resp = requests.post(
            url,
            headers=supabase_headers(),
            json=records,
            timeout=REQUEST_TIMEOUT,
        )
        if resp.status_code in (200, 201):
            return len(records), 0
        elif resp.status_code == 409:
            # Conflict — merge-duplicates should handle this, but log it
            print(f"  WARNING: Conflict on {table} batch, some records may be duplicates")
            return len(records), 0
        else:
            print(f"  ERROR: Supabase {table} upsert failed [{resp.status_code}]: {resp.text[:300]}", file=sys.stderr)
            return 0, len(records)
    except requests.exceptions.RequestException as e:
        print(f"  ERROR: Network error upserting to {table}: {e}", file=sys.stderr)
        return 0, len(records)


def upsert_records(table, records):
    """Upsert all records in batches. Returns (total_inserted, total_errors)."""
    total_inserted = 0
    total_errors = 0

    for i in range(0, len(records), BATCH_SIZE):
        batch = records[i : i + BATCH_SIZE]
        inserted, errors = upsert_batch(table, batch)
        total_inserted += inserted
        total_errors += errors
        print(f"  Batch {i // BATCH_SIZE + 1}: {inserted} upserted, {errors} errors")

    return total_inserted, total_errors


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("=" * 60)
    print("LebAid — MOPH Data Ingestion")
    print(f"Supabase: {SUPABASE_URL}")
    print("=" * 60)

    stats = {
        "hospitals_fetched": 0,
        "hospitals_valid": 0,
        "hospitals_inserted": 0,
        "clinics_fetched": 0,
        "clinics_valid": 0,
        "clinics_inserted": 0,
        "pharmacies_fetched": 0,
        "pharmacies_valid": 0,
        "pharmacies_inserted": 0,
        "total_skipped": 0,
        "total_errors": 0,
    }

    # --- Hospitals ---
    print("\n[1/3] Processing HOSPITALS")
    hospital_features = fetch_moph_facilities("HOSPITAL")
    stats["hospitals_fetched"] = len(hospital_features)

    hospital_records = []
    for f in hospital_features:
        record = transform_hospital(f, "HOSPITAL")
        if record:
            hospital_records.append(record)
        else:
            stats["total_skipped"] += 1

    stats["hospitals_valid"] = len(hospital_records)
    print(f"  Valid hospital records: {len(hospital_records)} (skipped {stats['hospitals_fetched'] - len(hospital_records)})")

    if hospital_records:
        inserted, errors = upsert_records("hospitals", hospital_records)
        stats["hospitals_inserted"] = inserted
        stats["total_errors"] += errors

    # --- PHC / Clinics ---
    print("\n[2/3] Processing PHC / CLINICS")
    phc_features = fetch_moph_facilities("PHC")
    stats["clinics_fetched"] = len(phc_features)

    clinic_records = []
    for f in phc_features:
        record = transform_hospital(f, "PHC")
        if record:
            clinic_records.append(record)
        else:
            stats["total_skipped"] += 1

    stats["clinics_valid"] = len(clinic_records)
    print(f"  Valid clinic records: {len(clinic_records)} (skipped {stats['clinics_fetched'] - len(clinic_records)})")

    if clinic_records:
        inserted, errors = upsert_records("hospitals", clinic_records)
        stats["clinics_inserted"] = inserted
        stats["total_errors"] += errors

    # --- Pharmacies ---
    print("\n[3/3] Processing PHARMACIES")
    pharmacy_features = fetch_moph_facilities("PHARMACY")
    stats["pharmacies_fetched"] = len(pharmacy_features)

    pharmacy_records = []
    for f in pharmacy_features:
        record = transform_pharmacy(f)
        if record:
            pharmacy_records.append(record)
        else:
            stats["total_skipped"] += 1

    stats["pharmacies_valid"] = len(pharmacy_records)
    print(f"  Valid pharmacy records: {len(pharmacy_records)} (skipped {stats['pharmacies_fetched'] - len(pharmacy_records)})")

    if pharmacy_records:
        inserted, errors = upsert_records("pharmacies", pharmacy_records)
        stats["pharmacies_inserted"] = inserted
        stats["total_errors"] += errors

    # --- Summary ---
    print("\n" + "=" * 60)
    print("INGESTION SUMMARY")
    print("=" * 60)
    print(f"  Hospitals fetched:    {stats['hospitals_fetched']:>6}  |  inserted: {stats['hospitals_inserted']:>6}")
    print(f"  Clinics fetched:      {stats['clinics_fetched']:>6}  |  inserted: {stats['clinics_inserted']:>6}")
    print(f"  Pharmacies fetched:   {stats['pharmacies_fetched']:>6}  |  inserted: {stats['pharmacies_inserted']:>6}")
    print(f"  Total skipped:        {stats['total_skipped']:>6}  (outside Lebanon bbox or no geometry)")
    print(f"  Total errors:         {stats['total_errors']:>6}")
    print("=" * 60)

    if stats["total_errors"] > 0:
        print("WARNING: Some records failed to insert. Check errors above.")
        sys.exit(1)
    else:
        print("SUCCESS: MOPH ingestion complete.")


if __name__ == "__main__":
    main()
