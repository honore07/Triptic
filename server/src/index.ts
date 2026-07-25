import { createProviderFromEnv } from '@triptic/ai-engine';
import { createApp } from './app.js';
import { env } from './env.js';
import { logger } from './logger.js';
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

app.listen(env.port, () => {
  logger.info(
    { port: env.port, provider: provider.name, store: repo ? 'postgres' : 'memory' },
    'TRIPTIC API started',
  );
});
