-- 0006 — Infos pratiques factuelles sur les lieux (extension TDM blogs, 2026-08-06)
--
-- Ces colonnes captent des FAITS pratiques (tarif indicatif, saison, difficulté)
-- que les blogs outdoor donnent et qu'OSM/DATAtourisme n'ont pas. Ce sont des
-- faits (non protégés), pas de l'expression : le pipeline TDM reste dans le
-- cadre de l'exception de fouille. Voir docs/legal/LIA-tdm.md (v2) et l'agent
-- de conformité v1.1.0.
--
-- Toutes NULLABLE : ne sont remplies que si la source l'indique. Idempotent.

ALTER TABLE places ADD COLUMN IF NOT EXISTS price_min_eur integer;   -- borne basse indicative (€)
ALTER TABLE places ADD COLUMN IF NOT EXISTS price_max_eur integer;   -- borne haute indicative (€)
ALTER TABLE places ADD COLUMN IF NOT EXISTS price_free   boolean;    -- true si explicitement gratuit
ALTER TABLE places ADD COLUMN IF NOT EXISTS best_season  text[];     -- sous-ensemble {spring,summer,autumn,winter}
ALTER TABLE places ADD COLUMN IF NOT EXISTS difficulty   text;       -- easy | medium | hard
