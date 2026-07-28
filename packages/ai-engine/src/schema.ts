import { z } from 'zod';
import { deriveWaypointsFromDays } from '@triptic/shared';

/**
 * Les LLM dérivent parfois des enums stricts ("medium-hard", "modéré"…) —
 * observé avec Deepseek v4. On normalise vers le palier connu le plus proche,
 * en arrondissant vers le HAUT (surestimer une difficulté est moins risqué
 * sur le terrain que la sous-estimer). Zod re-valide derrière.
 */
export function coerceDifficulty(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const s = value.toLowerCase().trim();
  if (s === 'easy' || s === 'medium' || s === 'hard') return s;
  if (/hard|difficile|expert|schwer/.test(s)) return 'hard';
  if (/medium|moderate|modéré|moyen|mittel/.test(s)) return 'medium';
  if (/easy|facile|leicht/.test(s)) return 'easy';
  return value;
}

const difficultySchema = z.preprocess(coerceDifficulty, z.enum(['easy', 'medium', 'hard']));

export const tripRequestSchema = z.object({
  departure: z.string(),
  destination: z.string().optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  duration_days: z.number().int().min(1).max(60),
  modes: z.array(z.enum(['roadtrip', 'trek', 'bikepacking'])).min(1),
  difficulty: difficultySchema,
  group_type: z.enum(['solo', 'couple', 'group', 'family']),
  vehicle: z.enum(['van', 'car', 'moto', 'none']).optional(),
  avoid_crowds: z.boolean(),
  camping: z.boolean(),
  budget: z.enum(['low', 'medium', 'high']),
  physical_level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  constraints: z.array(z.string()),
  style: z.array(z.string()),
});

export const waypointSchema = z.object({
  name: z.string(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  day: z.number().int().min(1),
  kind: z.enum(['start', 'stage', 'poi', 'camp', 'trailhead', 'end']),
  note: z.string().optional(),
});

export const tripActivitySchema = z.object({
  type: z.enum(['hike', 'drive', 'visit', 'meal', 'camp', 'rest']),
  time_of_day: z.enum(['morning', 'afternoon', 'evening']),
  title: z.string(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  description: z.string().optional(),
  duration_min: z.number().min(0).optional(),
  distance_km: z.number().min(0).optional(),
  elevation_gain_m: z.number().min(0).optional(),
  cost_estimate: z.number().min(0).optional(),
  place_id: z.string().optional(),
});

/** Segments calculés côté serveur (GraphHopper) — jamais demandés au LLM. */
export const tripSegmentSchema = z.object({
  geometry: z.array(z.tuple([z.number(), z.number()])).optional(),
  distance_km: z.number().min(0),
  duration_min: z.number().min(0),
  mode: z.enum(['car', 'foot', 'bike']),
  routed: z.boolean().optional(),
  elevation_gain_m: z.number().min(0).optional(),
  fuel_cost: z.number().min(0).optional(),
  co2_kg: z.number().min(0).optional(),
});

export const tripDaySchema = z.object({
  day: z.number().int().min(1),
  title: z.string(),
  start_location: z.string().optional(),
  end_location: z.string().optional(),
  activities: z.array(tripActivitySchema).min(1),
  segments: z.array(tripSegmentSchema).optional(),
  photo_url: z.string().optional(),
});

/**
 * Un trip arrive soit au format historique (waypoints[]), soit au format
 * structuré jours → activités (roadmap 0.1) — dans ce cas les waypoints sont
 * dérivés des activités (compat carte/GPX/PostGIS).
 */
export const tripProposalSchema = z
  .object({
    title: z.string(),
    mode: z.enum(['roadtrip', 'trek', 'bikepacking']),
    duration_days: z.number().int().min(1),
    distance_km: z.number().min(0),
    elevation_gain_m: z.number().min(0),
    difficulty: difficultySchema,
    ambiance: z.string(),
    summary: z.string(),
    daily_distance_km: z.number().min(0),
    waypoints: z.array(waypointSchema).min(2).optional(),
    days: z.array(tripDaySchema).min(1).optional(),
    photo_keywords: z.array(z.string()).min(1),
  })
  .transform((p) => ({
    ...p,
    waypoints: p.waypoints ?? deriveWaypointsFromDays(p.days ?? []),
  }))
  .refine((p) => p.waypoints.length >= 2, {
    message: 'waypoints[] (min 2) ou days[] avec assez d’activités requis',
  });

/** Sortie attendue du LLM : soit une question de clarification, soit les 3 trips. */
export const engineOutputSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('question'),
    message: z.string(),
  }),
  z.object({
    type: z.literal('trips'),
    request: tripRequestSchema,
    trips: z.tuple([tripProposalSchema, tripProposalSchema, tripProposalSchema]),
    differentiator: z.string(),
  }),
]);

/** Sortie de l'éditeur conversationnel (3.2). */
export const editOutputSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('question'), message: z.string() }),
  z.object({ type: z.literal('edit'), days: z.array(tripDaySchema).min(1) }),
]);
export type EditOutput = z.infer<typeof editOutputSchema>;

export const correctorOutputSchema = z.object({
  valid: z.boolean(),
  issues: z.array(z.string()).default([]),
});

export type EngineOutput = z.infer<typeof engineOutputSchema>;
export type CorrectorOutput = z.infer<typeof correctorOutputSchema>;

/** Extrait le premier objet JSON d'une réponse LLM (tolère les fences markdown). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object found in LLM response');
  }
  return JSON.parse(candidate.slice(start, end + 1));
}
