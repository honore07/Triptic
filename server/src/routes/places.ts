import { Router } from 'express';
import { z } from 'zod';
import type { PlaceKind, ShortlistPlace } from '@triptic/shared';
import { logger } from '../logger.js';
import { normalizeUserId } from '../repo/pgTrips.js';

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

/** Interface du repo côté routes — PgPlaceRepo la satisfait structurellement. */
export interface PlacesApi {
  findNearby(
    lat: number,
    lng: number,
    radiusM: number,
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
}

/**
 * Contributions utilisateurs (phase E) :
 *   GET  /api/places/nearby            lieux actifs autour d'un point
 *   POST /api/places                   proposer un lieu (statut pending, modéré)
 *   POST /api/places/:id/reviews       noter un lieu (fait évoluer sa confiance)
 */
export function createPlacesRouter(repo: PlacesApi): Router {
  const router = Router();

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
