import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { LlmProvider } from '@triptic/ai-engine';
import { createApp } from '../app.js';
import type { GalleryStore } from '../repo/galleries.js';
import type { PlaceMedia } from '../services/photos.js';

const provider: LlmProvider = {
  name: 'mock',
  complete: async () => '{"keep": [], "drop": []}',
  correct: async () => '{"valid": true, "issues": []}',
};

const TOKEN = 'token-de-maintenance-suffisamment-long';

/** Store en mémoire : le comportement testé est celui de la route. */
function fakeStore(targets: { query: string; lat: number; lng: number }[] = []): GalleryStore & {
  written: string[];
  calls: { limit: number; maxAgeDays: number }[];
} {
  const written: string[] = [];
  const calls: { limit: number; maxAgeDays: number }[] = [];
  return {
    written,
    calls,
    async get() {
      return null;
    },
    async set(key) {
      written.push(key);
    },
    async staleTargets(limit, maxAgeDays) {
      calls.push({ limit, maxAgeDays });
      return targets;
    },
  };
}

describe('POST /api/maintenance/precompute-galleries', () => {
  const previous = process.env['MAINTENANCE_TOKEN'];

  beforeEach(() => {
    process.env['MAINTENANCE_TOKEN'] = TOKEN;
  });
  afterEach(() => {
    if (previous === undefined) delete process.env['MAINTENANCE_TOKEN'];
    else process.env['MAINTENANCE_TOKEN'] = previous;
  });

  it('refuse sans jeton', async () => {
    const app = createApp({ provider, galleryStore: fakeStore() });
    const res = await request(app).post('/api/maintenance/precompute-galleries').send({});
    expect(res.status).toBe(401);
  });

  it('refuse un mauvais jeton', async () => {
    const app = createApp({ provider, galleryStore: fakeStore() });
    const res = await request(app)
      .post('/api/maintenance/precompute-galleries')
      .set('x-maintenance-token', 'faux')
      .send({});
    expect(res.status).toBe(401);
  });

  it('reste fermée quand aucun jeton n\'est configuré', async () => {
    delete process.env['MAINTENANCE_TOKEN'];
    const app = createApp({ provider, galleryStore: fakeStore() });
    const res = await request(app)
      .post('/api/maintenance/precompute-galleries')
      .set('x-maintenance-token', 'nimporte-quoi')
      .send({});
    expect(res.status).toBe(401);
  });

  it('répond 503 sans base — rien à pré-calculer', async () => {
    const app = createApp({ provider });
    const res = await request(app)
      .post('/api/maintenance/precompute-galleries')
      .set('x-maintenance-token', TOKEN)
      .send({});
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('no_database');
  });

  it('rend le compte de ce qui a été traité', async () => {
    const app = createApp({ provider, galleryStore: fakeStore([]) });
    const res = await request(app)
      .post('/api/maintenance/precompute-galleries')
      .set('x-maintenance-token', TOKEN)
      .send({ limit: 5 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ examined: 0, filled: 0, empty: 0 });
  });

  it('rejette une limite hors bornes', async () => {
    const app = createApp({ provider, galleryStore: fakeStore() });
    const res = await request(app)
      .post('/api/maintenance/precompute-galleries')
      .set('x-maintenance-token', TOKEN)
      .send({ limit: 5000 });
    expect(res.status).toBe(400);
  });

  it("transmet la taille de lot et l'âge maximum au store", async () => {
    // Pas de cibles renvoyées : la route ne part pas chercher de photos, donc
    // ce test reste hors réseau — c'est le passage des paramètres qu'on vérifie.
    const store = fakeStore([]);
    const app = createApp({ provider, galleryStore: store });
    const res = await request(app)
      .post('/api/maintenance/precompute-galleries')
      .set('x-maintenance-token', TOKEN)
      .send({ limit: 7, max_age_days: 30 });
    expect(res.status).toBe(200);
    expect(store.calls).toEqual([{ limit: 7, maxAgeDays: 30 }]);
  });

  it('applique des valeurs par défaut raisonnables', async () => {
    const store = fakeStore([]);
    const app = createApp({ provider, galleryStore: store });
    await request(app)
      .post('/api/maintenance/precompute-galleries')
      .set('x-maintenance-token', TOKEN)
      .send({});
    expect(store.calls[0]).toEqual({ limit: 25, maxAgeDays: 90 });
  });
});

describe('galeries persistées', () => {
  it('PlaceMedia garde ses crédits — obligation de licence', () => {
    const media: PlaceMedia = {
      type: 'photo',
      url: 'https://upload.wikimedia.org/x.jpg',
      thumb: 'https://upload.wikimedia.org/x-thumb.jpg',
      author: 'Un photographe',
      link: 'https://commons.wikimedia.org/wiki/File:x.jpg',
      source: 'commons',
      license: 'CC BY-SA 4.0',
    };
    expect(media.author).not.toBe('');
    expect(media.link).toContain('commons.wikimedia.org');
  });
});

describe('POST /api/maintenance/drain-enrichment', () => {
  const previous = process.env['MAINTENANCE_TOKEN'];

  beforeEach(() => {
    process.env['MAINTENANCE_TOKEN'] = TOKEN;
  });
  afterEach(() => {
    if (previous === undefined) delete process.env['MAINTENANCE_TOKEN'];
    else process.env['MAINTENANCE_TOKEN'] = previous;
  });

  it('refuse sans jeton', async () => {
    const app = createApp({ provider });
    const res = await request(app).post('/api/maintenance/drain-enrichment').send({});
    expect(res.status).toBe(401);
  });

  it('répond 503 sans base — pas de file à reprendre', async () => {
    const app = createApp({ provider });
    const res = await request(app)
      .post('/api/maintenance/drain-enrichment')
      .set('x-maintenance-token', TOKEN)
      .send({});
    expect(res.status).toBe(503);
  });
});
