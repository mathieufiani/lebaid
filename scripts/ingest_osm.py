#!/usr/bin/env python3
"""
LebAid — OpenStreetMap (Overpass API) Data Ingestion
Fetches Lebanese hospitals and pharmacies from OSM via Overpass API
and upserts them into Supabase.

Coordinates are WGS84 — no conversion needed.
For ways, the 'center' field provides the centroid.
"""

import os
import sys
import json
import time
from datetime import datetime, timezone

import requests

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

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

# Overpass API endpoint
OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# Lebanon bounding box (WGS84)
LB_LAT_MIN, LB_LAT_MAX = 33.05, 34.69
LB_LNG_MIN, LB_LNG_MAX = 35.10, 36.62

# Batch size for Supabase upserts
BATCH_SIZE = 100

# Request timeouts
OVERPASS_TIMEOUT = 60  # Overpass can be slow
SUPABASE_TIMEOUT = 30


# ---------------------------------------------------------------------------
# Overpass API queries
# ---------------------------------------------------------------------------

HOSPITAL_QUERY = """
[out:json][timeout:35];
area["ISO3166-1"="LB"]->.searchArea;
(
  node["amenity"="hospital"](area.searchArea);
  way["amenity"="hospital"](area.searchArea);
);
out center tags;
"""

PHARMACY_QUERY = """
[out:json][timeout:35];
area["ISO3166-1"="LB"]->.searchArea;
(
  node["amenity"="pharmacy"](area.searchArea);
  way["amenity"="pharmacy"](area.searchArea);
);
out center tags;
"""


def fetch_overpass(query, label):
    """Query the Overpass API and return the list of elements."""
    print(f"\n  Fetching {label} from Overpass API (may take up to 60s)...")

    for attempt in range(3):
        try:
            resp = requests.post(
                OVERPASS_URL,
                data={"data": query},
                timeout=OVERPASS_TIMEOUT,
            )
            resp.raise_for_status()
            data = resp.json()
            elements = data.get("elements", [])
            print(f"  Retrieved {len(elements)} {label} elements from OSM")
            return elements
        except requests.exceptions.Timeout:
            wait = (attempt + 1) * 10
            print(f"  WARNING: Overpass timeout (attempt {attempt + 1}/3), retrying in {wait}s...")
            time.sleep(wait)
        except requests.exceptions.RequestException as e:
            print(f"  ERROR: Overpass request failed: {e}", file=sys.stderr)
            if attempt < 2:
                time.sleep(10)
            else:
                return []
        except json.JSONDecodeError as e:
            print(f"  ERROR: Invalid JSON from Overpass: {e}", file=sys.stderr)
            return []

    return []


# ---------------------------------------------------------------------------
# Coordinate helpers
# ---------------------------------------------------------------------------

def get_coordinates(element):
    """
    Extract (lat, lng) from an OSM element.
    - node: uses 'lat' and 'lon' directly
    - way: uses 'center.lat' and 'center.lon'
    Returns None if coordinates are missing.
    """
    elem_type = element.get("type")
    if elem_type == "node":
        lat = element.get("lat")
        lon = element.get("lon")
    elif elem_type == "way":
        center = element.get("center", {})
        lat = center.get("lat")
        lon = center.get("lon")
    else:
        return None

    if lat is None or lon is None:
        return None

    return float(lat), float(lon)


def is_within_lebanon(lat: float, lng: float) -> bool:
    return LB_LAT_MIN <= lat <= LB_LAT_MAX and LB_LNG_MIN <= lng <= LB_LNG_MAX


# ---------------------------------------------------------------------------
# Data transformation
# ---------------------------------------------------------------------------

def transform_hospital(element):
    """Transform an OSM element into a hospitals table record."""
    tags = element.get("tags", {})

    coords = get_coordinates(element)
    if coords is None:
        return None

    lat, lng = coords

    if not is_within_lebanon(lat, lng):
        return None

    # Name resolution — prefer English, then Arabic, then any name
    name = (
        tags.get("name:en")
        or tags.get("name")
        or tags.get("name:ar")
        or tags.get("int_name")
    )
    if not name or name.strip() == "":
        return None  # Skip unnamed hospitals

    name_ar = tags.get("name:ar")

    # Phone: try multiple OSM phone tags
    phone = (
        tags.get("phone")
        or tags.get("contact:phone")
        or tags.get("telephone")
    )

    return {
        "name": name.strip(),
        "name_ar": name_ar.strip() if name_ar else None,
        "type": "hospital",
        "location": f"POINT({lng} {lat})",
        "status": "operational",
        "emergency_available": tags.get("emergency") == "yes",
        "district": None,  # OSM rarely has Lebanese district info
        "governorate": None,
        "contact_phone": phone.strip() if phone else None,
        "source": "openstreetmap",
        "last_updated": datetime.now(timezone.utc).isoformat(),
    }


