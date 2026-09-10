import { Writable } from 'node:stream';
import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { REDACT_PATHS } from '../logger.js';

function captureLogger() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(String(chunk));
      callback();
    },
  });
  const log = pino({ redact: { paths: REDACT_PATHS, censor: '[redacted]' } }, stream);
  return { log, output: () => lines.join('') };
}

describe('logger — règle sécurité (pas d’IP, pas de jeton)', () => {
  it('masque l’IP du visiteur et le jeton, garde le reste de la requête', () => {
    const { log, output } = captureLogger();
    log.info(
      {
        req: {
          headers: {
            'x-forwarded-for': '203.0.113.7',
            'x-real-ip': '203.0.113.7',
            'cf-connecting-ip': '203.0.113.7',
            authorization: 'Bearer abc.def.ghi',
            'user-agent': 'navigateur-de-test',
          },
          remoteAddress: '203.0.113.7',
        },
      },
      'request completed',
    );
    const written = output();
    expect(written).not.toContain('203.0.113.7');
    expect(written).not.toContain('abc.def.ghi');
    expect(written).toContain('navigateur-de-test');
  });
});
