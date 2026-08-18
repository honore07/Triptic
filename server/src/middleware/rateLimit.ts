import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../env.js';

// Les suites de tests enchaînent des dizaines de requêtes sur la même app :
// on ne limite jamais en environnement de test.
const skipInTests = () => env.nodeEnv === 'test';

/** Rate limiting sur toutes les routes /api/ai/* (règle sécurité TRIPTIC). */
export const aiRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited' },
  skip: skipInTests,
});

/**
 * Lectures publiques coûteuses (/api/photos → quota Unsplash 50 req/h,
 * /api/places → PostGIS) : large pour un usage normal, bloque le grattage.
 */
export const readRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited' },
  skip: skipInTests,
});

/** Écritures BDD (POST/PATCH trips, contributions places). */
export const writeRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited' },
  skip: skipInTests,
});

const WRITE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/** Applique writeRateLimiter aux méthodes d'écriture, readRateLimiter au reste. */
export function methodAwareRateLimiter(req: Request, res: Response, next: NextFunction): void {
  if (WRITE_METHODS.has(req.method)) {
    writeRateLimiter(req, res, next);
    return;
  }
  readRateLimiter(req, res, next);
}

/** Rate limiting strict sur /api/auth/* (5 req/min par IP). */
export const authRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited' },
});
