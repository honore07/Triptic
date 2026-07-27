-- TRIPTIC — traces GPX des lieux (roadmap 0.4, préfigure la phase 5 rando)
-- À exécuter sur le VPS : psql -d triptic_db -f 0004_place_traces.sql
-- Idempotente. Réversible : ALTER TABLE places DROP COLUMN trace;

-- Tracé complet d'un itinéraire (WalkingTour/CyclingTour DATAtourisme,
-- relations route=hiking OSM en phase 5). Sources libres uniquement
-- (Licence Ouverte / ODbL) — jamais de GPX FFRandonnée.
ALTER TABLE places ADD COLUMN IF NOT EXISTS trace GEOGRAPHY(LINESTRING, 4326);

-- Requêtes phase 5 : boucles proches d'un waypoint (ST_DWithin sur la trace)
CREATE INDEX IF NOT EXISTS idx_places_trace ON places USING GIST (trace)
  WHERE trace IS NOT NULL;
