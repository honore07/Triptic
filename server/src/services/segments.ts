import type {
  SegmentMode,
  TripActivity,
  TripDay,
  TripProposal,
  TripSegment,
} from '@triptic/shared';
import type { RoutingService } from './routing.js';

/**
 * Enrichissement des segments d'un trip (roadmap 0.3) : entre chaque paire
 * d'activités consécutives, on route via GraphHopper (géométrie réelle,
 * distance, durée, dénivelé). Si le routing échoue : estimation grand-cercle
 * (fallback JS assumé — pas de PostGIS ici, la base peut être absente en dev
 * et le routeur down ne doit jamais bloquer une génération).
 * Les totaux du trip sont recalculés dès qu'au moins un segment est routé ;
 * sinon on garde les estimations du LLM.
 */

const MODE_BY_TRIP: Record<TripProposal['mode'], SegmentMode> = {
  roadtrip: 'car',
  trek: 'foot',
  bikepacking: 'bike',
};

/** Vitesses moyennes et facteur de détour pour l'estimation de secours. */
const SPEED_KMH: Record<SegmentMode, number> = { car: 60, foot: 4, bike: 18 };
const DETOUR_FACTOR: Record<SegmentMode, number> = { car: 1.3, foot: 1.25, bike: 1.2 };

/** Sous ~50 m entre deux activités, pas de segment (même lieu). */
const MIN_SEGMENT_KM = 0.05;

export async function enrichTripSegments(
  trip: TripProposal,
  routing: RoutingService,
): Promise<{ routedCount: number; segmentCount: number }> {
  const days = trip.days;
  if (!days || days.length === 0) return { routedCount: 0, segmentCount: 0 };

  const mode = MODE_BY_TRIP[trip.mode];
  let previous: TripActivity | null = null;
  let routedCount = 0;
  let segmentCount = 0;

  for (const day of [...days].sort((a, b) => a.day - b.day)) {
    const segments: TripSegment[] = [];
    for (const activity of day.activities) {
      if (previous) {
        const crowFlightKm = haversineKm(previous, activity);
        if (crowFlightKm >= MIN_SEGMENT_KM) {
          const leg = await routing.route(
            [
              { lat: previous.lat, lng: previous.lng },
              { lat: activity.lat, lng: activity.lng },
            ],
            mode,
          );
          if (leg) {
            segments.push({
              geometry: leg.geometry,
              distance_km: leg.distance_km,
              duration_min: leg.duration_min,
              elevation_gain_m: leg.elevation_gain_m,
              mode,
              routed: true,
            });
            routedCount += 1;
          } else {
            const distanceKm = round1(crowFlightKm * DETOUR_FACTOR[mode]);
            segments.push({
              distance_km: distanceKm,
              duration_min: Math.round((distanceKm / SPEED_KMH[mode]) * 60),
              mode,
              routed: false,
            });
          }
          segmentCount += 1;
        }
      }
      previous = activity;
    }
    day.segments = segments;
  }

  if (routedCount > 0) {
    applyTotalsFromSegments(trip, days);
  }
  return { routedCount, segmentCount };
}

/**
 * Totaux recalculés depuis les segments. En road trip, les randos ("hike")
 * sont des boucles sur place : leur distance/dénivelé s'ajoutent aux segments.
 * En trek/bikepacking, les segments SONT la progression : ne pas compter
 * deux fois les distances déclarées sur les activités.
 * Exportée pour le recalcul post-édition (3.1) qui a besoin de totaux même
 * quand tous les segments sont des estimations (routeur indisponible).
 */
export function applyTotalsFromSegments(trip: TripProposal, days: TripDay[]): void {
  let distanceKm = 0;
  let elevationM = 0;
  for (const day of days) {
    for (const segment of day.segments ?? []) {
      distanceKm += segment.distance_km;
      elevationM += segment.elevation_gain_m ?? 0;
    }
    if (trip.mode === 'roadtrip') {
      for (const activity of day.activities) {
        if (activity.type === 'hike') {
          distanceKm += activity.distance_km ?? 0;
          elevationM += activity.elevation_gain_m ?? 0;
        }
      }
    }
  }
  trip.distance_km = Math.round(distanceKm);
  trip.elevation_gain_m = Math.round(elevationM);
  trip.daily_distance_km = Math.round(distanceKm / Math.max(1, trip.duration_days));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Distance grand-cercle (fallback uniquement — voir en-tête du fichier). */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
