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
    submitUserPlace: vi.fn(async () => 'pending' as const),
    addReview: vi.fn(async () => true),
    ...overrides,
  };
  const app = express();
  app.use(express.json());
  app.use(authMiddleware);
  app.use('/api/places', createPlacesRouter(api));
  return { app, api };
}

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
