import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { tripDaySchema } from '@triptic/ai-engine';
import { buildGpx } from '@triptic/map-utils';
import { dateForTripDay, PLANS } from '@triptic/shared';
import type { TripRepo } from '../repo/trips.js';
import { recomputeTrip } from '../services/recompute.js';
import type { RoutingService } from '../services/routing.js';
import {
  weatherAlertsForDay,
  FORECAST_HORIZON_DAYS,
  type WeatherService,
} from '../services/weather.js';

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
  days: z.array(tripDaySchema).min(1).nullable().default(null),
  cover_photo: z.string().url().nullable().default(null),
  is_public: z.boolean().default(false),
  /** 'draft' = auto-sauvegarde à la sélection ; 'saved' = choix explicite. */
  status: z.enum(['draft', 'saved', 'shared']).default('saved'),
});

const recomputeRequestSchema = z.object({
  vehicle: z.enum(['van', 'car', 'moto', 'none']).optional(),
  group_type: z.enum(['solo', 'couple', 'group', 'family']).optional(),
  camping: z.boolean().optional(),
});

const recomputeSchema = z.object({
  mode: z.enum(['roadtrip', 'trek', 'bikepacking']),
  duration_days: z.number().int().min(1).max(60),
  days: z.array(tripDaySchema).min(1).max(60),
  request: recomputeRequestSchema.optional(),
});

const weatherSchema = z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  days: z.array(tripDaySchema).min(1).max(60),
});

export function createTripsRouter(
  repo: TripRepo,
  routing?: RoutingService,
  weather?: WeatherService,
): Router {
  const router = Router();

  /**
   * POST /api/trips/weather — fenêtre météo par jour + ALERTES PROACTIVES
   * (prévision × activités planifiées : orage sur rando, canicule, neige sur
   * la route…). Open-Meteo, horizon ~16 jours. Feature payante
   * (weather_integration, plan Aventurier+). Stateless comme /recompute.
   */
  router.post('/weather', async (req, res) => {
    if (!PLANS[req.user.plan].limits.weather_integration) {
      res.status(402).json({ error: 'plan_required', feature: 'weather_integration' });
      return;
    }
    if (!weather) {
      res.status(503).json({ error: 'weather_unavailable' });
      return;
    }
    const parsed = weatherSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
      return;
    }
    const { start_date, days } = parsed.data;
    const result = await Promise.all(
      [...days]
        .sort((a, b) => a.day - b.day)
        .map(async (day) => {
          const date = dateForTripDay(start_date, day.day);
          // Point représentatif du jour : la première activité
          const anchor = day.activities[0];
          if (!date || !anchor) {
            return { day: day.day, date, forecast: null, alerts: [], out_of_range: false };
          }
          const forecast = await weather.dayForecast(anchor.lat, anchor.lng, date);
          return {
            day: day.day,
            date,
            forecast,
            alerts: forecast ? weatherAlertsForDay(forecast, day.activities) : [],
            out_of_range: forecast === null,
          };
        }),
    );
    res.json({ days: result, horizon_days: FORECAST_HORIZON_DAYS });
  });

  /**
   * POST /api/trips/recompute — recalcul live après édition (3.1) :
   * segments routés + totaux + budget + CO₂ depuis la structure days[].
   * Stateless (le trip n'a pas besoin d'être sauvegardé).
   */
  router.post('/recompute', async (req, res) => {
    if (!routing) {
      res.status(503).json({ error: 'routing_unavailable' });
      return;
    }
    const parsed = recomputeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
      return;
    }
    const { mode, duration_days, days, request } = parsed.data;
    res.json(await recomputeTrip({ mode, duration_days, days, request }, routing));
  });

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
      status: body.status,
      metadata: body.metadata as never,
      waypoints: body.waypoints,
      days: body.days,
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
