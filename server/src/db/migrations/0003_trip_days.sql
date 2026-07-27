-- TRIPTIC — structure Trip → Jours → Activités (roadmap 0.1)
-- À exécuter sur le VPS : psql -d triptic_db -f 0003_trip_days.sql
-- Idempotente. Réversible : ALTER TABLE trips DROP COLUMN days_json;

-- Jours → activités → segments (JSONB structuré ; les géométries de segment
-- sont des coordonnées GeoJSON [lng,lat] issues de GraphHopper/OSM — stockage
-- autorisé, contrairement à Mapbox Directions).
ALTER TABLE trips ADD COLUMN IF NOT EXISTS days_json JSONB;
