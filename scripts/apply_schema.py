#!/usr/bin/env python3
"""
LebAid — Apply database schema to Supabase.

This script creates the missing tables (hospitals, shelters, food_points, strikes)
in the Supabase database. It requires the database password, which is separate
from the service role key.

Usage:
  python3 scripts/apply_schema.py

You will be prompted for the database password, which you can find at:
  Supabase Dashboard > Project Settings > Database > Connection info > Password

Alternatively, set the SUPABASE_DB_PASSWORD environment variable.
"""

import os
import sys
import subprocess
import getpass

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
ENV_FILE = os.path.join(PROJECT_DIR, ".env.local")

PROJECT_REF = "clfczfjtzxqhxtegcwgb"

# Full SQL schema for missing tables
SCHEMA_SQL = """
-- Enable PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- hospitals table
CREATE TABLE IF NOT EXISTS hospitals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_ar TEXT,
  type TEXT CHECK (type IN ('hospital', 'clinic', 'field_clinic')) DEFAULT 'hospital',
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  status TEXT CHECK (status IN ('operational', 'limited', 'closed')) DEFAULT 'operational',
  emergency_available BOOLEAN DEFAULT false,
  district TEXT,
  governorate TEXT,
  contact_phone TEXT,
  source TEXT,
  last_updated TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hospitals_location ON hospitals USING GIST(location);

-- Enable RLS
ALTER TABLE hospitals ENABLE ROW LEVEL SECURITY;

-- Public read
CREATE POLICY IF NOT EXISTS "hospitals_public_read"
  ON hospitals FOR SELECT USING (true);

-- Service role write
CREATE POLICY IF NOT EXISTS "hospitals_service_write"
  ON hospitals FOR ALL TO service_role USING (true) WITH CHECK (true);

-- shelters table
CREATE TABLE IF NOT EXISTS shelters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_ar TEXT,
  type TEXT CHECK (type IN ('school', 'mosque', 'church', 'community_center', 'other')) DEFAULT 'other',
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  capacity INT,
  current_occupancy INT,
  status TEXT CHECK (status IN ('open', 'full', 'closed')) DEFAULT 'open',
  district TEXT,
  governorate TEXT,
  contact_phone TEXT,
  source TEXT,
  last_updated TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shelters_location ON shelters USING GIST(location);

ALTER TABLE shelters ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "shelters_public_read" ON shelters FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "shelters_service_write" ON shelters FOR ALL TO service_role USING (true) WITH CHECK (true);

-- food_points table
CREATE TABLE IF NOT EXISTS food_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_ar TEXT,
  organization TEXT,
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  schedule TEXT,
  status TEXT CHECK (status IN ('active', 'inactive')) DEFAULT 'active',
  district TEXT,
  governorate TEXT,
  contact_phone TEXT,
  source TEXT,
  last_updated TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_food_points_location ON food_points USING GIST(location);

ALTER TABLE food_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "food_points_public_read" ON food_points FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "food_points_service_write" ON food_points FOR ALL TO service_role USING (true) WITH CHECK (true);

-- strikes table
CREATE TABLE IF NOT EXISTS strikes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location GEOGRAPHY(POINT, 4326),
  location_name TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  description TEXT,
  description_ar TEXT,
  source_message_id TEXT UNIQUE,
  source_url TEXT,
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_strikes_location ON strikes USING GIST(location);

ALTER TABLE strikes ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "strikes_public_read" ON strikes FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "strikes_service_write" ON strikes FOR ALL TO service_role USING (true) WITH CHECK (true);

-- RPC: get_hospitals_nearby
CREATE OR REPLACE FUNCTION get_hospitals_nearby(
  p_lat FLOAT,
  p_lng FLOAT,
  p_radius FLOAT
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  name_ar TEXT,
  type TEXT,
  lat FLOAT,
  lng FLOAT,
  distance_km FLOAT,
  status TEXT,
  emergency_available BOOLEAN,
  district TEXT,
  governorate TEXT,
  contact_phone TEXT,
  source TEXT,
  last_updated TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    h.id,
    h.name,
    h.name_ar,
    h.type,
    ST_Y(h.location::geometry) AS lat,
    ST_X(h.location::geometry) AS lng,
    ROUND((ST_Distance(h.location, ST_Point(p_lng, p_lat)::geography) / 1000)::numeric, 2)::float AS distance_km,
    h.status,
    h.emergency_available,
    h.district,
    h.governorate,
    h.contact_phone,
    h.source,
    h.last_updated
  FROM hospitals h
  WHERE ST_DWithin(h.location, ST_Point(p_lng, p_lat)::geography, p_radius)
    AND h.status != 'closed'
  ORDER BY distance_km ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: get_shelters_nearby
CREATE OR REPLACE FUNCTION get_shelters_nearby(
  p_lat FLOAT,
  p_lng FLOAT,
  p_radius FLOAT
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  name_ar TEXT,
  type TEXT,
  lat FLOAT,
  lng FLOAT,
  distance_km FLOAT,
  capacity INT,
  current_occupancy INT,
  status TEXT,
  district TEXT,
  governorate TEXT,
  contact_phone TEXT,
  source TEXT,
  last_updated TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.name,
    s.name_ar,
    s.type,
    ST_Y(s.location::geometry) AS lat,
    ST_X(s.location::geometry) AS lng,
    ROUND((ST_Distance(s.location, ST_Point(p_lng, p_lat)::geography) / 1000)::numeric, 2)::float AS distance_km,
    s.capacity,
    s.current_occupancy,
    s.status,
    s.district,
    s.governorate,
    s.contact_phone,
    s.source,
    s.last_updated
  FROM shelters s
  WHERE ST_DWithin(s.location, ST_Point(p_lng, p_lat)::geography, p_radius)
  ORDER BY distance_km ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: get_food_nearby
CREATE OR REPLACE FUNCTION get_food_nearby(
  p_lat FLOAT,
  p_lng FLOAT,
  p_radius FLOAT
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  name_ar TEXT,
  organization TEXT,
  lat FLOAT,
  lng FLOAT,
  distance_km FLOAT,
  schedule TEXT,
  status TEXT,
  district TEXT,
  governorate TEXT,
  contact_phone TEXT,
  source TEXT,
  last_updated TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    f.id,
    f.name,
    f.name_ar,
    f.organization,
    ST_Y(f.location::geometry) AS lat,
    ST_X(f.location::geometry) AS lng,
    ROUND((ST_Distance(f.location, ST_Point(p_lng, p_lat)::geography) / 1000)::numeric, 2)::float AS distance_km,
    f.schedule,
    f.status,
    f.district,
    f.governorate,
    f.contact_phone,
    f.source,
    f.last_updated
  FROM food_points f
  WHERE ST_DWithin(f.location, ST_Point(p_lng, p_lat)::geography, p_radius)
    AND f.status = 'active'
  ORDER BY distance_km ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
"""

