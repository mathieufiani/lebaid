-- LebAid — Migration 002
-- Creates hospitals, shelters, food_points, and strikes tables.
-- Run in Supabase Dashboard > SQL Editor
-- URL: https://supabase.com/dashboard/project/clfczfjtzxqhxtegcwgb/sql/new

-- Ensure PostGIS is enabled (safe to re-run)
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================
-- HOSPITALS
-- ============================================================

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

ALTER TABLE hospitals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hospitals_public_read" ON hospitals;
CREATE POLICY "hospitals_public_read"
  ON hospitals FOR SELECT USING (true);

DROP POLICY IF EXISTS "hospitals_service_write" ON hospitals;
CREATE POLICY "hospitals_service_write"
  ON hospitals FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- SHELTERS
-- ============================================================

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

DROP POLICY IF EXISTS "shelters_public_read" ON shelters;
CREATE POLICY "shelters_public_read"
  ON shelters FOR SELECT USING (true);

DROP POLICY IF EXISTS "shelters_service_write" ON shelters;
CREATE POLICY "shelters_service_write"
  ON shelters FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- FOOD POINTS
-- ============================================================

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

DROP POLICY IF EXISTS "food_points_public_read" ON food_points;
CREATE POLICY "food_points_public_read"
  ON food_points FOR SELECT USING (true);

DROP POLICY IF EXISTS "food_points_service_write" ON food_points;
CREATE POLICY "food_points_service_write"
  ON food_points FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- STRIKES
-- ============================================================

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

DROP POLICY IF EXISTS "strikes_public_read" ON strikes;
CREATE POLICY "strikes_public_read"
  ON strikes FOR SELECT USING (true);

DROP POLICY IF EXISTS "strikes_service_write" ON strikes;
CREATE POLICY "strikes_service_write"
  ON strikes FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- RPC FUNCTIONS
-- ============================================================

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
