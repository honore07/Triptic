-- 0007 — Résolution de noms tolérante pour le pipeline blogs (2026-08-07)
--
-- Les blogs écrivent « Le Grand Ballon », « Cascade de Tendon » ; la base OSM
-- a « Grand Ballon », « Cascades de Tendon ». Le match EXACT ratait tout
-- (resolvedDb=0 au 1er run complet) → tout partait en géocodage/pending.
-- Trigram (pg_trgm) permet un rattachement approché sur le lieu déjà
-- cartographié, donc un enrichissement (active) au lieu d'un doublon web.
-- Idempotent.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Index GIN trigram sur le nom normalisé (même expression que idx_places_name_norm)
-- → l'opérateur % (similarité) reste rapide sur les ~149k lieux.
CREATE INDEX IF NOT EXISTS idx_places_name_trgm
  ON places USING gin (lower(immutable_unaccent(name)) gin_trgm_ops);
