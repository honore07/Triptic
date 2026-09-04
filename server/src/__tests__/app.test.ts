import { describe, expect, it } from 'vitest';
import request from 'supertest';
import type { LlmProvider } from '@triptic/ai-engine';
import { createApp } from '../app.js';

const TRIPS_OUTPUT = {
  type: 'trips',
  request: {
    departure: 'Colmar',
    destination: 'Vosges',
    duration_days: 3,
    modes: ['trek'],
    difficulty: 'medium',
    group_type: 'solo',
    vehicle: 'van',
    avoid_crowds: true,
    camping: true,
    budget: 'low',
    physical_level: 3,
    constraints: [],
    style: ['sauvage'],
  },
  trips: [1, 2, 3].map((n) => ({
    title: `Trip ${n}`,
    mode: 'trek',
    duration_days: 3,
    distance_km: 55,
    elevation_gain_m: 2100,
    difficulty: 'medium',
    ambiance: 'sauvage',
    summary: 'Trois jours sur les crêtes.',
    daily_distance_km: 18,
    waypoints: [
      { name: 'Col de la Schlucht', lat: 48.0631, lng: 7.0209, day: 1, kind: 'start' },
      { name: 'Grand Ballon', lat: 47.9014, lng: 7.0994, day: 3, kind: 'end' },
    ],
    photo_keywords: ['vosges', 'trek'],
  })),
  differentiator: 'La durée varie.',
};

const mockProvider: LlmProvider = {
  name: 'mock',
  complete: async () => JSON.stringify(TRIPS_OUTPUT),
  correct: async () => '{"valid": true, "issues": []}',
};

const EDIT_DAYS = [
  {
    day: 1,
    title: 'Crêtes',
    activities: [
      { type: 'hike', time_of_day: 'morning', title: 'Hohneck', lat: 48.04, lng: 7.01 },
      { type: 'camp', time_of_day: 'evening', title: 'Refuge', lat: 48.02, lng: 7.03 },
    ],
  },
];

