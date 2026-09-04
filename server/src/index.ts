import { createProviderFromEnv } from '@triptic/ai-engine';
import { createApp } from './app.js';
import { env } from './env.js';
import { logger } from './logger.js';
import { setGalleryStore } from './services/photos.js';
import { allowPlanOverride } from './middleware/auth.js';
import { PgTripRepo } from './repo/pgTrips.js';
import { PgPlaceRepo } from './repo/places.js';
import { PgUserRepo } from './repo/users.js';
import { PgGalleryStore } from './repo/galleries.js';
import { PgEnrichmentQueueStore } from './repo/enrichmentQueue.js';
import { PgQuotaService } from './services/quota.js';

// Chaque bascule Deepseek → Claude est journalisée : c'est un surcoût et un
// symptôme (réponse vide, budget de tokens mangé par le raisonnement, 5xx).
const provider = createProviderFromEnv(process.env, ({ method, from, to, error }) => {
  logger.warn(
    { method, from, to, error: error instanceof Error ? error.message : String(error) },
    'LLM fallback',
  );
});
// PostgreSQL + PostGIS si DATABASE_URL est défini, sinon store in-memory
// (trips perdus au restart PM2 — voir deploy/vps-setup.sh pour la migration).
const repo = env.databaseUrl ? new PgTripRepo(env.databaseUrl) : undefined;
const placeRepo = env.databaseUrl ? new PgPlaceRepo(env.databaseUrl) : undefined;
const users = env.databaseUrl ? new PgUserRepo(env.databaseUrl) : undefined;
// Quota persisté par utilisateur (survit aux reloads PM2) dès qu'il y a une BDD
const quota = env.databaseUrl ? new PgQuotaService(env.databaseUrl) : undefined;
// Galeries photo persistées : filtrées une fois par l'agent photo, relues
// ensuite — le cache mémoire seul repartait de zéro à chaque redémarrage.
const galleryStore = env.databaseUrl ? new PgGalleryStore(env.databaseUrl) : undefined;
if (galleryStore) setGalleryStore(galleryStore);
// File d'enrichissement persistée : ce qui n'aboutit pas est repris plus tard
// au lieu d'être perdu avec le process.
const enrichmentQueue = env.databaseUrl ? new PgEnrichmentQueueStore(env.databaseUrl) : undefined;
const app = createApp({
  provider,
  ...(repo ? { repo } : {}),
  ...(placeRepo ? { placeRepo } : {}),
  ...(users ? { users } : {}),
  ...(quota ? { quota } : {}),
  ...(galleryStore ? { galleryStore } : {}),
  ...(enrichmentQueue ? { enrichmentQueue } : {}),
});

// QA 1.2 — durcissement paywall : rendre le mode démo impossible à rater.
if (allowPlanOverride) {
  logger.warn(
    { nodeEnv: env.nodeEnv, allowPlanOverrideEnv: process.env['ALLOW_PLAN_OVERRIDE'] ?? null },
    'Plan override actif (démo) — le header x-plan ouvre les features payantes. ' +
      'Pour fermer : NODE_ENV=production côté PM2 + retirer ALLOW_PLAN_OVERRIDE.',
  );
}

app.listen(env.port, env.host, () => {
  logger.info(
    { host: env.host, port: env.port, provider: provider.name, store: repo ? 'postgres' : 'memory' },
    'TRIPTIC API started',
  );
});
