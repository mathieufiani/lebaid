-- LebAid — Supabase Schema
-- Activer l'extension PostGIS dans Dashboard > Extensions > postgis

-- ============================================================
-- TABLES
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

-- ============================================================
-- SPATIAL INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_shelters_location ON shelters USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_food_points_location ON food_points USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_hospitals_location ON hospitals USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_strikes_location ON strikes USING GIST(location);

-- ============================================================
-- RPC FUNCTIONS (utilisées par les API routes)
-- ============================================================

CREATE OR REPLACE FUNCTION get_shelters_nearby(
  p_lat FLOAT,
  p_lng FLOAT,
  p_radius FLOAT  -- en mètres
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
$$ LANGUAGE plpgsql;


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
$$ LANGUAGE plpgsql;


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
$$ LANGUAGE plpgsql;


-- ============================================================
-- DONNÉES DE TEST (5-10 ressources réelles du Liban)
-- ============================================================

INSERT INTO shelters (name, name_ar, type, location, capacity, current_occupancy, status, district, governorate, contact_phone, source) VALUES
  ('École publique Achrafieh', 'مدرسة عامة أشرفية', 'school', ST_Point(35.5131, 33.8886)::geography, 200, 143, 'open', 'Achrafieh', 'Beyrouth', '+961 1 321 456', 'manual'),
  ('Mosquée Al-Amin', 'جامع الأمين', 'mosque', ST_Point(35.5014, 33.8889)::geography, 150, 89, 'open', 'Centre-ville', 'Beyrouth', '+961 1 987 654', 'manual'),
  ('Centre communautaire Bourj Hammoud', 'مركز بورج حمود', 'community_center', ST_Point(35.5395, 33.8886)::geography, 300, 300, 'full', 'Bourj Hammoud', 'Mont-Liban', NULL, 'manual'),
  ('Église Saint-Georges Byblos', 'كنيسة مار جرجس', 'church', ST_Point(35.6480, 34.1208)::geography, 100, 60, 'open', 'Byblos', 'Mont-Liban', '+961 9 540 000', 'manual'),
  ('École UNRWA Saïda', 'مدرسة الأونروا صيدا', 'school', ST_Point(35.3714, 33.5583)::geography, 400, 380, 'open', 'Saïda', 'Liban-Sud', '+961 7 720 000', 'manual')
ON CONFLICT DO NOTHING;

INSERT INTO food_points (name, name_ar, organization, location, schedule, status, district, governorate, contact_phone, source) VALUES
  ('Distribution WFP Beyrouth', 'توزيع برنامج الغذاء بيروت', 'WFP', ST_Point(35.5122, 33.8869)::geography, 'Lun-Ven 9h-17h', 'active', 'Centre-ville', 'Beyrouth', '+961 1 981 301', 'manual'),
  ('Croix-Rouge Libanaise Tripoli', 'الصليب الأحمر اللبناني طرابلس', 'Croix-Rouge Libanaise', ST_Point(35.8497, 34.4333)::geography, 'Sam-Dim 8h-14h', 'active', 'Centre-ville', 'Liban-Nord', '+961 6 420 000', 'manual'),
  ('Caritas Liban Saïda', 'كاريتاس لبنان صيدا', 'Caritas', ST_Point(35.3700, 33.5600)::geography, 'Lun-Ven 8h-16h', 'active', 'Saïda', 'Liban-Sud', '+961 7 720 150', 'manual')
ON CONFLICT DO NOTHING;

INSERT INTO hospitals (name, name_ar, type, location, status, emergency_available, district, governorate, contact_phone, source) VALUES
  ('Hôpital Américain de Beyrouth (AUB)', 'مستشفى الجامعة الأمريكية في بيروت', 'hospital', ST_Point(35.4878, 33.9008)::geography, 'operational', true, 'Hamra', 'Beyrouth', '+961 1 350 000', 'manual'),
  ('Hôtel-Dieu de France', 'هوتيل ديو دو فرانس', 'hospital', ST_Point(35.5052, 33.8925)::geography, 'operational', true, 'Achrafieh', 'Beyrouth', '+961 1 615 300', 'manual'),
  ('Hôpital Najjar Tripoli', 'مستشفى نجار طرابلس', 'hospital', ST_Point(35.8503, 34.4369)::geography, 'operational', false, 'Tripoli', 'Liban-Nord', '+961 6 430 000', 'manual'),
  ('Clinique de campagne Tyr', 'عيادة ميدانية صور', 'field_clinic', ST_Point(35.2042, 33.2731)::geography, 'limited', true, 'Tyr', 'Liban-Sud', NULL, 'manual')
ON CONFLICT DO NOTHING;