# Connection string templates
POOLER_HOST_TEMPLATE = "aws-0-{region}.pooler.supabase.com"
REGIONS = ["us-east-1", "us-west-1", "eu-central-1", "eu-west-1", "ap-southeast-1"]


def try_psql(host, port, user, password, sql):
    """Try to run SQL via psql. Returns (success, output)."""
    env = os.environ.copy()
    env["PGPASSWORD"] = password

    conn_str = f"postgresql://{user}:{password}@{host}:{port}/postgres"
    cmd = ["psql", conn_str, "-c", sql]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            env=env,
            timeout=30,
        )
        if result.returncode == 0:
            return True, result.stdout
        return False, result.stderr
    except subprocess.TimeoutExpired:
        return False, "Connection timed out"
    except FileNotFoundError:
        return False, "psql not found"


def apply_schema_via_psql(password):
    """Try to apply schema using psql with the given password."""
    # Try transaction pooler on port 6543 (preferred for DDL)
    for region in REGIONS:
        host = POOLER_HOST_TEMPLATE.format(region=region)
        user = f"postgres.{PROJECT_REF}"
        print(f"  Trying {host}:{6543}...")

        success, output = try_psql(host, 6543, user, password, "SELECT 1;")
        if success:
            print(f"  Connected via {host}!")
            # Now apply the full schema
            import tempfile
            with tempfile.NamedTemporaryFile(mode="w", suffix=".sql", delete=False) as f:
                f.write(SCHEMA_SQL)
                sql_file = f.name

            cmd = [
                "psql",
                f"postgresql://{user}:{password}@{host}:6543/postgres",
                "-f", sql_file,
            ]
            env = os.environ.copy()
            env["PGPASSWORD"] = password
            result = subprocess.run(cmd, capture_output=True, text=True, env=env, timeout=120)
            os.unlink(sql_file)

            if result.returncode == 0:
                print("  Schema applied successfully!")
                print(result.stdout[:500])
                return True
            else:
                print(f"  Schema application failed: {result.stderr[:500]}")
                return False

    print("  Could not connect to any pooler region.")
    return False


def print_manual_instructions():
    """Print instructions for manual schema application."""
    print("\n" + "=" * 70)
    print("MANUAL SCHEMA APPLICATION REQUIRED")
    print("=" * 70)
    print("""
The hospitals, shelters, food_points, and strikes tables do not exist yet.
You need to apply the schema via the Supabase SQL Editor.

Steps:
  1. Go to https://supabase.com/dashboard/project/clfczfjtzxqhxtegcwgb/sql/new
  2. Copy the contents of supabase/schema.sql
  3. Paste and click "Run"
  4. Then run: python3 scripts/ingest_moph.py
  5. Then run: python3 scripts/ingest_osm.py

Alternatively, if you have your database password:
  export SUPABASE_DB_PASSWORD="your-password"
  python3 scripts/apply_schema.py
""")


def main():
    print("=" * 60)
    print("LebAid — Apply Database Schema")
    print(f"Project: {PROJECT_REF}")
    print("=" * 60)

    password = os.environ.get("SUPABASE_DB_PASSWORD")

    if not password:
        print("""
This script needs your Supabase DATABASE password (not the service role key).
Find it at: Dashboard > Project Settings > Database > Connection info

Press Ctrl+C to cancel and apply the schema manually instead.
""")
        try:
            password = getpass.getpass("Enter database password: ").strip()
        except KeyboardInterrupt:
            print_manual_instructions()
            sys.exit(0)

    if not password:
        print_manual_instructions()
        sys.exit(1)

    print("\nAttempting to apply schema via psql...")
    success = apply_schema_via_psql(password)

    if success:
        print("\nSchema applied. You can now run the ingestion scripts:")
        print("  python3 scripts/ingest_moph.py")
        print("  python3 scripts/ingest_osm.py")
    else:
        print_manual_instructions()
        sys.exit(1)


if __name__ == "__main__":
    main()
