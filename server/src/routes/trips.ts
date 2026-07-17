import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { buildGpx } from '@triptic/map-utils';
import { PLANS } from '@triptic/shared';
import type { TripRepo } from '../repo/trips.js';

const waypointSchema = z.object({
  name: z.string(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  day: z.number().int().min(1),
  kind: z.enum(['start', 'stage', 'poi', 'camp', 'trailhead', 'end']),
  note: z.string().optional(),
});

const saveTripSchema = z.object({
  title: z.string().min(1).max(200),
  mode: z.enum(['roadtrip', 'trek', 'bikepacking']),
  metadata: z.record(z.unknown()),
  waypoints: z.array(waypointSchema).min(2),
  cover_photo: z.string().url().nullable().default(null),
  is_public: z.boolean().default(false),
});

export function createTripsRouter(repo: TripRepo): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    const parsed = saveTripSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
      return;
    }
    const body = parsed.data;
    const trip = await repo.save({
      user_id: req.user.id,
      title: body.title,
      slug: body.is_public ? `${slugify(body.title)}-${randomUUID().slice(0, 6)}` : null,
      is_public: body.is_public,
      mode: body.mode,
      status: 'saved',
      metadata: body.metadata as never,
      waypoints: body.waypoints,
      cover_photo: body.cover_photo,
    });
    res.status(201).json(trip);
  });

  router.get('/', async (req, res) => {
    res.json(await repo.listByUser(req.user.id));
  });

  router.get('/:id', async (req, res) => {
    const trip = await repo.getById(req.params.id);
    if (!trip || (trip.user_id !== req.user.id && !trip.is_public)) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json(trip);
  });

  router.patch('/:id', async (req, res) => {
    const existing = await repo.getById(req.params.id);
    if (!existing || existing.user_id !== req.user.id) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    const patchSchema = saveTripSchema.partial().extend({
      status: z.enum(['draft', 'saved', 'shared']).optional(),
    });
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_body' });
      return;
    }
    const patch: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.is_public && !existing.slug) {
      patch['slug'] = `${slugify(existing.title)}-${randomUUID().slice(0, 6)}`;
    }
    res.json(await repo.update(req.params.id, patch));
  });

  /** Export GPX — réservé aux plans payants (gpx_export). */
  router.get('/:id/gpx', async (req, res) => {
    if (!PLANS[req.user.plan].limits.gpx_export) {
      res.status(402).json({ error: 'plan_required', feature: 'gpx_export' });
      return;
    }
    const trip = await repo.getById(req.params.id);
    if (!trip || (trip.user_id !== req.user.id && !trip.is_public)) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.setHeader('Content-Type', 'application/gpx+xml');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${slugify(trip.title)}.gpx"`,
    );
    res.send(buildGpx(trip.title, trip.waypoints));
  });

  return router;
}

/** Page publique /api/public/trips/:slug — sans auth (acquisition). */
export function createPublicTripsRouter(repo: TripRepo): Router {
  const router = Router();
  router.get('/trips/:slug', async (req, res) => {
    const trip = await repo.getBySlug(req.params.slug);
    if (!trip) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.json(trip);
  });
  return router;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
}
