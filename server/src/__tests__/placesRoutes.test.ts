import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { authMiddleware } from '../middleware/auth.js';
import { createPlacesRouter, type PlacesApi } from '../routes/places.js';

function makeApp(overrides: Partial<PlacesApi> = {}): {
  app: express.Express;
  api: PlacesApi;
} {
  const api: PlacesApi = {
    findNearby: vi.fn(async () => [
      {
        id: 'p1',
        name: 'Le Hohneck',
        kind: 'peak' as const,
        lat: 48.04,
        lng: 7.01,
        notoriety: 75,
      },
    ]),
    findInBbox: vi.fn(async () => [
      {
        id: 'p2',
        name: 'Ferme-auberge du Kastelberg',
        kind: 'restaurant' as const,
        lat: 48.02,
        lng: 7.03,
        notoriety: 40,
      },
    ]),
    submitUserPlace: vi.fn(async () => 'pending' as const),
    addReview: vi.fn(async () => true),
    statsSummary: vi.fn(async () => ({
      total: 114,
      pending: 2,
      by_region: [{ region: 'alpes-it', count: 73 }],
      by_source: [{ source: 'wikidata', count: 113 }],
    })),
    ...overrides,
  };
  const app = express();
  app.use(express.json());
  app.use(authMiddleware);
  app.use('/api/places', createPlacesRouter(api));
  return { app, api };
}

describe('GET /api/places/stats', () => {
  it('expose la santé de la base pour le monitoring n8n', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/places/stats');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(114);
    expect(res.body.pending).toBe(2);
    expect(res.body.by_source[0].source).toBe('wikidata');
  });
});

describe('GET /api/places/nearby', () => {
  it('retourne les lieux actifs autour du point', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/places/nearby?lat=48.05&lng=7.02');
    expect(res.status).toBe(200);
    expect(res.body.places).toHaveLength(1);
    expect(res.body.places[0].name).toBe('Le Hohneck');
  });

  it('400 sur coordonnées invalides', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/places/nearby?lat=999&lng=7');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/places/bbox (search this area, 4.1/4.2)', () => {
  it('retourne les lieux de la zone visible avec filtre de kinds', async () => {
    const { app, api } = makeApp();
    const res = await request(app).get(
      '/api/places/bbox?south=47.9&west=6.9&north=48.1&east=7.2&kinds=restaurant,cafe',
    );
    expect(res.status).toBe(200);
    expect(res.body.places[0].name).toBe('Ferme-auberge du Kastelberg');
    expect(api.findInBbox).toHaveBeenCalledWith(
      { south: 47.9, west: 6.9, north: 48.1, east: 7.2 },
      ['restaurant', 'cafe'],
      50,
    );
  });

  it('400 sur bbox incohérente (sud ≥ nord)', async () => {
    const { app } = makeApp();
    const res = await request(app).get(
      '/api/places/bbox?south=48.1&west=6.9&north=47.9&east=7.2',
    );
    expect(res.status).toBe(400);
  });

  it('400 sur kind inconnu', async () => {
    const { app } = makeApp();
    const res = await request(app).get(
      '/api/places/bbox?south=47.9&west=6.9&north=48.1&east=7.2&kinds=pizzeria',
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /api/places', () => {
  it('accepte une proposition valide → statut pending', async () => {
    const { app, api } = makeApp();
    const res = await request(app).post('/api/places').send({
      name: 'Cascade secrète du Frankenthal',
      kind: 'waterfall',
      lat: 48.05,
      lng: 7.01,
      summary: 'Petite cascade cachée sous le Hohneck',
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending');
    expect(api.submitUserPlace).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Cascade secrète du Frankenthal', userId: null }),
    );
  });

  it('signale la fusion si le lieu existe déjà', async () => {
    const { app } = makeApp({ submitUserPlace: vi.fn(async () => 'merged' as const) });
    const res = await request(app)
      .post('/api/places')
      .send({ name: 'Le Hohneck', kind: 'peak', lat: 48.0403, lng: 7.0086 });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('merged');
  });

  it('400 sur type de lieu inconnu', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post('/api/places')
      .send({ name: 'X', kind: 'discotheque', lat: 48, lng: 7 });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/places/:id/reviews', () => {
  it('enregistre un avis 1-5', async () => {
    const { app, api } = makeApp();
    const res = await request(app)
      .post('/api/places/6f9619ff-8b86-4d01-b42d-00cf4fc964ff/reviews')
      .send({ rating: 5, comment: 'Vue incroyable au lever du soleil' });
    expect(res.status).toBe(201);
    expect(api.addReview).toHaveBeenCalledWith(
      '6f9619ff-8b86-4d01-b42d-00cf4fc964ff',
      null,
      5,
      'Vue incroyable au lever du soleil',
    );
  });

  it('404 si le lieu est inconnu', async () => {
    const { app } = makeApp({ addReview: vi.fn(async () => false) });
    const res = await request(app).post('/api/places/xxx/reviews').send({ rating: 3 });
    expect(res.status).toBe(404);
  });

  it('400 sur note hors bornes', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/api/places/p1/reviews').send({ rating: 6 });
    expect(res.status).toBe(400);
  });
});
