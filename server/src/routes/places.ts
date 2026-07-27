import { Router } from 'express';
import { z } from 'zod';
import type { PlaceKind, ShortlistPlace } from '@triptic/shared';
import { logger } from '../logger.js';
import { normalizeUserId } from '../repo/pgTrips.js';
import type { RoutingService } from '../services/routing.js';

const PLACE_KINDS: [PlaceKind, ...PlaceKind[]] = [
  'peak',
  'pass',
  'lake',
  'waterfall',
  'gorge',
  'glacier',
  'viewpoint',
  'refuge',
  'camp',
  'castle',
  'village',
  'museum',
  'attraction',
  'poi',
];

/** Tous les kinds interrogeables en bbox (contributions + food du 0.4). */
export const SEARCHABLE_KINDS: [PlaceKind, ...PlaceKind[]] = [
  ...PLACE_KINDS,
  'restaurant',
  'cafe',
  'bar',
  'fast_food',
];

const submitSchema = z.object({
  name: z.string().min(2).max(120),
  kind: z.enum(PLACE_KINDS),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  summary: z.string().max(200).optional(),
});

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
});

const nearbySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().min(100).max(50000).default(10000),
});

/** « Search this area » (4.1/4.2) : zone visible de la carte + filtres. */
const bboxSchema = z
  .object({
    south: z.coerce.number().min(-90).max(90),
    west: z.coerce.number().min(-180).max(180),
    north: z.coerce.number().min(-90).max(90),
    east: z.coerce.number().min(-180).max(180),
    /** Liste de kinds séparés par des virgules (ex. "restaurant,cafe"). */
    kinds: z
      .string()
      .transform((s) => s.split(',').filter(Boolean))
      .pipe(z.array(z.enum(SEARCHABLE_KINDS)).max(SEARCHABLE_KINDS.length))
      .optional(),
    /** Point de départ (géoloc ou départ du jour) → temps de trajet GraphHopper. */
    from_lat: z.coerce.number().min(-90).max(90).optional(),
    from_lng: z.coerce.number().min(-180).max(180).optional(),
    travel_mode: z.enum(['car', 'foot', 'bike']).default('car'),
  })
  .refine((b) => b.south < b.north && b.west < b.east, { message: 'invalid bbox' });

/** Nombre de résultats dont on calcule le temps de trajet (coût routing borné). */
const TRAVEL_TIME_TOP = 12;

/** Interface du repo côté routes — PgPlaceRepo la satisfait structurellement. */
export interface PlacesApi {
  findNearby(
    lat: number,
    lng: number,
    radiusM: number,
    limit: number,
  ): Promise<(ShortlistPlace & { id: string })[]>;
  findInBbox(
    bbox: { south: number; west: number; north: number; east: number },
    kinds: PlaceKind[] | undefined,
    limit: number,
  ): Promise<(ShortlistPlace & { id: string })[]>;
  submitUserPlace(input: {
    name: string;
    kind: PlaceKind;
    lat: number;
    lng: number;
    summary?: string | null;
    userId?: string | null;
  }): Promise<'pending' | 'merged'>;
  addReview(
    placeId: string,
    userId: string | null,
    rating: number,
    comment: string | null,
  ): Promise<boolean>;
  statsSummary(): Promise<{
    total: number;
    pending: number;
    by_region: { region: string | null; count: number }[];
    by_source: { source: string; count: number }[];
  }>;
}

/**
 * Contributions utilisateurs (phase E) + monitoring :
 *   GET  /api/places/stats             santé de la base (n8n, rapport hebdo)
 *   GET  /api/places/nearby            lieux actifs autour d'un point
 *   POST /api/places                   proposer un lieu (statut pending, modéré)
 *   POST /api/places/:id/reviews       noter un lieu (fait évoluer sa confiance)
 */
export function createPlacesRouter(repo: PlacesApi, routing?: RoutingService): Router {
  const router = Router();

  /**
   * GET /api/places/bbox — « search this area » (4.2) : lieux de la zone
   * visible, triés par notoriété, avec temps de trajet GraphHopper depuis
   * from_lat/from_lng pour les premiers résultats.
   */
  router.get('/bbox', async (req, res) => {
    const parsed = bboxSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_query', details: parsed.error.flatten() });
      return;
    }
    const { south, west, north, east, kinds, from_lat, from_lng, travel_mode } = parsed.data;
    try {
      const places = (await repo.findInBbox({ south, west, north, east }, kinds, 50)) as
        (ShortlistPlace & { id: string; travel_min?: number })[];
      if (routing?.enabled && from_lat !== undefined && from_lng !== undefined) {
        await Promise.all(
          places.slice(0, TRAVEL_TIME_TOP).map(async (place) => {
            const leg = await routing.route(
              [
                { lat: from_lat, lng: from_lng },
                { lat: place.lat, lng: place.lng },
              ],
              travel_mode,
            );
            if (leg) place.travel_min = leg.duration_min;
          }),
        );
      }
      res.json({ places });
    } catch (error) {
      logger.error({ error, context: 'places-bbox' }, 'Bbox search failed');
      res.status(500).json({ error: 'places_unavailable' });
    }
  });

  router.get('/stats', async (_req, res) => {
    try {
      res.json(await repo.statsSummary());
    } catch (error) {
      logger.error({ error, context: 'places-stats' }, 'Places stats failed');
      res.status(500).json({ error: 'places_unavailable' });
    }
  });

  router.get('/nearby', async (req, res) => {
    const parsed = nearbySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_query', details: parsed.error.flatten() });
      return;
    }
    try {
      const { lat, lng, radius } = parsed.data;
      const places = await repo.findNearby(lat, lng, radius, 50);
      res.json({ places });
    } catch (error) {
      logger.error({ error, context: 'places-nearby' }, 'Nearby places failed');
      res.status(500).json({ error: 'places_unavailable' });
    }
  });

  router.post('/', async (req, res) => {
    const parsed = submitSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
      return;
    }
    try {
      const status = await repo.submitUserPlace({
        ...parsed.data,
        summary: parsed.data.summary ?? null,
        userId: normalizeUserId(req.user.id),
      });
      res.status(201).json({ status });
    } catch (error) {
      logger.error({ error, context: 'places-submit' }, 'Place submission failed');
      res.status(500).json({ error: 'places_unavailable' });
    }
  });

  router.post('/:id/reviews', async (req, res) => {
    const parsed = reviewSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
      return;
    }
    try {
      const ok = await repo.addReview(
        req.params['id'] as string,
        normalizeUserId(req.user.id),
        parsed.data.rating,
        parsed.data.comment ?? null,
      );
      if (!ok) {
        res.status(404).json({ error: 'place_not_found' });
        return;
      }
      res.status(201).json({ ok: true });
    } catch (error) {
      logger.error({ error, context: 'places-review' }, 'Place review failed');
      res.status(500).json({ error: 'places_unavailable' });
    }
  });

  return router;
}