def transform_pharmacy(element):
    """Transform an OSM element into a pharmacies table record."""
    tags = element.get("tags", {})

    coords = get_coordinates(element)
    if coords is None:
        return None

    lat, lng = coords

    if not is_within_lebanon(lat, lng):
        return None

    name = (
        tags.get("name:en")
        or tags.get("name")
        or tags.get("name:ar")
    )
    if not name or name.strip() == "":
        return None  # Skip unnamed pharmacies

    name_ar = tags.get("name:ar")

    phone = (
        tags.get("phone")
        or tags.get("contact:phone")
        or tags.get("telephone")
    )

    # pharmacies.governorate is NOT NULL — use 'Unknown' if not in OSM data
    # (OSM rarely encodes Lebanese admin boundaries in tags)
    gov = (
        tags.get("addr:province")
        or tags.get("addr:state")
        or "Unknown"
    )

    return {
        "name": name.strip(),
        "name_ar": name_ar.strip() if name_ar else None,
        "location": f"POINT({lng} {lat})",
        "status": "open",
        "district": tags.get("addr:district") or None,
        "governorate": gov,
        "contact_phone": phone.strip() if phone else None,
        "source": "openstreetmap",
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
    Upsert a batch of records into Supabase.
    Returns (inserted_count, error_count).
    """
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    try:
        resp = requests.post(
            url,
            headers=supabase_headers(),
            json=records,
            timeout=SUPABASE_TIMEOUT,
        )
        if resp.status_code in (200, 201):
            return len(records), 0
        elif resp.status_code == 409:
            print(f"  WARNING: Conflict on {table} batch (merge-duplicates active)")
            return len(records), 0
        else:
            print(f"  ERROR: Supabase {table} upsert [{resp.status_code}]: {resp.text[:300]}", file=sys.stderr)
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
    print("LebAid — OpenStreetMap Data Ingestion")
    print(f"Supabase: {SUPABASE_URL}")
    print("=" * 60)

    stats = {
        "hospitals_fetched": 0,
        "hospitals_valid": 0,
        "hospitals_inserted": 0,
        "pharmacies_fetched": 0,
        "pharmacies_valid": 0,
        "pharmacies_inserted": 0,
        "total_skipped": 0,
        "total_errors": 0,
    }

    # --- Hospitals ---
    print("\n[1/2] Processing HOSPITALS")
    hospital_elements = fetch_overpass(HOSPITAL_QUERY, "hospitals")
    stats["hospitals_fetched"] = len(hospital_elements)

    hospital_records = []
    for elem in hospital_elements:
        record = transform_hospital(elem)
        if record:
            hospital_records.append(record)
        else:
            stats["total_skipped"] += 1

    # Deduplicate by name (OSM sometimes has overlapping nodes and ways)
    seen_names = set()
    deduped_hospitals = []
    for r in hospital_records:
        key = r["name"].lower().strip()
        if key not in seen_names:
            seen_names.add(key)
            deduped_hospitals.append(r)

    stats["hospitals_valid"] = len(deduped_hospitals)
    print(f"  Valid hospital records: {len(deduped_hospitals)} (skipped {stats['hospitals_fetched'] - len(deduped_hospitals)} incl. duplicates/unnamed)")

    if deduped_hospitals:
        inserted, errors = upsert_records("hospitals", deduped_hospitals)
        stats["hospitals_inserted"] = inserted
        stats["total_errors"] += errors

    # --- Pharmacies ---
    print("\n[2/2] Processing PHARMACIES")
    pharmacy_elements = fetch_overpass(PHARMACY_QUERY, "pharmacies")
    stats["pharmacies_fetched"] = len(pharmacy_elements)

    pharmacy_records = []
    for elem in pharmacy_elements:
        record = transform_pharmacy(elem)
        if record:
            pharmacy_records.append(record)
        else:
            stats["total_skipped"] += 1

    # Deduplicate by name
    seen_names = set()
    deduped_pharmacies = []
    for r in pharmacy_records:
        key = r["name"].lower().strip()
        if key not in seen_names:
            seen_names.add(key)
            deduped_pharmacies.append(r)

    stats["pharmacies_valid"] = len(deduped_pharmacies)
    print(f"  Valid pharmacy records: {len(deduped_pharmacies)} (skipped {stats['pharmacies_fetched'] - len(deduped_pharmacies)} incl. duplicates/unnamed)")

    if deduped_pharmacies:
        inserted, errors = upsert_records("pharmacies", deduped_pharmacies)
        stats["pharmacies_inserted"] = inserted
        stats["total_errors"] += errors

    # --- Summary ---
    print("\n" + "=" * 60)
    print("INGESTION SUMMARY")
    print("=" * 60)
    print(f"  Hospitals fetched:    {stats['hospitals_fetched']:>6}  |  inserted: {stats['hospitals_inserted']:>6}")
    print(f"  Pharmacies fetched:   {stats['pharmacies_fetched']:>6}  |  inserted: {stats['pharmacies_inserted']:>6}")
    print(f"  Total skipped:        {stats['total_skipped']:>6}  (no coords, outside Lebanon, unnamed, or duplicates)")
    print(f"  Total errors:         {stats['total_errors']:>6}")
    print("=" * 60)

    if stats["total_errors"] > 0:
        print("WARNING: Some records failed to insert. Check errors above.")
        sys.exit(1)
    else:
        print("SUCCESS: OSM ingestion complete.")


if __name__ == "__main__":
    main()
