import rateLimit from 'express-rate-limit';

/** Rate limiting sur toutes les routes /api/ai/* (règle sécurité TRIPTIC). */
export const aiRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited' },
});

/** Rate limiting strict sur /api/auth/* (5 req/min par IP). */
export const authRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited' },
});
