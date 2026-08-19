import { describe, expect, it } from 'vitest';
import request from 'supertest';
import type { LlmProvider } from '@triptic/ai-engine';
import { createApp } from '../app.js';

const mockProvider: LlmProvider = {
  name: 'mock',
  complete: async () => '{}',
  correct: async () => '{"valid": true, "issues": []}',
};

describe('En-têtes de sécurité (helmet)', () => {
  it('pose CSP, X-Frame-Options et nosniff sur les réponses API', async () => {
    const app = createApp({ provider: mockProvider });
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    const csp = res.headers['content-security-policy'];
    expect(csp).toBeDefined();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain('https://api.mapbox.com');
    expect(csp).toContain('worker-src');
    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('autorise les photos cross-origin (COEP désactivé, CORP cross-origin)', async () => {
    const app = createApp({ provider: mockProvider });
    const res = await request(app).get('/health');
    expect(res.headers['cross-origin-embedder-policy']).toBeUndefined();
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });
});
