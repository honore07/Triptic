import { pino } from 'pino';

/**
 * Logs structurés Pino. Règle sécurité : pas d'email, pas d'IP, pas de token.
 */
export const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  serializers: { error: pino.stdSerializers.err },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      '*.email',
      '*.ip',
      '*.token',
      '*.apiKey',
    ],
    censor: '[redacted]',
  },
});
