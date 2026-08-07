import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Express } from 'express';
import compression from 'compression';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import type { LlmProvider } from '@triptic/ai-engine';
import { env } from './env.js';
import { logger } from './logger.js';
import { authMiddleware } from './middleware/auth.js';
import { aiRateLimiter } from './middleware/rateLimit.js';
import { MemoryTripRepo, type TripRepo } from './repo/trips.js';
import type { PgPlaceRepo } from './repo/places.js';
import { createAiRouter } from './routes/ai.js';
import { createPlacesRouter } from './routes/places.js';
import { createPhotosRouter } from './routes/photos.js';
import { createPublicTripsRouter, createTripsRouter } from './routes/trips.js';
import { QuotaService } from './services/quota.js';
import { EnrichmentService } from './services/enrichment.js';
import { renderIndexWithTripOg } from './services/og.js';
import { RoutingService } from './services/routing.js';
import { WeatherService } from './services/weather.js';

export interface AppDeps {
  provider: LlmProvider;
  repo?: TripRepo;
  quota?: QuotaService;
  /** Base de connaissance des lieux — active le grounding des générations. */
  placeRepo?: PgPlaceRepo;
  /** Routing GraphHopper — segments réels des trips (0.2/0.3). */
  routing?: RoutingService;
  /** Dossier du build web statique (défaut : apps/web/dist) — injectable en test. */
  webDist?: string;
}

export function createApp({ provider, repo, quota, placeRepo, routing, webDist }: AppDeps): Express {
  const app = express();
  const tripRepo = repo ?? new MemoryTripRepo();
  const quotaService = quota ?? new QuotaService();
  const routingService =
    routing ?? new RoutingService(env.graphhopperUrl, undefined, env.graphhopperFootProfile);

  // QA 6.5 — ne pas exposer la techno du serveur
  app.disable('x-powered-by');

  app.use(cors({ origin: env.appUrl, credentials: true }));
  // QA 6.1 — gzip sur tout ce qui est servi (API JSON + statiques).
  // Les streams SSE (/api/ai/*) sont exclus : la compression les bufferise.
  app.use(
    compression({
      filter: (req, res) => {
        const contentType = res.getHeader('Content-Type');
        if (typeof contentType === 'string' && contentType.includes('text/event-stream')) {
          return false;
        }
        return compression.filter(req, res);
      },
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(pinoHttp({ logger, autoLogging: env.isProd }));
  app.use(authMiddleware);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', version: '0.1.0', provider: provider.name });
  });

  const enrichment = placeRepo
    ? new EnrichmentService(placeRepo, {
        webhookUrl: process.env['N8N_ENRICH_WEBHOOK_URL'],
      })
    : undefined;
  app.use(
    '/api/ai',
    aiRateLimiter,
    createAiRouter(provider, quotaService, placeRepo, enrichment, routingService),
  );
  app.use('/api/trips', createTripsRouter(tripRepo, routingService, new WeatherService()));
  app.use('/api/public', createPublicTripsRouter(tripRepo));
  app.use('/api/photos', createPhotosRouter(provider));
  // Monté INCONDITIONNELLEMENT : sans base, les routes qui l'exigent
  // répondent 503 « db_unavailable » (explicite) au lieu de disparaître en
  // 404 HTML, et /trails continue de générer des boucles via GraphHopper —
  // seule source de sortie à la journée qui ne dépend pas de PostGIS.
  app.use('/api/places', createPlacesRouter(placeRepo, routingService));

  // Production sans reverse proxy dédié (VPS : Traefik occupe 80/443) :
  // Express sert aussi la PWA buildée + fallback SPA.
  const distDir =
    webDist ??
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../apps/web/dist');
  if (fs.existsSync(distDir)) {
    const indexPath = path.join(distDir, 'index.html');
    // QA 6.2 — /assets est content-hashé par Vite : cache long immutable.
    app.use(
      '/assets',
      express.static(path.join(distDir, 'assets'), { maxAge: '1y', immutable: true }),
    );
    // Le reste du dist (manifest, sw, icônes…) : pas de cache long.
    // index.html jamais caché → les déploiements sont pris immédiatement.
    app.use(
      express.static(distDir, {
        index: false,
        setHeaders: (res, filePath) => {
          if (filePath === indexPath) res.setHeader('Cache-Control', 'no-cache');
        },
      }),
    );
    // Fallback SPA + OG tags par trip sur /trip/:slug (QA 1.8).
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api')) {
        next();
        return;
      }
      void (async () => {
        try {
          const html = await fs.promises.readFile(indexPath, 'utf8');
          const slugMatch = /^\/trip\/([^/]+)$/.exec(req.path);
          const body = slugMatch?.[1]
            ? await renderIndexWithTripOg(html, slugMatch[1], tripRepo, env.appUrl)
            : html;
          res.setHeader('Cache-Control', 'no-cache');
          res.type('html').send(body);
        } catch (error) {
          next(error);
        }
      })();
    });
  }

  return app;
}
