import { describe, expect, it } from 'vitest';
import type { TripProposal, TripRequest } from '@triptic/shared';
import { applyTripEstimates } from '../services/budget.js';
import { estimateDrive, roundCo2 } from '../services/co2.js';
import { countryForPoint, getFuelPrice } from '../services/fuelPrices.js';

const REQUEST: TripRequest = {
  departure: 'Colmar',
  duration_days: 3,
  modes: ['roadtrip'],
  difficulty: 'medium',
  group_type: 'couple',
  vehicle: 'van',
  avoid_crowds: false,
  camping: true,
  budget: 'low',
  physical_level: 3,
  constraints: [],
  style: [],
};

function tripWithSegments(): TripProposal {
  return {
    title: 'Vosges',
    mode: 'roadtrip',
    duration_days: 3,
    distance_km: 300,
    elevation_gain_m: 2000,
    difficulty: 'medium',
    ambiance: 'sauvage',
    summary: '…',
    daily_distance_km: 100,
    waypoints: [
      { name: 'Colmar', lat: 48.0794, lng: 7.3585, day: 1, kind: 'start' },
      { name: 'Grand Ballon', lat: 47.9014, lng: 7.0994, day: 3, kind: 'end' },
    ],
    days: [
      {
        day: 1,
        title: 'J1',
        activities: [
          { type: 'drive', time_of_day: 'morning', title: 'Colmar', lat: 48.0794, lng: 7.3585 },
          {
            type: 'visit',
            time_of_day: 'afternoon',
            title: 'Château',
            lat: 48.2494,
            lng: 7.3444,
            cost_estimate: 12,
          },
          {
            type: 'camp',
            time_of_day: 'evening',
            title: 'Camping',
            lat: 48.06,
            lng: 7.02,
            cost_estimate: 24,
          },
        ],
        segments: [
          {
            distance_km: 100,
            duration_min: 90,
            mode: 'car',
            routed: true,
            geometry: [
              [7.3585, 48.0794],
              [7.02, 48.06],
            ],
          },
          { distance_km: 100, duration_min: 90, mode: 'car', routed: true },
        ],
      },
    ],
    photo_keywords: ['vosges'],
  };
}

describe('applyTripEstimates (CO₂ 1.2 + budget 1.3)', () => {
  it('calcule carburant/CO₂ depuis les segments voiture et pose le budget itemisé', () => {
    const trip = tripWithSegments();
    applyTripEstimates(trip, REQUEST);

    // 200 km van (9,5 L/100) = 19 L diesel → ~51 kg CO₂e, arrondi honnête
    expect(trip.co2_kg).toBe(roundCo2(19 * 2.68));
    const budget = trip.budget!;
    // 19 L × ~1,72 €/L (FR) ≈ 33 €
    expect(budget.fuel_eur).toBeGreaterThan(25);
    expect(budget.fuel_eur).toBeLessThan(45);
    // Nuit connue 24 € + 1 nuit inconnue camping [0-35]
    expect(budget.nights_eur[0]).toBe(25);
    expect(budget.nights_eur[1]).toBe(60);
    // Repas : 3 j × 2 pers × [15-30]
    expect(budget.meals_eur).toEqual([90, 180]);
    expect(budget.activities_eur).toBe(12);
    expect(budget.total_eur[0]).toBeLessThan(budget.total_eur[1]);
    // Segments annotés
    expect(trip.days?.[0]?.segments?.[0]?.co2_kg).toBeGreaterThan(0);
    expect(trip.days?.[0]?.segments?.[0]?.fuel_cost).toBeGreaterThan(0);
  });

  it('retombe sur la distance totale du trip sans segments (anciens trips)', () => {
    const trip = tripWithSegments();
    delete (trip as { days?: unknown }).days;
    applyTripEstimates(trip, REQUEST);
    expect(trip.co2_kg).toBeGreaterThan(0); // 300 km van
    expect(trip.budget?.fuel_eur).toBeGreaterThan(0);
  });

  it('trek sans voiture : CO₂ nul, pas de carburant ni péages', () => {
    const trip = tripWithSegments();
    trip.mode = 'trek';
    for (const day of trip.days ?? []) {
      day.segments = day.segments?.map((s) => ({ ...s, mode: 'foot' as const }));
    }
    applyTripEstimates(trip, { ...REQUEST, vehicle: 'none' });
    expect(trip.co2_kg).toBe(0);
    expect(trip.budget?.fuel_eur).toBe(0);
    expect(trip.budget?.tolls_eur).toEqual([0, 0]);
  });
});

describe('co2 (facteurs ADEME)', () => {
  it('estime litres et CO₂e well-to-wheel', () => {
    const { litres, co2_kg } = estimateDrive(100, 'car');
    expect(litres).toBe(7);
    expect(co2_kg).toBeCloseTo(7 * 2.31);
  });

  it('arrondit à 2 chiffres significatifs max (jamais de fausse précision)', () => {
    expect(roundCo2(48.37)).toBe(48);
    expect(roundCo2(127.9)).toBe(130);
    expect(roundCo2(1342)).toBe(1300);
    expect(roundCo2(0)).toBe(0);
  });
});

describe('fuelPrices', () => {
  it('détecte le pays des points pilotes (frontières assumées imprécises)', () => {
    expect(countryForPoint(48.08, 7.36)).toBe('FR'); // Colmar
    expect(countryForPoint(48.58, 7.75)).toBe('FR'); // Strasbourg (pas DE !)
    expect(countryForPoint(46.02, 7.75)).toBe('CH'); // Zermatt
    expect(countryForPoint(45.07, 7.68)).toBe('IT'); // Turin
    expect(countryForPoint(45.92, 6.87)).toBe('FR'); // Chamonix (pas CH !)
    expect(countryForPoint(48.14, 11.58)).toBe('DE'); // Munich
  });

  it('lit les prix par défaut et respecte les overrides env', () => {
    expect(getFuelPrice('FR', 'diesel')).toBeGreaterThan(1);
    process.env['FUEL_PRICE_FR_DIESEL'] = '2.05';
    expect(getFuelPrice('FR', 'diesel')).toBe(2.05);
    delete process.env['FUEL_PRICE_FR_DIESEL'];
  });
});
