import { Router, type Response } from 'express';
import { z } from 'zod';
import {
  buildFilterPrompt,
  editTrip,
  extractJson,
  generateTrips,
  tripDaySchema,
  type LlmProvider,
} from '@triptic/ai-engine';
import { PLANS, type TripRequest } from '@triptic/shared';
import { logger } from '../logger.js';
import { SEARCHABLE_KINDS } from './places.js';
import { filtersFromText } from '../services/exploreFilters.js';
import { recomputeTrip } from '../services/recompute.js';
import { applyTripEstimates } from '../services/budget.js';
import { findDayPhotos, findTripPhoto } from '../services/photos.js';
import { enrichTripSegments } from '../services/segments.js';
import { env } from '../env.js';
import type { Quota } from '../services/quota.js';
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
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
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
  /** Date de départ ISO — fixe la saison (activités faisables) + météo. */
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

function sseWrite(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/**
 * POST /api/ai/generate-trips — réponse en Server-Sent Events :
 *   event: status   {step}
 *   event: question {message, quick_replies?}  (le moteur a besoin d'une précision)
 *   event: trips    {generation, validated, remaining}
 *   event: error    {error}
 *   event: done     {}
 */
export function createAiRouter(
  provider: LlmProvider,
  quota: Quota,
  placeRepo?: PgPlaceRepo,
  enrichment?: EnrichmentService,
  routing?: RoutingService,
): Router {
  const router = Router();

  // Avec Supabase configuré : la génération exige un compte (quota par
  // utilisateur + coût LLM). Renvoyé AVANT le passage en SSE → le front
  // reçoit un 401 JSON classique.
  router.use((req, res, next) => {
    if (env.authRequired && !req.user.authenticated) {
      res.status(401).json({ error: 'auth_required' });
      return;
    }
    next();
  });

  router.post('/generate-trips', async (req, res) => {
    const parsed = generateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
      return;
    }
    const { messages, lang, tuning, request_overrides, start_date } = parsed.data;
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
      if ((await quota.remaining(userId, plan)) <= 0) {
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
        startDate: start_date,
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
        sseWrite(res, 'question', {
          message: result.message,
          ...(result.quick_replies ? { quick_replies: result.quick_replies } : {}),
        });
      } else {
        await quota.consume(userId, plan);
        const visible = result.generation.trips.slice(0, limits.trip_proposals);
        // Date de départ posée sur chaque proposition (météo, saison, export)
        const tripStartDate = start_date ?? result.generation.request.start_date;
        if (tripStartDate) {
          for (const trip of visible) trip.start_date = tripStartDate;
        }
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
        // Photos par étape (2.3) — uniquement le 1er trip (quotas API)
        const first = visible[0];
        if (first?.days) {
          await findDayPhotos(first.days, first.photo_keywords);
        }
        sseWrite(res, 'trips', {
          generation: {
            ...result.generation,
            trips: visible,
          },
          locked_proposals: result.generation.trips.length - visible.length,
          validated: result.validated,
          grounded: result.grounding.applied,
          remaining: await quota.remaining(userId, plan),
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

  const parseFiltersBodySchema = z.object({
    text: z.string().min(2).max(500),
    lang: z.enum(['fr', 'en', 'de']).default('fr'),
  });
  const filtersOutputSchema = z.object({
    kinds: z.array(z.enum(SEARCHABLE_KINDS)).max(4).catch([]),
    keywords: z.array(z.string().max(40)).max(3).catch([]),
  });

  /**
   * POST /api/ai/parse-filters — « décris ton envie du jour » (4.2) :
   * convertit le texte libre en filtres structurés pour la recherche bbox.
   * Jamais bloquant : en cas d'échec LLM, filtres vides (le client cherche
   * alors sans filtre de kind).
   */
  router.post('/parse-filters', async (req, res) => {
    const parsed = parseFiltersBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
      return;
    }
    // Dictionnaire d'abord : les envies courantes (« se baigner », « un bon
    // resto ») sont du vocabulaire, pas du langage. Réponse immédiate, sans
    // réseau. Le modèle ne sert qu'aux formulations que le dictionnaire ignore.
    const known = filtersFromText(parsed.data.text);
    if (known.length > 0) {
      res.json({ kinds: known, keywords: [] });
      return;
    }
    try {
      const raw = await provider.complete({
        system: buildFilterPrompt(parsed.data.lang, SEARCHABLE_KINDS),
        messages: [{ role: 'user', content: parsed.data.text }],
        // Deepseek v4 raisonne avant de répondre : le budget couvre d'abord le
        // reasoning_content. À 300, la réponse était tronquée (finish_reason
        // « length ») et arrivait VIDE — donc filtres toujours vides, sans
        // erreur visible puisque le catch renvoie une réponse valide. Même
        // valeur que les autres agents (photoAgent, complianceAgent).
        maxTokens: 4000,
      });
      res.json(filtersOutputSchema.parse(extractJson(raw)));
    } catch (error) {
      logger.warn({ error, context: 'parse-filters' }, 'Filter parsing failed');
      res.json({ kinds: [], keywords: [] });
    }
  });

  const editBodySchema = z.object({
    title: z.string().min(1).max(200),
    mode: z.enum(['roadtrip', 'trek', 'bikepacking']),
    duration_days: z.number().int().min(1).max(60),
    days: z.array(tripDaySchema).min(1).max(60),
    instruction: z.string().min(3).max(1000),
    lang: z.enum(['fr', 'en', 'de']).default('fr'),
    request: z
      .object({
        vehicle: z.enum(['van', 'car', 'moto', 'none']).optional(),
        group_type: z.enum(['solo', 'couple', 'group', 'family']).optional(),
        camping: z.boolean().optional(),
      })
      .optional(),
  });

  /**
   * POST /api/ai/edit-trip — édition conversationnelle (3.2), SSE :
   *   event: status   {step}
   *   event: question {message}
   *   event: trip     {days, waypoints, distance_km, …, validated}
   *   event: error / done
   * Une phrase modifie l'activité ciblée ; correcteur + recalcul systématiques.
   */
  router.post('/edit-trip', async (req, res) => {
    const parsed = editBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_body', details: parsed.error.flatten() });
      return;
    }
    const { title, mode, duration_days, days, instruction, lang, request } = parsed.data;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      const result = await editTrip(provider, { title, mode, days }, instruction, {
        lang,
        onEvent: (event) => {
          if (event.kind === 'status') sseWrite(res, 'status', { step: event.step });
        },
      });
      if (result.type === 'question') {
        sseWrite(res, 'question', { message: result.message });
      } else if (routing) {
        sseWrite(res, 'status', { step: 'routing' });
        const recomputed = await recomputeTrip(
          { mode, duration_days, days: result.days, request },
          routing,
        );
        sseWrite(res, 'trip', { ...recomputed, validated: result.validated });
      } else {
        sseWrite(res, 'trip', { days: result.days, validated: result.validated });
      }
    } catch (error) {
      logger.error({ error, context: 'edit-trip' }, 'Trip edit failed');
      sseWrite(res, 'error', { error: 'edit_failed' });
    }
    sseWrite(res, 'done', {});
    res.end();
  });

  return router;
}
