-- LebAid — Migration 001
-- Run in Supabase Dashboard > SQL Editor

-- Enable PostGIS (if not already)
CREATE EXTENSION IF NOT EXISTS postgis;

-- submissions table (crowdsourced, pending moderation)
CREATE TABLE IF NOT EXISTS submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('shelter', 'food', 'health', 'pharmacy', 'other')),
  name TEXT,
  name_ar TEXT,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  governorate TEXT NOT NULL,
  district TEXT,
  contact_phone TEXT,
  notes TEXT,
  submitter_ip TEXT,
  submitter_email TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
CREATE INDEX IF NOT EXISTS idx_submissions_created ON submissions(created_at);

ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_insert_submissions"
  ON submissions FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "admin_all_submissions"
  ON submissions FOR ALL TO service_role USING (true);

-- pharmacies table (approved pharmacies)
CREATE TABLE IF NOT EXISTS pharmacies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_ar TEXT,
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  status TEXT CHECK (status IN ('open', 'closed')) DEFAULT 'open',
  district TEXT,
  governorate TEXT NOT NULL,
  contact_phone TEXT,
  source TEXT DEFAULT 'crowdsourced',
  last_updated TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pharmacies_location ON pharmacies USING GIST(location);

ALTER TABLE pharmacies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pharmacies_public_read" ON pharmacies FOR SELECT USING (true);
CREATE POLICY "pharmacies_auth_write" ON pharmacies FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- RPC for nearby pharmacies
CREATE OR REPLACE FUNCTION get_pharmacies_nearby(p_lat FLOAT, p_lng FLOAT, p_radius FLOAT)
RETURNS TABLE (
  id UUID, name TEXT, name_ar TEXT, lat FLOAT, lng FLOAT,
  distance_km FLOAT, status TEXT, district TEXT,
  governorate TEXT, contact_phone TEXT, last_updated TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.name, p.name_ar,
    ST_Y(p.location::geometry)::FLOAT, ST_X(p.location::geometry)::FLOAT,
    ROUND((ST_Distance(p.location, ST_Point(p_lng, p_lat)::geography)/1000)::numeric,2)::FLOAT,
    p.status, p.district, p.governorate, p.contact_phone, p.last_updated
  FROM pharmacies p
  WHERE ST_DWithin(p.location, ST_Point(p_lng, p_lat)::geography, p_radius)
    AND p.status = 'open'
  ORDER BY 6 ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
