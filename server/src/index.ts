import { createProviderFromEnv } from '@triptic/ai-engine';
import { createApp } from './app.js';
import { env } from './env.js';
import { logger } from './logger.js';
import { allowPlanOverride } from './middleware/auth.js';
import { PgTripRepo } from './repo/pgTrips.js';
import { PgPlaceRepo } from './repo/places.js';

const provider = createProviderFromEnv();
// PostgreSQL + PostGIS si DATABASE_URL est défini, sinon store in-memory
// (trips perdus au restart PM2 — voir deploy/vps-setup.sh pour la migration).
const repo = env.databaseUrl ? new PgTripRepo(env.databaseUrl) : undefined;
const placeRepo = env.databaseUrl ? new PgPlaceRepo(env.databaseUrl) : undefined;
const app = createApp({
  provider,
  ...(repo ? { repo } : {}),
  ...(placeRepo ? { placeRepo } : {}),
});

// QA 1.2 — durcissement paywall : rendre le mode démo impossible à rater.
if (allowPlanOverride) {
  logger.warn(
    { nodeEnv: env.nodeEnv, allowPlanOverrideEnv: process.env['ALLOW_PLAN_OVERRIDE'] ?? null },
    'Plan override actif (démo) — le header x-plan ouvre les features payantes. ' +
      'Pour fermer : NODE_ENV=production côté PM2 + retirer ALLOW_PLAN_OVERRIDE.',
  );
}

app.listen(env.port, () => {
  logger.info(
    { port: env.port, provider: provider.name, store: repo ? 'postgres' : 'memory' },
    'TRIPTIC API started',
  );
});
