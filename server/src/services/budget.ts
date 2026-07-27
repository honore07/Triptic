/**
 * Budget itemisé + CO₂ d'un trip (roadmap 1.2 + 1.3).
 * Carburant : segments routés × conso véhicule × prix pays (fuelPrices).
 * Nuits/repas : heuristiques par fourchette (jamais de fausse précision),
 * les cost_estimate d'activités du LLM priment quand ils existent.
 * Péages : heuristique « à confirmer sur place » (API dédiée = plus tard).
 */
import type { EurRange, GroupType, TripBudget, TripProposal, TripRequest } from '@triptic/shared';
import { estimateDrive, roundCo2 } from './co2.js';
import { countryForPoint, getFuelPrice } from './fuelPrices.js';
import { FUEL_BY_VEHICLE } from './co2.js';

const PERSONS_BY_GROUP: Record<GroupType, number> = {
  solo: 1,
  couple: 2,
  family: 4,
  group: 4,
};

/** €/nuit : camping/aire (curseur camping actif) vs hébergement en dur. */
const NIGHT_EUR: { camping: EurRange; indoor: EurRange } = {
  camping: [0, 35], // aire 0-15, camping 20-35, bivouac 0
  indoor: [60, 120],
};

/** €/repas/personne (hors pique-nique). */
const MEAL_EUR: EurRange = [15, 30];

/** Heuristique péages : ~0-9 c€/km routier (FR/IT à péage, vignettes ailleurs). */
const TOLL_EUR_PER_KM_MAX = 0.09;

function round5(n: number): number {
  return Math.round(n / 5) * 5;
}

/**
 * Calcule et pose co2_kg + budget sur le trip (mutation, comme les segments).
 * Idempotent : recalculer écrase les estimations précédentes.
 */
export function applyTripEstimates(trip: TripProposal, request: TripRequest): void {
  const days = trip.days ?? [];
  const vehicle = request.vehicle;
  const fallbackPoint = trip.waypoints[0] ?? { lat: 46.5, lng: 6.5 };

  // — Carburant + CO₂ (segments voiture routés ; sinon fallback distance trip)
  let fuelEur = 0;
  let co2Kg = 0;
  let carKm = 0;
  const carSegments = days.flatMap((d) => d.segments ?? []).filter((s) => s.mode === 'car');
  if (carSegments.length > 0) {
    for (const segment of carSegments) {
      const { litres, co2_kg } = estimateDrive(segment.distance_km, vehicle);
      const [lng, lat] = segment.geometry?.[0] ?? [fallbackPoint.lng, fallbackPoint.lat];
      const fuel = FUEL_BY_VEHICLE[!vehicle || vehicle === 'none' ? 'van' : vehicle];
      const cost = litres * getFuelPrice(countryForPoint(lat, lng), fuel);
      segment.fuel_cost = Math.round(cost);
      segment.co2_kg = Math.round(co2_kg * 10) / 10;
      fuelEur += cost;
      co2Kg += co2_kg;
      carKm += segment.distance_km;
    }
  } else if (trip.mode === 'roadtrip') {
    const { litres, co2_kg } = estimateDrive(trip.distance_km, vehicle);
    const fuel = FUEL_BY_VEHICLE[!vehicle || vehicle === 'none' ? 'van' : vehicle];
    fuelEur = litres * getFuelPrice(countryForPoint(fallbackPoint.lat, fallbackPoint.lng), fuel);
    co2Kg = co2_kg;
    carKm = trip.distance_km;
  }

  // — Nuits : cost_estimate des activités camp quand connus, heuristique sinon
  const nights = Math.max(0, trip.duration_days - 1);
  const campActivities = days.flatMap((d) => d.activities).filter((a) => a.type === 'camp');
  const knownNights = campActivities.filter((a) => a.cost_estimate !== undefined);
  const knownNightsEur = knownNights.reduce((sum, a) => sum + (a.cost_estimate ?? 0), 0);
  const unknownNights = Math.max(0, nights - knownNights.length);
  const perNight = request.camping ? NIGHT_EUR.camping : NIGHT_EUR.indoor;
  const nightsEur: EurRange = [
    round5(knownNightsEur + unknownNights * perNight[0]),
    round5(knownNightsEur + unknownNights * perNight[1]),
  ];

  // — Repas
  const persons = PERSONS_BY_GROUP[request.group_type];
  const mealsEur: EurRange = [
    round5(trip.duration_days * persons * MEAL_EUR[0]),
    round5(trip.duration_days * persons * MEAL_EUR[1]),
  ];

  // — Activités payantes (hors nuits)
  const activitiesEur = Math.round(
    days
      .flatMap((d) => d.activities)
      .filter((a) => a.type !== 'camp')
      .reduce((sum, a) => sum + (a.cost_estimate ?? 0), 0),
  );

  // — Péages (voiture uniquement)
  const tollsEur: EurRange = carKm > 0 ? [0, round5(carKm * TOLL_EUR_PER_KM_MAX)] : [0, 0];

  const budget: TripBudget = {
    fuel_eur: Math.round(fuelEur),
    tolls_eur: tollsEur,
    nights_eur: nightsEur,
    meals_eur: mealsEur,
    activities_eur: activitiesEur,
    total_eur: [
      round5(fuelEur + tollsEur[0] + nightsEur[0] + mealsEur[0] + activitiesEur),
      round5(fuelEur + tollsEur[1] + nightsEur[1] + mealsEur[1] + activitiesEur),
    ],
  };

  trip.budget = budget;
  trip.co2_kg = roundCo2(co2Kg);
}
