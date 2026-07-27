import { Router, type Response } from 'express';
import { z } from 'zod';
import { generateTrips, type LlmProvider } from '@triptic/ai-engine';
import { PLANS, type TripRequest } from '@triptic/shared';
import { logger } from '../logger.js';
import { applyTripEstimates } from '../services/budget.js';
import { findTripPhoto } from '../services/photos.js';
import { enrichTripSegments } from '../services/segments.js';
import type { QuotaService } from '../services/quota.js';
import type { RoutingService } from '../services/routing.js';
import type { PgPlaceRepo } from '../repo/places.js';
import type { EnrichmentService } from '../services/enrichment.js';

const tuningValue = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

/**
 * Onboarding hybride (1.1) : puces UI liées aux enums TripRequest — validées
 * strictement ici, jamais re-parsées depuis du texte libre.
 */
const requestOverridesSchema = z
  .object({
    duration_days: z.number().int().min(1).max(60),
    modes: z.array(z.enum(['roadtrip', 'trek', 'bikepacking'])).min(1),
    difficulty: z.enum(['easy', 'medium', 'hard']),
    group_type: z.enum(['solo', 'couple', 'group', 'family']),
    vehicle: z.enum(['van', 'car', 'moto', 'none']),
    avoid_crowds: z.boolean(),
    camping: z.boolean(),
    budget: z.enum(['low', 'medium', 'high']),
  })
  .partial();

const generateBodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(30),
  lang: z.enum(['fr', 'en', 'de']).default('fr'),
  /** Curseurs 1-5 du TripTuner (optionnels : anciens clients, tests). */
  tuning: z
    .object({
      physical: tuningValue,
      pace: tuningValue,
      culture: tuningValue,
      discovery: tuningValue,
    })
    .optional(),
  request_overrides: requestOverridesSchema.optional(),
});

function sseWrite(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/**
 * POST /api/ai/generate-trips — réponse en Server-Sent Events :
 *   event: status   {step}
 *   event: question {message}            (le moteur a besoin d'une précision)
 *   event: trips    {generation, validated, remaining}
 *   event: error    {error}
 *   event: done     {}
 */
export function createAiRouter(
  provider: LlmProvider,
  quota: QuotaService,
  placeRepo?: PgPlaceRepo,
  enrichment?: EnrichmentService,
  routing?: RoutingService,
): Router {
  const router = Router();

  router.post('/generate-trips', async (req, res) => {
    const parsed = generateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
      return;
    }
    const { messages, lang, tuning, request_overrides } = parsed.data;
    // exactOptionalPropertyTypes : on retire les clés explicitement undefined
    const overrides = request_overrides
      ? (Object.fromEntries(
          Object.entries(request_overrides).filter(([, v]) => v !== undefined),
        ) as Partial<TripRequest>)
      : undefined;
    const { id: userId, plan } = req.user;
    const limits = PLANS[plan].limits;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      if (quota.remaining(userId, plan) <= 0) {
        sseWrite(res, 'error', { error: 'quota_exceeded', plan });
        sseWrite(res, 'done', {});
        res.end();
        return;
      }

      const result = await generateTrips(provider, messages, {
        lang,
        maxProposals: limits.trip_proposals,
        tuning,
        requestOverrides: overrides,
        // Ancrage sur la base de lieux (PostGIS) quand elle est disponible
        getShortlist: placeRepo
          ? (points) =>
              placeRepo.shortlistForCorridor(points, {
                ...(tuning ? { discovery: tuning.discovery } : {}),
              })
          : undefined,
        onEvent: (event) => {
          if (event.kind === 'status') sseWrite(res, 'status', { step: event.step });
        },
      });

      if (result.type === 'question') {
        sseWrite(res, 'question', { message: result.message });
      } else {
        quota.consume(userId, plan);
        const visible = result.generation.trips.slice(0, limits.trip_proposals);
        // Segments routés (GraphHopper 0.2) : géométrie réelle + distances/durées.
        // Jamais bloquant : sans routeur, les estimations LLM restent en place.
        if (routing?.enabled) {
          sseWrite(res, 'status', { step: 'routing' });
          const stats = await Promise.all(
            visible.map((trip) => enrichTripSegments(trip, routing)),
          );
          logger.info(
            {
              routed: stats.reduce((n, s) => n + s.routedCount, 0),
              segments: stats.reduce((n, s) => n + s.segmentCount, 0),
            },
            'Segment routing metrics',
          );
        }
        // CO₂ (ADEME) + budget itemisé — depuis les segments routés si dispo
        for (const trip of visible) {
          applyTripEstimates(trip, result.generation.request);
        }
        sseWrite(res, 'status', { step: 'photos' });
        await Promise.all(
          visible.map(async (trip) => {
            trip.photo_url = (await findTripPhoto(trip.photo_keywords)) ?? undefined;
          }),
        );
        sseWrite(res, 'trips', {
          generation: {
            ...result.generation,
            trips: visible,
          },
          locked_proposals: result.generation.trips.length - visible.length,
          validated: result.validated,
          grounded: result.grounding.applied,
          remaining: quota.remaining(userId, plan),
        });
        logger.info(
          {
            grounded: result.grounding.applied,
            shortlistSize: result.grounding.shortlistSize,
            validated: result.validated,
          },
          'Trip generation metrics',
        );
        // Zone sous-couverte → enrichissement OSM en tâche de fond (phase D)
        if (enrichment) {
          const allPoints = result.generation.trips.flatMap((t) =>
            t.waypoints.map((w) => ({ lat: w.lat, lng: w.lng })),
          );
          enrichment.maybeEnrich(allPoints, result.grounding.shortlistSize);
        }
      }
    } catch (error) {
      logger.error({ error, context: 'generate-trips' }, 'Trip generation failed');
      sseWrite(res, 'error', { error: 'generation_failed' });
    }
    sseWrite(res, 'done', {});
    res.end();
  });

  return router;
}
