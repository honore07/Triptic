-- TRIPTIC — migration initiale (idempotente)
-- À exécuter sur le VPS : psql -d triptic_db -f 0000_init.sql

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT UNIQUE NOT NULL,
  name        TEXT,
  plan        TEXT NOT NULL DEFAULT 'free',
  lang        TEXT NOT NULL DEFAULT 'fr',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trips (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES users(id),
  title          TEXT NOT NULL,
  slug           TEXT UNIQUE,
  is_public      BOOLEAN NOT NULL DEFAULT false,
  mode           TEXT,
  status         TEXT NOT NULL DEFAULT 'draft',
  metadata       JSONB,
  waypoints      GEOGRAPHY(LINESTRING, 4326),
  waypoints_json JSONB,
  gpx_url        TEXT,
  cover_photo    TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trips_user ON trips(user_id);
CREATE INDEX IF NOT EXISTS idx_trips_waypoints_geo ON trips USING GIST (waypoints);

CREATE TABLE IF NOT EXISTS ai_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id),
  messages    JSONB NOT NULL DEFAULT '[]',
  context     JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trip_feedbacks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     UUID REFERENCES trips(id),
  user_id     UUID REFERENCES users(id),
  rating      INT CHECK (rating BETWEEN 1 AND 5),
  issues      TEXT[],
  comment     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS van_spots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  category    TEXT,
  source      TEXT,
  location    GEOGRAPHY(POINT, 4326),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_van_spots_geo ON van_spots USING GIST (location);
