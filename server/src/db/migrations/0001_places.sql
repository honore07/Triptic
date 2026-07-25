-- TRIPTIC — base de connaissance des lieux (phase A)
-- À exécuter sur le VPS : psql -d triptic_db -f 0001_places.sql
-- Idempotente.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE TABLE IF NOT EXISTS places (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL,               -- peak|pass|lake|waterfall|gorge|glacier|viewpoint|refuge|camp|castle|village|museum|attraction|poi
  location     GEOGRAPHY(POINT, 4326) NOT NULL,
  region       TEXT,                        -- alsace-vosges | alpes-fr | alpes-ch | alpes-it
  elevation_m  INT,
  tags         TEXT[] NOT NULL DEFAULT '{}',
  summary      TEXT,
  notoriety    INT NOT NULL DEFAULT 20 CHECK (notoriety BETWEEN 0 AND 100),
  confidence   INT NOT NULL DEFAULT 50 CHECK (confidence BETWEEN 0 AND 100),
  status       TEXT NOT NULL DEFAULT 'active',  -- active | pending | rejected
  source       TEXT NOT NULL,               -- osm | datatourisme | web | user
  source_id    TEXT,
  source_url   TEXT,
  wikidata_id  TEXT,
  wikipedia    TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Recherche géographique (couloir de trip) — l'index qui rend tout instantané
CREATE INDEX IF NOT EXISTS idx_places_geo ON places USING GIST (location);
-- Filtres courants
CREATE INDEX IF NOT EXISTS idx_places_kind ON places (kind);
CREATE INDEX IF NOT EXISTS idx_places_region ON places (region);
CREATE INDEX IF NOT EXISTS idx_places_status ON places (status);
CREATE INDEX IF NOT EXISTS idx_places_notoriety ON places (notoriety);
-- Imports idempotents : un même élément source ne rentre qu'une fois
CREATE UNIQUE INDEX IF NOT EXISTS idx_places_source_uniq
  ON places (source, source_id) WHERE source_id IS NOT NULL;
-- Dédoublonnage inter-sources : nom normalisé (sans accents, minuscule).
-- unaccent() est STABLE : wrapper IMMUTABLE requis pour l'index fonctionnel.
CREATE OR REPLACE FUNCTION immutable_unaccent(text)
RETURNS text AS $$ SELECT public.unaccent('public.unaccent', $1) $$
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT;

CREATE INDEX IF NOT EXISTS idx_places_name_norm
  ON places (lower(immutable_unaccent(name)));
