import { pino, stdSerializers } from 'pino';

/** Règle sécurité : pas d'email, pas d'IP, pas de token dans les logs. */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  // Traefik (et Cloudflare en proxy) transmettent l'IP du visiteur dans ces en-têtes.
  'req.headers["x-forwarded-for"]',
  'req.headers["x-real-ip"]',
  'req.headers["cf-connecting-ip"]',
  'req.remoteAddress',
  '*.email',
  '*.ip',
  '*.token',
  '*.apiKey',
];

export const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  serializers: { error: stdSerializers.err },
  redact: { paths: REDACT_PATHS, censor: '[redacted]' },
});
