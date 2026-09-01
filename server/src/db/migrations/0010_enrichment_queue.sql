-- File d'enrichissement des zones sous-couvertes.
--
-- Elle vivait dans un tableau en mémoire : un redémarrage de l'API (PM2 en
-- compte plus de 16 000 sur ce VPS) perdait les zones en attente, sans trace.
-- La zone n'était jamais enrichie, et personne ne le savait.
--
-- Le déclenchement reste immédiat après une génération — c'est ce qui fait que
-- l'utilisateur suivant trouve une base remplie. La table n'ajoute que la
-- mémoire : ce qui n'a pas abouti reste 'pending' et sera repris.
CREATE TABLE IF NOT EXISTS enrichment_queue (
  -- Clé de zone arrondie (cf. zoneKey dans services/enrichment.ts)
  zone_key     TEXT PRIMARY KEY,
  south        DOUBLE PRECISION NOT NULL,
  west         DOUBLE PRECISION NOT NULL,
  north        DOUBLE PRECISION NOT NULL,
  east         DOUBLE PRECISION NOT NULL,
  -- pending | done | failed
  status       TEXT NOT NULL DEFAULT 'pending',
  attempts     INT NOT NULL DEFAULT 0,
  places_added INT,
  last_error   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- La reprise cherche les zones restées en attente, les plus anciennes d'abord.
CREATE INDEX IF NOT EXISTS enrichment_queue_pending_idx
  ON enrichment_queue (status, created_at)
  WHERE status = 'pending';