describe('POST /api/trips/recompute (3.1 — recalcul live)', () => {
  it('recalcule totaux, segments, budget et CO₂ depuis days[]', async () => {
    const app = createApp({ provider: mockProvider });
    const res = await request(app)
      .post('/api/trips/recompute')
      .send({ mode: 'roadtrip', duration_days: 1, days: EDIT_DAYS, request: { vehicle: 'van' } });
    expect(res.status).toBe(200);
    expect(res.body.waypoints).toHaveLength(2);
    expect(res.body.distance_km).toBeGreaterThan(0); // estimation fallback sans GraphHopper
    expect(res.body.days[0].segments).toHaveLength(1);
    expect(res.body.budget.total_eur[1]).toBeGreaterThan(0);
  });

  it('rejette un body invalide', async () => {
    const app = createApp({ provider: mockProvider });
    const res = await request(app).post('/api/trips/recompute').send({ mode: 'roadtrip' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/ai/edit-trip (3.2 — édition conversationnelle)', () => {
  it('modifie le trip et renvoie un event trip recalculé', async () => {
    const editProvider: LlmProvider = {
      name: 'mock',
      complete: async () => JSON.stringify({ type: 'edit', days: EDIT_DAYS }),
      correct: async () => '{"valid": true, "issues": []}',
    };
    const app = createApp({ provider: editProvider });
    const res = await request(app).post('/api/ai/edit-trip').send({
      title: 'Crêtes des Vosges',
      mode: 'trek',
      duration_days: 1,
      days: EDIT_DAYS,
      instruction: 'passe la rando du matin à 20 km',
    });
    expect(res.status).toBe(200);
    expect(res.text).toContain('event: trip');
    expect(res.text).toContain('"validated":true');
    expect(res.text).toContain('event: done');
  });
});

describe('POST /api/trips/weather (météo + alertes, Aventurier+)', () => {
  it('402 pour le plan gratuit (weather_integration)', async () => {
    const app = createApp({ provider: mockProvider });
    const res = await request(app)
      .post('/api/trips/weather')
      .send({ start_date: '2026-08-01', days: EDIT_DAYS });
    expect(res.status).toBe(402);
    expect(res.body.feature).toBe('weather_integration');
  });

  it('répond par jour (hors horizon → forecast null, out_of_range)', async () => {
    const app = createApp({ provider: mockProvider });
    const res = await request(app)
      .post('/api/trips/weather')
      .set('x-plan', 'aventurier')
      .send({ start_date: '2030-01-01', days: EDIT_DAYS });
    expect(res.status).toBe(200);
    expect(res.body.horizon_days).toBe(16);
    expect(res.body.days[0]).toMatchObject({
      day: 1,
      date: '2030-01-01',
      forecast: null,
      alerts: [],
      out_of_range: true,
    });
  });

  it('400 sur date invalide', async () => {
    const app = createApp({ provider: mockProvider });
    const res = await request(app)
      .post('/api/trips/weather')
      .set('x-plan', 'aventurier')
      .send({ start_date: 'demain', days: EDIT_DAYS });
    expect(res.status).toBe(400);
  });
});

describe('TRIPTIC API', () => {
  it('GET /health returns ok', async () => {
    const app = createApp({ provider: mockProvider });
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('POST /api/ai/generate-trips rejects invalid body', async () => {
    const app = createApp({ provider: mockProvider });
    const res = await request(app).post('/api/ai/generate-trips').send({ messages: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_body');
  });

  it('POST /api/ai/generate-trips streams trips via SSE (free plan → 1 trip visible)', async () => {
    const app = createApp({ provider: mockProvider });
    const res = await request(app)
      .post('/api/ai/generate-trips')
      .send({ messages: [{ role: 'user', content: '3 jours de trek dans les Vosges' }], lang: 'fr' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.text).toContain('event: trips');
    const tripsEvent = res.text.split('event: trips\n')[1]?.split('\n')[0] ?? '';
    const payload = JSON.parse(tripsEvent.replace(/^data: /, ''));
    // Plan free : 1 seul trip visible, 2 verrouillés (paywall)
    expect(payload.generation.trips).toHaveLength(1);
    expect(payload.locked_proposals).toBe(2);
  });

  it('POST /api/ai/generate-trips shows 3 trips for plan aventurier', async () => {
    const app = createApp({ provider: mockProvider });
    const res = await request(app)
      .post('/api/ai/generate-trips')
      .set('x-plan', 'aventurier')
      .send({ messages: [{ role: 'user', content: '3 jours de trek dans les Vosges' }], lang: 'fr' });
    const tripsEvent = res.text.split('event: trips\n')[1]?.split('\n')[0] ?? '';
    const payload = JSON.parse(tripsEvent.replace(/^data: /, ''));
    expect(payload.generation.trips).toHaveLength(3);
  });

  it('enforces the free plan quota (3 générations/mois)', async () => {
    const app = createApp({ provider: mockProvider });
    const body = { messages: [{ role: 'user', content: 'trek Vosges 3 jours' }], lang: 'fr' };
    for (let i = 0; i < 3; i += 1) {
      await request(app).post('/api/ai/generate-trips').send(body);
    }
    const res = await request(app).post('/api/ai/generate-trips').send(body);
    expect(res.text).toContain('quota_exceeded');
    // Quatre générations complètes (ancrage, routage, photos) : ~4 s seul,
    // davantage quand toute la suite tourne en parallèle — 5 s ne suffisent pas.
  }, 20_000);

  it('saves a trip then exports GPX only for paid plans', async () => {
    const app = createApp({ provider: mockProvider });
    const save = await request(app)
      .post('/api/trips')
      .send({
        title: 'Crêtes des Vosges',
        mode: 'trek',
        metadata: { distance_km: 55 },
        waypoints: [
          { name: 'Départ', lat: 48.06, lng: 7.02, day: 1, kind: 'start' },
          { name: 'Arrivée', lat: 47.9, lng: 7.1, day: 3, kind: 'end' },
        ],
      });
    expect(save.status).toBe(201);

    const freeGpx = await request(app).get(`/api/trips/${save.body.id}/gpx`);
    expect(freeGpx.status).toBe(402);

    const paidGpx = await request(app)
      .get(`/api/trips/${save.body.id}/gpx`)
      .set('x-plan', 'aventurier');
    expect(paidGpx.status).toBe(200);
    expect(paidGpx.text).toContain('<gpx');
  });

  it('serves public trips by slug without auth', async () => {
    const app = createApp({ provider: mockProvider });
    const save = await request(app)
      .post('/api/trips')
      .send({
        title: 'Trip public',
        mode: 'roadtrip',
        metadata: {},
        is_public: true,
        waypoints: [
          { name: 'A', lat: 48, lng: 7, day: 1, kind: 'start' },
          { name: 'B', lat: 47.9, lng: 7.1, day: 2, kind: 'end' },
        ],
      });
    const res = await request(app).get(`/api/public/trips/${save.body.slug}`);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Trip public');
  });

  it('parse-filters : le dictionnaire répond sans appeler le modèle', async () => {
    let modelCalled = false;
    const filterProvider: LlmProvider = {
      name: 'mock',
      complete: async () => {
        modelCalled = true;
        return '{"kinds": [], "keywords": []}';
      },
      correct: async () => '{"valid": true, "issues": []}',
    };
    const app = createApp({ provider: filterProvider });
    const res = await request(app)
      .post('/api/ai/parse-filters')
      .send({ text: 'on veut se baigner puis manger une tarte flambée' });

    expect(res.status).toBe(200);
    expect(res.body.kinds).toEqual(expect.arrayContaining(['lake', 'restaurant']));
    expect(modelCalled).toBe(false);
  });

  it('parse-filters : repli sur le modèle, avec de quoi répondre', async () => {
    let budget: number | undefined;
    const filterProvider: LlmProvider = {
      name: 'mock',
      complete: async (opts) => {
        budget = opts.maxTokens;
        return '{"kinds": ["viewpoint"], "keywords": []}';
      },
      correct: async () => '{"valid": true, "issues": []}',
    };
    const app = createApp({ provider: filterProvider });
    // Formulation que le dictionnaire ne couvre pas : le modèle prend le relais.
    const res = await request(app)
      .post('/api/ai/parse-filters')
      .send({ text: 'un endroit où souffler loin de tout' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ kinds: ['viewpoint'], keywords: [] });
    // Régression : Deepseek v4 consomme le budget en reasoning_content avant
    // d'écrire. À 300, la réponse revenait vide (finish_reason « length ») et la
    // route renvoyait des filtres vides sans erreur visible.
    expect(budget).toBeGreaterThanOrEqual(4000);
  });
});
