import type { SegmentMode } from '@triptic/shared';
import { logger } from '../logger.js';

/**
 * Client GraphHopper auto-hébergé (roadmap 0.2) — géométrie de route réelle,
 * durée, distance et dénivelé entre deux points, en voiture (profil scenic
 * « belles routes »), à pied ou à vélo.
 *
 * Résultats OSM/ODbL : stockage en base AUTORISÉ (contrairement à Mapbox
 * Directions, jamais mis en cache — garde-fou légal de la roadmap).
 * Sans GRAPHHOPPER_URL configurée : service désactivé, l'appelant garde
 * l'estimation LLM en fallback.
 */

export interface RoutedLeg {
  /** Coordonnées GeoJSON [lng, lat] de la géométrie routée. */
  geometry: [number, number][];
  distance_km: number;
  duration_min: number;
  elevation_gain_m: number;
}

export interface LatLng {
  lat: number;
  lng: number;
}

const PROFILE_BY_MODE: Record<SegmentMode, string> = {
  car: 'car_scenic',
  foot: 'foot',
  bike: 'bike',
};

const REQUEST_TIMEOUT_MS = 10_000;
/** Cache in-memory borné (FIFO) — migration Redis quand il sera installé. */
const CACHE_MAX = 500;

interface GraphHopperPath {
  distance: number; // mètres
  time: number; // millisecondes
  ascend?: number; // mètres
  points?: { coordinates?: number[][] };
}

export class RoutingService {
  private readonly cache = new Map<string, RoutedLeg>();

  constructor(
    private readonly baseUrl: string | null,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  get enabled(): boolean {
    return this.baseUrl !== null && this.baseUrl !== '';
  }

  /**
   * Route entre deux points (ou plus, dans l'ordre). Retourne null si le
   * service est désactivé ou en erreur — l'appelant garde son estimation.
   */
  async route(points: LatLng[], mode: SegmentMode): Promise<RoutedLeg | null> {
    if (!this.enabled || points.length < 2) return null;
    const key = cacheKey(points, mode);
    const cached = this.cache.get(key);
    if (cached) return cached;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const response = await this.fetchImpl(`${this.baseUrl}/route`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          points: points.map((p) => [p.lng, p.lat]),
          profile: PROFILE_BY_MODE[mode],
          elevation: true,
          points_encoded: false,
          instructions: false,
          calc_points: true,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!response.ok) {
        logger.warn({ status: response.status, mode }, 'GraphHopper route failed');
        return null;
      }
      const body = (await response.json()) as { paths?: GraphHopperPath[] };
      const path = body.paths?.[0];
      if (!path || typeof path.distance !== 'number' || typeof path.time !== 'number') {
        return null;
      }
      const leg: RoutedLeg = {
        geometry: (path.points?.coordinates ?? []).map(
          // GH renvoie [lng, lat, ele] avec elevation:true — on garde lng/lat
          (c) => [c[0] ?? 0, c[1] ?? 0] as [number, number],
        ),
        distance_km: round1(path.distance / 1000),
        duration_min: Math.round(path.time / 60_000),
        elevation_gain_m: Math.round(path.ascend ?? 0),
      };
      if (this.cache.size >= CACHE_MAX) {
        const oldest = this.cache.keys().next().value;
        if (oldest !== undefined) this.cache.delete(oldest);
      }
      this.cache.set(key, leg);
      return leg;
    } catch (error) {
      logger.warn({ error, mode }, 'GraphHopper unreachable');
      return null;
    }
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Coordonnées arrondies à ~10 m : deux requêtes quasi identiques partagent le cache. */
function cacheKey(points: LatLng[], mode: SegmentMode): string {
  return `${mode}:${points.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join(';')}`;
}
