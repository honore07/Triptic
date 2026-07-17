---
name: postgis
description: PostGIS geospatial patterns for TRIPTIC — SRID choice, GEOGRAPHY
  columns, GIST indexes, distance/radius queries on GPX traces and van spots.
  Triggers on any geospatial query, schema, or migration task.
user-invocable: false
---

# PostGIS Geospatial — TRIPTIC

## SRID
- **4326** (WGS84) pour tout stockage GPS (waypoints, tracés GPX)
- **3857** (Web Mercator) uniquement pour l'affichage carte si besoin de reprojection
- Ne jamais mélanger les SRID dans une même requête sans `ST_Transform`

## Colonnes & Index
- Tracés : `GEOGRAPHY(LINESTRING, 4326)` — les calculs de distance sont en mètres
- Points : `GEOGRAPHY(POINT, 4326)`
- Toujours un index GIST : `CREATE INDEX idx_x_geo ON t USING GIST (col);`

## Requêtes types
```sql
-- Spots van life dans un rayon de 20 km autour d'un tracé
SELECT spots.name, spots.category,
       ST_Distance(spots.location::geography, trip.waypoints::geography) AS dist_m
FROM van_spots spots, trips trip
WHERE trip.id = $1
  AND ST_DWithin(spots.location::geography, trip.waypoints::geography, 20000)
ORDER BY dist_m ASC
LIMIT 10;
```
- `ST_DWithin` (utilise l'index) plutôt que `ST_Distance < x` (scan complet)
- Longueur d'un tracé : `ST_Length(waypoints::geography)` → mètres
- Construction d'un tracé : `ST_MakeLine(ARRAY[ST_MakePoint(lon, lat), ...])::geography`
  (ordre **lon, lat** — pas lat, lon)

## Migrations
- Idempotentes : `CREATE EXTENSION IF NOT EXISTS postgis;`
- Jamais de calcul géo en JS si PostGIS peut le faire (règle projet)
