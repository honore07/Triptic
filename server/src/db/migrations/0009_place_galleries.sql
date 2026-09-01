-- Galeries photo des lieux — carrousel de la carte.
--
-- Le cache vivait uniquement en mémoire (TTL 24 h, 500 entrées) : il partait à
-- chaque redémarrage du process, et PM2 en compte plus de 16 000 sur ce VPS.
-- Chaque reprise refaisait l'aller-retour Wikimedia PUIS l'appel au modèle de
-- l'agent photo, pendant que l'utilisateur attendait son carrousel.
--
-- Ici la galerie est filtrée une fois et servie ensuite. Le cache mémoire reste
-- devant : il évite le round-trip SQL sur les lieux consultés en rafale.
CREATE TABLE IF NOT EXISTS place_galleries (
  -- Clé de recherche : requête + limite + coordonnées arrondies (cf. photos.ts)
  cache_key   TEXT PRIMARY KEY,
  -- PlaceMedia[] complet, crédits et licences inclus (obligatoire CGU)
  media       JSONB NOT NULL,
  -- Nom du lieu, pour le pré-calcul et le débogage
  query       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Le pré-calcul nocturne cherche les entrées les plus anciennes à rafraîchir.
CREATE INDEX IF NOT EXISTS place_galleries_updated_idx ON place_galleries (updated_at);
