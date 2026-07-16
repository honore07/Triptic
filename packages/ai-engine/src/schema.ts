import { z } from 'zod';

export const tripRequestSchema = z.object({
  departure: z.string(),
  destination: z.string().optional(),
  duration_days: z.number().int().min(1).max(60),
  modes: z.array(z.enum(['roadtrip', 'trek', 'bikepacking'])).min(1),
  difficulty: z.enum(['easy', 'medium', 'hard']),
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

export const tripProposalSchema = z.object({
  title: z.string(),
  mode: z.enum(['roadtrip', 'trek', 'bikepacking']),
  duration_days: z.number().int().min(1),
  distance_km: z.number().min(0),
  elevation_gain_m: z.number().min(0),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  ambiance: z.string(),
  summary: z.string(),
  daily_distance_km: z.number().min(0),
  waypoints: z.array(waypointSchema).min(2),
  photo_keywords: z.array(z.string()).min(1),
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
