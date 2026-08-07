import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { authMiddleware } from '../middleware/auth.js';
import {
  createPlacesRouter,
  expandBbox,
  isDuplicateLoop,
  isNearTarget,
  type PlacesApi,
} from '../routes/places.js';

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
    findTrailsNear: vi.fn(async () => [
      {
        id: 't1',
        name: 'Tour du Hohneck',
        summary: '12.5 km · 520 m D+',
        notoriety: 50,
        source: 'geotrek-pnr-ballons-vosges',
        distance_km: 12.5,
        geometry: [
          [7.01, 48.04],
          [7.02, 48.05],
        ] as [number, number][],
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

describe('GET /api/places/trails (boucles rando, 5.2)', () => {
  it('renvoie les boucles mappées avec durée Naismith', async () => {
    const { app, api } = makeApp();
    const res = await request(app).get(
      '/api/places/trails?lat=48.04&lng=7.01&target_km=12',
    );
    expect(res.status).toBe(200);
    expect(res.body.trails[0]).toMatchObject({
      name: 'Tour du Hohneck',
      distance_km: 12.5,
      generated: false,
    });
    expect(res.body.trails[0].duration_min).toBe(Math.round((12.5 / 4.5) * 60));
    expect(api.findTrailsNear).toHaveBeenCalledWith(48.04, 7.01, 10000, 12, 10);
  });

  it('400 sur une cible aberrante', async () => {
    const { app } = makeApp();
    const res = await request(app).get('/api/places/trails?lat=48&lng=7&target_km=500');
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

/**
 * Dev local sans DATABASE_URL : le routeur est monté quand même (il l'était
 * conditionnellement avant, ce qui faisait tomber toutes ces routes en 404
 * HTML — l'UI affichait alors « l'envoi a échoué » sur un formulaire pourtant
 * valide, et Explore ne générait rien).
 */
describe('sans base de données (repo absent)', () => {
  function makeAppNoDb(routing?: { enabled: boolean; roundTrip: unknown }): express.Express {
    const app = express();
    app.use(express.json());
    app.use(authMiddleware);
    app.use(
      '/api/places',
      createPlacesRouter(undefined, routing as never),
    );
    return app;
  }

  it('POST /api/places répond 503 db_unavailable, PAS 404 ni 400', async () => {
    const res = await request(makeAppNoDb())
      .post('/api/places')
      .send({ name: 'Cascade du Nideck', kind: 'viewpoint', lat: 48.5, lng: 7.3 });
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('db_unavailable');
  });

  it('POST /api/places garde le 400 sur payload invalide (validation avant base)', async () => {
    const res = await request(makeAppNoDb())
      .post('/api/places')
      .send({ name: 'X', kind: 'pas-un-kind', lat: 999, lng: 7.3 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_body');
  });

  it('bbox / nearby / stats répondent 503 db_unavailable', async () => {
    const app = makeAppNoDb();
    for (const url of [
      '/api/places/bbox?south=47.9&west=6.9&north=48.1&east=7.2',
      '/api/places/nearby?lat=48.05&lng=7.02',
      '/api/places/stats',
    ]) {
      const res = await request(app).get(url);
      expect(res.status, url).toBe(503);
      expect(res.body.error, url).toBe('db_unavailable');
    }
  });

  it('trails GÉNÈRE une boucle via GraphHopper — le mode journée marche sans base', async () => {
    const roundTrip = vi.fn(async () => ({
      geometry: [
        [7.3, 48.1],
        [7.31, 48.11],
      ] as [number, number][],
      distance_km: 9.8,
      duration_min: 136,
      elevation_gain_m: 393,
    }));
    const res = await request(makeAppNoDb({ enabled: true, roundTrip })).get(
      '/api/places/trails?lat=48.1&lng=7.3&target_km=12',
    );
    expect(res.status).toBe(200);
    expect(res.body.trails).toHaveLength(1);
    expect(res.body.trails[0].generated).toBe(true);
    expect(res.body.trails[0].distance_km).toBe(9.8);
    expect(roundTrip).toHaveBeenCalled();
  });

  it('trails sans base NI routeur : 503 explicite, pas une liste vide trompeuse', async () => {
    const res = await request(makeAppNoDb({ enabled: false, roundTrip: vi.fn() })).get(
      '/api/places/trails?lat=48.1&lng=7.3',
    );
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('db_unavailable');
  });
});

/**
 * Explore doit proposer une dizaine de pistes minimum (demande Jules 07/08) :
 * en dessous, l'utilisateur croit la zone vide. Deux leviers — compléter les
 * boucles rando par génération, élargir une bbox trop pauvre.
 */
describe('minimum de propositions sur Explore', () => {
  it('expandBbox agrandit autour du centre et reste dans les bornes', () => {
    const base = { south: 48.0, west: 7.0, north: 48.06, east: 7.08 };
    const wide = expandBbox(base, 3);
    // même centre
    expect((wide.south + wide.north) / 2).toBeCloseTo((base.south + base.north) / 2, 6);
    expect((wide.west + wide.east) / 2).toBeCloseTo((base.west + base.east) / 2, 6);
    // 3× plus haut et plus large
    expect(wide.north - wide.south).toBeCloseTo((base.north - base.south) * 3, 6);
    expect(wide.east - wide.west).toBeCloseTo((base.east - base.west) * 3, 6);
  });

  it('expandBbox borne aux limites géographiques (PostGIS refuse au-delà)', () => {
    const wide = expandBbox({ south: -89, west: -179, north: 89, east: 179 }, 10);
    expect(wide.south).toBeGreaterThanOrEqual(-90);
    expect(wide.north).toBeLessThanOrEqual(90);
    expect(wide.west).toBeGreaterThanOrEqual(-180);
    expect(wide.east).toBeLessThanOrEqual(180);
  });

  it('isDuplicateLoop écarte deux boucles générées quasi identiques', () => {
    const existing = [
      { distance_km: 12.1, elevation_gain_m: 956, generated: true },
      { distance_km: 18.0, elevation_gain_m: 1300, generated: true },
    ];
    // même distance ET même dénivelé → doublon
    expect(isDuplicateLoop({ distance_km: 12.2, elevation_gain_m: 950 }, existing)).toBe(true);
    // distance proche mais dénivelé très différent → randos distinctes
    expect(isDuplicateLoop({ distance_km: 12.2, elevation_gain_m: 400 }, existing)).toBe(false);
    // rien de proche
    expect(isDuplicateLoop({ distance_km: 30, elevation_gain_m: 100 }, existing)).toBe(false);
  });

  it('ne déduplique jamais une boucle MAPPÉE (vraie rando balisée)', () => {
    const mapped = [{ distance_km: 12.1, elevation_gain_m: 956, generated: false }];
    expect(isDuplicateLoop({ distance_km: 12.1, elevation_gain_m: 956 }, mapped)).toBe(false);
  });

  it('trails complète jusqu’à 10 propositions avec des boucles générées', async () => {
    let seedSeen = 0;
    const routing = {
      enabled: true,
      // chaque graine renvoie une boucle distincte (distance qui varie)
      roundTrip: vi.fn(async (_from: unknown, _km: number, _mode: string, seed: number) => {
        seedSeen = Math.max(seedSeen, seed);
        return {
          geometry: [
            [7.1, 48.05],
            [7.11, 48.06],
          ] as [number, number][],
          distance_km: 10 + seed,
          duration_min: 120 + seed,
          elevation_gain_m: 500 + seed * 40,
        };
      }),
    };
    const app = express();
    app.use(express.json());
    app.use(authMiddleware);
    // repo qui ne connaît AUCUNE boucle mappée dans la zone
    app.use(
      '/api/places',
      createPlacesRouter(
        { ...makeApp().api, findTrailsNear: vi.fn(async () => []) },
        routing as never,
      ),
    );
    const res = await request(app).get('/api/places/trails?lat=48.05&lng=7.1&target_km=12');
    expect(res.status).toBe(200);
    expect(res.body.trails).toHaveLength(10);
    expect(res.body.trails.every((t: { generated: boolean }) => t.generated)).toBe(true);
    // les graines varient : sinon toutes les boucles seraient identiques
    expect(seedSeen).toBeGreaterThan(0);
  });

  it('trails garde les boucles mappées et complète le reste', async () => {
    const routing = {
      enabled: true,
      // distances proches de la cible par défaut (12 km) : sinon le filtre de
      // pertinence les écarte, à raison — cf. « pertinence des boucles ».
      roundTrip: vi.fn(async (_f: unknown, _k: number, _m: string, seed: number) => ({
        geometry: [[7.1, 48.05]] as [number, number][],
        distance_km: 10 + seed * 0.5,
        duration_min: 200,
        elevation_gain_m: 800 + seed * 50,
      })),
    };
    const app = express();
    app.use(express.json());
    app.use(authMiddleware);
    app.use('/api/places', createPlacesRouter(makeApp().api, routing as never));
    const res = await request(app).get('/api/places/trails?lat=48.05&lng=7.1');
    expect(res.status).toBe(200);
    expect(res.body.trails).toHaveLength(10);
    // la vraie boucle balisée reste en tête
    expect(res.body.trails[0].generated).toBe(false);
    expect(res.body.trails[0].name).toBe('Tour du Hohneck');
  });
});

/**
 * Qualité des boucles générées (07/08) : GraphHopper round_trip dérive selon
 * la graine — pour 20 km demandés il proposait 47 km / 4 082 m D+ / 13 h.
 * Inutilisable pour une sortie à la journée.
 */
describe('pertinence des boucles générées', () => {
  it('isNearTarget écarte les distances hors sujet', () => {
    expect(isNearTarget(20, 20)).toBe(true);
    expect(isNearTarget(28, 20)).toBe(true); // un peu plus long : acceptable
    expect(isNearTarget(47, 20)).toBe(false); // 13 h de marche pour 20 km demandés
    expect(isNearTarget(4, 20)).toBe(false); // beaucoup trop court
  });

  it('trails ne propose que des boucles proches de la cible, les plus justes d’abord', async () => {
    // distances renvoyées volontairement dispersées, dont des aberrations
    const byDistance = [45, 21, 60, 19, 25, 8, 22, 50, 20, 23, 40, 24];
    const routing = {
      enabled: true,
      roundTrip: vi.fn(async (_f: unknown, _km: number, _m: string, seed: number) => {
        const km = byDistance[seed % byDistance.length]!;
        return {
          geometry: [[7.1, 48.05]] as [number, number][],
          distance_km: km,
          duration_min: km * 15,
          elevation_gain_m: km * 80,
        };
      }),
    };
    const app = express();
    app.use(express.json());
    app.use(authMiddleware);
    app.use(
      '/api/places',
      createPlacesRouter(
        { ...makeApp().api, findTrailsNear: vi.fn(async () => []) },
        routing as never,
      ),
    );
    const res = await request(app).get('/api/places/trails?lat=48.05&lng=7.1&target_km=20');
    expect(res.status).toBe(200);
    const distances = res.body.trails.map((t: { distance_km: number }) => t.distance_km);
    // aucune aberration : 20 km demandés -> rien au-delà de 32 ni sous 11
    expect(distances.every((d: number) => d >= 11 && d <= 32)).toBe(true);
    // classées de la plus proche de la cible à la plus éloignée
    const ecarts = distances.map((d: number) => Math.abs(d - 20));
    expect([...ecarts].sort((a, b) => a - b)).toEqual(ecarts);
  });

  it('503 explicite si le routeur est configuré mais injoignable', async () => {
    // enabled=true (URL configurée) mais chaque appel échoue → null
    const routing = { enabled: true, roundTrip: vi.fn(async () => null) };
    const app = express();
    app.use(express.json());
    app.use(authMiddleware);
    app.use(
      '/api/places',
      createPlacesRouter(
        { ...makeApp().api, findTrailsNear: vi.fn(async () => []) },
        routing as never,
      ),
    );
    const res = await request(app).get('/api/places/trails?lat=48.05&lng=7.1');
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('routing_unavailable');
  });

  it('une base injoignable ne casse pas la génération de boucles', async () => {
    const routing = {
      enabled: true,
      roundTrip: vi.fn(async (_f: unknown, _k: number, _m: string, seed: number) => ({
        geometry: [[7.1, 48.05]] as [number, number][],
        distance_km: 12 + (seed % 3),
        duration_min: 180,
        elevation_gain_m: 600 + seed * 40,
      })),
    };
    const app = express();
    app.use(express.json());
    app.use(authMiddleware);
    app.use(
      '/api/places',
      createPlacesRouter(
        {
          ...makeApp().api,
          findTrailsNear: vi.fn(async () => {
            throw new Error('connection refused');
          }),
        },
        routing as never,
      ),
    );
    const res = await request(app).get('/api/places/trails?lat=48.05&lng=7.1&target_km=12');
    expect(res.status).toBe(200);
    expect(res.body.trails.length).toBeGreaterThan(0);
  });
});
