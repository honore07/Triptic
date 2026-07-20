-- TRIPTIC — avis utilisateurs sur les lieux (phase E)
-- À exécuter sur le VPS : psql -d triptic_db -f 0002_place_reviews.sql
-- Idempotente.

CREATE TABLE IF NOT EXISTS place_reviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id    UUID NOT NULL REFERENCES places(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id),
  rating      INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_place_reviews_place ON place_reviews(place_id);
