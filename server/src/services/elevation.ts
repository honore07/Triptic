import { logger } from '../logger.js';

/**
 * Client OpenTopoData auto-hébergé (roadmap 5.3) — Copernicus DEM GLO-30
 * (© Union européenne, Copernicus ; usage commercial OK avec attribution),
 * IGN RGE ALTI en surcouche France quand installé.
 * Sans OPENTOPODATA_URL : service désactivé, les dénivelés restent ceux des
 * sources (Geotrek, GraphHopper) ou absents.
 */

const BATCH_SIZE = 100;
/** Échantillonnage : profil suffisant sans requêtes massives. */
const MAX_SAMPLES = 200;
/** Lissage : les micro-oscillations du DEM (< 8 m) ne comptent pas comme D+. */
const GAIN_THRESHOLD_M = 8;
const REQUEST_TIMEOUT_MS = 15_000;

export class ElevationService {
  constructor(
    private readonly baseUrl: string | null,
    private readonly dataset = 'cop30',
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  get enabled(): boolean {
    return this.baseUrl !== null && this.baseUrl !== '';
  }

  /** Altitudes (m) pour une liste de points [lng, lat]. null si indisponible. */
  async elevations(coords: [number, number][]): Promise<number[] | null> {
    if (!this.enabled || coords.length === 0) return null;
    const results: number[] = [];
    try {
      for (let i = 0; i < coords.length; i += BATCH_SIZE) {
        const batch = coords.slice(i, i + BATCH_SIZE);
        const locations = batch.map(([lng, lat]) => `${lat},${lng}`).join('|');
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        const response = await this.fetchImpl(
          `${this.baseUrl}/v1/${this.dataset}?locations=${locations}`,
          { signal: controller.signal },
        );
        clearTimeout(timer);
        if (!response.ok) return null;
        const body = (await response.json()) as {
          results?: { elevation: number | null }[];
        };
        for (const r of body.results ?? []) results.push(r.elevation ?? 0);
      }
      return results;
    } catch (error) {
      logger.warn({ error }, 'OpenTopoData unreachable');
      return null;
    }
  }

  /**
   * Dénivelé positif cumulé (m) le long d'un tracé [lng, lat][], avec
   * échantillonnage et seuil anti-bruit. null si le service est indisponible.
   */
  async elevationGain(trace: [number, number][]): Promise<number | null> {
    const step = Math.max(1, Math.ceil(trace.length / MAX_SAMPLES));
    const sampled = trace.filter((_, i) => i % step === 0);
    const elevations = await this.elevations(sampled);
    if (!elevations || elevations.length < 2) return null;
    let gain = 0;
    let reference = elevations[0]!;
    for (const elevation of elevations.slice(1)) {
      const delta = elevation - reference;
      if (delta >= GAIN_THRESHOLD_M) {
        gain += delta;
        reference = elevation;
      } else if (delta < 0) {
        reference = elevation;
      }
    }
    return Math.round(gain);
  }
}
