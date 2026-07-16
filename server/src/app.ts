import express, { type Express } from 'express';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import type { LlmProvider } from '@triptic/ai-engine';
import { env } from './env.js';
import { logger } from './logger.js';
import { authMiddleware } from './middleware/auth.js';
import { aiRateLimiter } from './middleware/rateLimit.js';
import { MemoryTripRepo, type TripRepo } from './repo/trips.js';
import { createAiRouter } from './routes/ai.js';
import { createPublicTripsRouter, createTripsRouter } from './routes/trips.js';
import { QuotaService } from './services/quota.js';

export interface AppDeps {
  provider: LlmProvider;
  repo?: TripRepo;
  quota?: QuotaService;
}

export function createApp({ provider, repo, quota }: AppDeps): Express {
  const app = express();
  const tripRepo = repo ?? new MemoryTripRepo();
  const quotaService = quota ?? new QuotaService();

  app.use(cors({ origin: env.appUrl, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(pinoHttp({ logger, autoLogging: env.isProd }));
  app.use(authMiddleware);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', version: '0.1.0', provider: provider.name });
  });

  app.use('/api/ai', aiRateLimiter, createAiRouter(provider, quotaService));
  app.use('/api/trips', createTripsRouter(tripRepo));
  app.use('/api/public', createPublicTripsRouter(tripRepo));

  return app;
}
