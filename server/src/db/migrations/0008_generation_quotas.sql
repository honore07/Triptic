-- Quota de générations IA par utilisateur et par mois (règle : free = 3/mois).
-- user_id en TEXT : uuid Supabase pour les comptes, 'anonymous' en dev/démo.
-- Pas de FK vers users : le quota doit tenir même avant provisioning du compte.
CREATE TABLE IF NOT EXISTS generation_quotas (
  user_id TEXT NOT NULL,
  month   TEXT NOT NULL, -- 'YYYY-MM' (UTC)
  used    INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, month)
);
