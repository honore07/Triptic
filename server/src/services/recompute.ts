import {
  deriveWaypointsFromDays,
  type GroupType,
  type TripBudget,
  type TripDay,
  type TripMode,
  type TripProposal,
  type TripRequest,
  type Vehicle,
  type Waypoint,
} from '@triptic/shared';
import { applyTripEstimates } from './budget.js';
import { applyTotalsFromSegments, enrichTripSegments } from './segments.js';
import type { RoutingService } from './routing.js';

/**
 * Recalcul live d'un trip après édition (roadmap 3.1 — non négociable) :
 * segments routés GraphHopper + totaux + budget + CO₂, à partir de la seule
 * structure days[]. Stateless : utilisé par POST /api/trips/recompute et
 * par l'édition conversationnelle (3.2).
 */

export interface RecomputeRequest {
  vehicle?: Vehicle | undefined;
  group_type?: GroupType | undefined;
  camping?: boolean | undefined;
}

export interface RecomputeInput {
  mode: TripMode;
  duration_days: number;
  days: TripDay[];
  request?: RecomputeRequest | undefined;
}

export interface RecomputeResult {
  days: TripDay[];
  waypoints: Waypoint[];
  distance_km: number;
  elevation_gain_m: number;
  daily_distance_km: number;
  co2_kg?: number | undefined;
  budget?: TripBudget | undefined;
}

export async function recomputeTrip(
  input: RecomputeInput,
  routing: RoutingService,
): Promise<RecomputeResult> {
  const waypoints = deriveWaypointsFromDays(input.days);
  // Squelette : seuls mode/duration/days comptent, les totaux sont recalculés
  const trip: TripProposal = {
    title: '',
    mode: input.mode,
    duration_days: input.duration_days,
    distance_km: 0,
    elevation_gain_m: 0,
    difficulty: 'medium',
    ambiance: '',
    summary: '',
    daily_distance_km: 0,
    waypoints,
    days: input.days,
    photo_keywords: [],
  };
  await enrichTripSegments(trip, routing);
  // Édition : les totaux doivent refléter les jours actuels, même si tous
  // les segments sont des estimations (routeur indisponible)
  applyTotalsFromSegments(trip, input.days);

  const request: TripRequest = {
    departure: '',
    duration_days: input.duration_days,
    modes: [input.mode],
    difficulty: 'medium',
    group_type: input.request?.group_type ?? 'solo',
    vehicle: input.request?.vehicle,
    avoid_crowds: false,
    camping: input.request?.camping ?? true,
    budget: 'medium',
    physical_level: 3,
    constraints: [],
    style: [],
  };
  applyTripEstimates(trip, request);

  return {
    days: trip.days ?? input.days,
    waypoints: trip.waypoints,
    distance_km: trip.distance_km,
    elevation_gain_m: trip.elevation_gain_m,
    daily_distance_km: trip.daily_distance_km,
    co2_kg: trip.co2_kg,
    budget: trip.budget,
  };
}
