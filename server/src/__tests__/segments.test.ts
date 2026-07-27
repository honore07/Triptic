import { describe, expect, it, vi } from 'vitest';
import type { TripProposal } from '@triptic/shared';
import { enrichTripSegments, haversineKm } from '../services/segments.js';
import type { RoutedLeg, RoutingService } from '../services/routing.js';

function makeTrip(): TripProposal {
  return {
    title: 'Vosges en van',
    mode: 'roadtrip',
    duration_days: 2,
    distance_km: 999, // estimation LLM, doit être remplacée si routing OK
    elevation_gain_m: 9999,
    difficulty: 'medium',
    ambiance: 'sauvage',
    summary: 'Deux jours entre cols et lacs.',
    daily_distance_km: 500,
    waypoints: [
      { name: 'Colmar', lat: 48.0794, lng: 7.3585, day: 1, kind: 'start' },
      { name: 'Grand Ballon', lat: 47.9014, lng: 7.0994, day: 2, kind: 'end' },
    ],
    days: [
      {
        day: 1,
        title: 'Colmar → Schlucht',
        activities: [
          { type: 'drive', time_of_day: 'morning', title: 'Colmar', lat: 48.0794, lng: 7.3585 },
          {
            type: 'hike',
            time_of_day: 'afternoon',
            title: 'Sentier des Roches',
            lat: 48.0631,
            lng: 7.0209,
            distance_km: 10,
            elevation_gain_m: 400,
          },
          { type: 'camp', time_of_day: 'evening', title: 'Camping du Lac', lat: 48.06, lng: 7.02 },
        ],
      },
      {
        day: 2,
        title: 'Grand Ballon',
        activities: [
          { type: 'visit', time_of_day: 'morning', title: 'Grand Ballon', lat: 47.9014, lng: 7.0994 },
        ],
      },
    ],
    photo_keywords: ['vosges'],
  };
}

const LEG: RoutedLeg = {
  geometry: [
    [7.3585, 48.0794],
    [7.0209, 48.0631],
  ],
  distance_km: 40,
  duration_min: 50,
  elevation_gain_m: 600,
};

function mockRouting(leg: RoutedLeg | null): RoutingService {
  return {
    enabled: true,
    route: vi.fn(async () => leg),
  } as unknown as RoutingService;
}

describe('enrichTripSegments', () => {
  it('route les segments entre activités consécutives et recalcule les totaux', async () => {
    const trip = makeTrip();
    const routing = mockRouting(LEG);
    const stats = await enrichTripSegments(trip, routing);

    // Colmar→Sentier, (Sentier→Camping < 50 m ? non ~350m => segment), Camping→Grand Ballon
    expect(stats.segmentCount).toBe(3);
    expect(stats.routedCount).toBe(3);
    expect(trip.days?.[0]?.segments).toHaveLength(2);
    expect(trip.days?.[1]?.segments).toHaveLength(1);
    expect(trip.days?.[0]?.segments?.[0]).toMatchObject({
      mode: 'car',
      routed: true,
      distance_km: 40,
      geometry: LEG.geometry,
    });
    // Totaux : 3 segments × 40 km + rando 10 km (roadtrip : boucle sur place)
    expect(trip.distance_km).toBe(130);
    expect(trip.elevation_gain_m).toBe(3 * 600 + 400);
    expect(trip.daily_distance_km).toBe(65);
  });

  it('estime en fallback (routed:false) et garde les totaux LLM quand le routeur est down', async () => {
    const trip = makeTrip();
    const routing = mockRouting(null);
    const stats = await enrichTripSegments(trip, routing);

    expect(stats.routedCount).toBe(0);
    expect(stats.segmentCount).toBe(3);
    const segment = trip.days?.[0]?.segments?.[0];
    expect(segment?.routed).toBe(false);
    expect(segment?.distance_km).toBeGreaterThan(20); // ~25 km à vol d'oiseau × 1.3
    expect(segment?.geometry).toBeUndefined();
    // Totaux LLM inchangés (fallback)
    expect(trip.distance_km).toBe(999);
  });

  it('mode trek : segments à pied, pas de double comptage des activités', async () => {
    const trip = makeTrip();
    trip.mode = 'trek';
    const routing = mockRouting(LEG);
    await enrichTripSegments(trip, routing);
    expect(trip.days?.[0]?.segments?.[0]?.mode).toBe('foot');
    expect(trip.distance_km).toBe(120); // 3 × 40, sans la rando (déjà dans les segments)
  });

  it('ne fait rien sans days[] (anciens trips)', async () => {
    const trip = makeTrip();
    delete (trip as { days?: unknown }).days;
    const routing = mockRouting(LEG);
    const stats = await enrichTripSegments(trip, routing);
    expect(stats.segmentCount).toBe(0);
    expect(trip.distance_km).toBe(999);
  });
});

describe('haversineKm', () => {
  it('donne ~25 km entre Colmar et le col de la Schlucht', () => {
    const d = haversineKm({ lat: 48.0794, lng: 7.3585 }, { lat: 48.0631, lng: 7.0209 });
    expect(d).toBeGreaterThan(23);
    expect(d).toBeLessThan(27);
  });
});
