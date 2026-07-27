-- TRIPTIC — provenance TDM des lieux issus du web (roadmap 6)
-- À exécuter sur le VPS : psql -d triptic_db -f 0005_tdm_provenance.sql
-- Idempotente. Réversible : DROP TABLE tdm_sources;
--   ALTER TABLE places DROP COLUMN opt_out_status, DROP COLUMN fetch_date;

-- Provenance par fait (art. 4 directive 2019/790 / L122-5-3-III CPI) :
-- statut d'opt-out de la source AU MOMENT du fetch + date. Obligatoire pour
-- toute fiche source='web' (l'agent de conformité la refuse sinon).
ALTER TABLE places ADD COLUMN IF NOT EXISTS opt_out_status TEXT;
ALTER TABLE places ADD COLUMN IF NOT EXISTS fetch_date TIMESTAMPTZ;

-- Registre des sources web : statut d'opt-out (re-vérifié périodiquement),
-- liste d'exclusion, plafond anti-mirroring (droit sui generis des bases).
CREATE TABLE IF NOT EXISTS tdm_sources (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origin          TEXT UNIQUE NOT NULL,        -- ex. https://blog-vosges.fr
  opt_out_status  TEXT NOT NULL,               -- allowed | opted_out | unknown
  opt_out_detail  TEXT,                        -- robots.txt | meta noai | cgu | manuel
  excluded        BOOLEAN NOT NULL DEFAULT false, -- liste d'exclusion manuelle
  extracted_count INT NOT NULL DEFAULT 0,      -- plafond anti-mirroring
  last_checked_at TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
