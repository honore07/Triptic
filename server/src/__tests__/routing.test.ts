import { describe, expect, it, vi } from 'vitest';
import { RoutingService } from '../services/routing.js';

const GH_RESPONSE = {
  paths: [
    {
      distance: 42500, // m
      time: 3_600_000, // ms
      ascend: 850.6,
      points: {
        coordinates: [
          [7.0209, 48.0631, 1139],
          [7.0086, 48.0403, 1363],
        ],
      },
    },
  ],
};

const POINTS = [
  { lat: 48.0631, lng: 7.0209 },
  { lat: 48.0403, lng: 7.0086 },
];

function okFetch(body: unknown = GH_RESPONSE) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
}

describe('RoutingService', () => {
  it('est désactivé sans GRAPHHOPPER_URL (fallback estimation LLM)', async () => {
    const fetchMock = okFetch();
    const service = new RoutingService(null, fetchMock as unknown as typeof fetch);
    expect(service.enabled).toBe(false);
    expect(await service.route(POINTS, 'car')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('route et convertit les unités (m→km, ms→min, géométrie lng/lat)', async () => {
    const fetchMock = okFetch();
    const service = new RoutingService('http://localhost:8989', fetchMock as unknown as typeof fetch);
    const leg = await service.route(POINTS, 'foot');
    expect(leg).toEqual({
      geometry: [
        [7.0209, 48.0631],
        [7.0086, 48.0403],
      ],
      distance_km: 42.5,
      duration_min: 60,
      elevation_gain_m: 851,
    });
    const request = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    expect(request[0]).toBe('http://localhost:8989/route');
    const body = JSON.parse(request[1].body) as { profile: string; points: number[][] };
    expect(body.profile).toBe('foot');
    expect(body.points[0]).toEqual([7.0209, 48.0631]); // ordre lng, lat
  });

  it('mappe car → profil car_scenic (belles routes)', async () => {
    const fetchMock = okFetch();
    const service = new RoutingService('http://localhost:8989', fetchMock as unknown as typeof fetch);
    await service.route(POINTS, 'car');
    const request = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    expect((JSON.parse(request[1].body) as { profile: string }).profile).toBe('car_scenic');
  });

  it('retourne null sur erreur HTTP ou réseau (jamais de throw)', async () => {
    const httpError = vi.fn(async () => new Response('boom', { status: 500 }));
    const network = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const s1 = new RoutingService('http://localhost:8989', httpError as unknown as typeof fetch);
    const s2 = new RoutingService('http://localhost:8989', network as unknown as typeof fetch);
    expect(await s1.route(POINTS, 'bike')).toBeNull();
    expect(await s2.route(POINTS, 'bike')).toBeNull();
  });

  it('met en cache les requêtes identiques (un seul appel réseau)', async () => {
    const fetchMock = okFetch();
    const service = new RoutingService('http://localhost:8989', fetchMock as unknown as typeof fetch);
    await service.route(POINTS, 'car');
    await service.route(POINTS, 'car');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Mode différent = entrée de cache différente
    await service.route(POINTS, 'foot');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
