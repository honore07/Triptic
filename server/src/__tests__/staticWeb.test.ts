import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { LlmProvider } from '@triptic/ai-engine';
import { createApp } from '../app.js';
import { escapeHtml } from '../services/og.js';

const mockProvider: LlmProvider = {
  name: 'mock',
  complete: async () => '{}',
  correct: async () => '{"valid": true, "issues": []}',
};

const INDEX_HTML = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <title>TRIPTIC — Plan, Explore, Repeat.</title>
  </head>
  <body><div id="root"></div></body>
</html>
`;

const WAYPOINTS = [
  { name: 'Départ', lat: 48.06, lng: 7.02, day: 1, kind: 'start' },
  { name: 'Arrivée', lat: 47.9, lng: 7.1, day: 3, kind: 'end' },
];

let webDist: string;
let app: Express;

beforeAll(() => {
  // Faux build Vite : index.html + un asset content-hashé > 1 Ko (seuil gzip)
  webDist = fs.mkdtempSync(path.join(os.tmpdir(), 'triptic-webdist-'));
  fs.mkdirSync(path.join(webDist, 'assets'));
  fs.writeFileSync(path.join(webDist, 'index.html'), INDEX_HTML);
  fs.writeFileSync(
    path.join(webDist, 'assets', 'index-abc123.js'),
    `// bundle factice\n${'console.log("triptic");\n'.repeat(200)}`,
  );
  app = createApp({ provider: mockProvider, webDist });
});

afterAll(() => {
  fs.rmSync(webDist, { recursive: true, force: true });
});

describe('Service du build web (QA 6.1 / 6.2 / 6.5)', () => {
  it('n’expose pas X-Powered-By', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('sert /assets avec cache long immutable', async () => {
    const res = await request(app).get('/assets/index-abc123.js');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toContain('max-age=31536000');
    expect(res.headers['cache-control']).toContain('immutable');
  });

  it('compresse les assets en gzip quand le client l’accepte', async () => {
    const res = await request(app)
      .get('/assets/index-abc123.js')
      .set('Accept-Encoding', 'gzip');
    expect(res.status).toBe(200);
    expect(res.headers['content-encoding']).toBe('gzip');
  });

  it('sert index.html non caché sur la racine (fallback SPA)', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.text).toContain('<div id="root">');
  });

  it('sert index.html sur une route SPA quelconque', async () => {
    const res = await request(app).get('/explore');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<div id="root">');
  });
});

describe('OG tags par trip sur /trip/:slug (QA 1.8)', () => {
  it('injecte les balises OG du trip (valeurs échappées)', async () => {
    const save = await request(app)
      .post('/api/trips')
      .send({
        title: 'Crêtes "sauvages" <script>alert(1)</script>',
        mode: 'trek',
        is_public: true,
        metadata: {
          summary: 'Trois jours sur les crêtes.',
          duration_days: 3,
          distance_km: 55.4,
          elevation_gain_m: 2100,
        },
        cover_photo: 'https://images.unsplash.com/photo-vosges?w=1080',
        waypoints: WAYPOINTS,
      });
    expect(save.status).toBe(201);

    const res = await request(app).get(`/trip/${save.body.slug}`);
    expect(res.status).toBe(200);
    // Titre présent et échappé — jamais de <script> issu du titre dans le HTML
    expect(res.text).toContain(
      'property="og:title" content="Crêtes &quot;sauvages&quot; &lt;script&gt;alert(1)&lt;/script&gt;"',
    );
    expect(res.text).not.toContain('<script>alert(1)</script>');
    // Description : résumé + métadonnées
    expect(res.text).toContain('Trois jours sur les crêtes. — 3 jours · 55 km · 2100 m D+');
    // Image, url, type, twitter card
    expect(res.text).toContain(
      'property="og:image" content="https://images.unsplash.com/photo-vosges?w=1080"',
    );
    expect(res.text).toContain(`content="http://localhost:5173/trip/${save.body.slug}"`);
    expect(res.text).toContain('property="og:type" content="website"');
    expect(res.text).toContain('name="twitter:card" content="summary_large_image"');
    // Les balises sont bien dans le <head>
    expect(res.text.indexOf('og:title')).toBeLessThan(res.text.indexOf('</head>'));
  });

  it('slug inconnu → index brut sans balise OG', async () => {
    const res = await request(app).get('/trip/slug-inconnu-000000');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('og:title');
    expect(res.text).toContain('<div id="root">');
  });

  it('slug mal encodé → index brut (pas de 500)', async () => {
    const res = await request(app).get('/trip/%E0%A4%A');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('og:title');
  });
});

describe('escapeHtml', () => {
  it('échappe &, <, >, " et apostrophe', () => {
    expect(escapeHtml(`Tom & "l'ami" <b>`)).toBe(
      'Tom &amp; &quot;l&#39;ami&quot; &lt;b&gt;',
    );
  });
});
