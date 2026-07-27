import type {
  ChatMessage,
  Lang,
  PlaceKind,
  PlanId,
  SegmentMode,
  Trip,
  TripGeneration,
  TripProposal,
  TripRequest,
  TripTuning,
} from '@triptic/shared';
import type { ExplorePlace } from './explore';

const API_URL = import.meta.env.VITE_API_URL ?? '';

export interface TripsPayload {
  generation: TripGeneration;
  locked_proposals: number;
  validated: boolean;
  /** null = illimité (Infinity non sérialisable en JSON) */
  remaining: number | null;
}

export type GenerateEvent =
  | { event: 'status'; data: { step: string } }
  | { event: 'question'; data: { message: string } }
  | { event: 'trips'; data: TripsPayload }
  | { event: 'error'; data: { error: string } }
  | { event: 'done'; data: Record<string, never> };

function planHeaders(plan: PlanId): HeadersInit {
  // En dev sans auth Supabase, le plan passe par x-plan (ignoré en production)
  return plan === 'free' ? {} : { 'x-plan': plan };
}

/**
 * POST /api/ai/generate-trips en SSE (fetch + ReadableStream — EventSource
 * ne supporte pas POST). Invoque onEvent pour chaque événement serveur.
 */
export async function generateTripsStream(
  messages: ChatMessage[],
  lang: Lang,
  plan: PlanId,
  onEvent: (event: GenerateEvent) => void,
  tuning?: TripTuning | null,
  requestOverrides?: Partial<TripRequest> | null,
): Promise<void> {
  const res = await fetch(`${API_URL}/api/ai/generate-trips`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...planHeaders(plan) },
    body: JSON.stringify({
      messages,
      lang,
      ...(tuning ? { tuning } : {}),
      ...(requestOverrides && Object.keys(requestOverrides).length > 0
        ? { request_overrides: requestOverrides }
        : {}),
    }),
  });
  if (!res.ok || !res.body) {
    throw new Error(`generate-trips failed: ${res.status}`);
  }
  await readSse(res, onEvent as (event: { event: string; data: unknown }) => void);
}

/** Champs recalculés après édition (POST /api/trips/recompute). */
export interface RecomputePayload {
  days: NonNullable<TripProposal['days']>;
  waypoints: TripProposal['waypoints'];
  distance_km: number;
  elevation_gain_m: number;
  daily_distance_km: number;
  co2_kg?: number;
  budget?: TripProposal['budget'];
}

/**
 * Recalcul live (3.1) : segments routés + totaux + budget + CO₂ depuis la
 * structure days[] éditée. Retourne null si le serveur ne peut pas recalculer
 * (l'UI garde alors les valeurs locales).
 */
export async function recomputeTrip(
  proposal: Pick<TripProposal, 'mode' | 'duration_days' | 'days'>,
  plan: PlanId,
  request?: { vehicle?: string; group_type?: string; camping?: boolean },
): Promise<RecomputePayload | null> {
  if (!proposal.days || proposal.days.length === 0) return null;
  const res = await fetch(`${API_URL}/api/trips/recompute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...planHeaders(plan) },
    body: JSON.stringify({
      mode: proposal.mode,
      duration_days: proposal.duration_days,
      days: proposal.days,
      ...(request ? { request } : {}),
    }),
  });
  return res.ok ? res.json() : null;
}

/** Lit un flux SSE fetch (POST) et invoque onEvent par événement. */
async function readSse(
  res: Response,
  onEvent: (event: { event: string; data: unknown }) => void,
): Promise<void> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n\n');
    buffer = chunks.pop() ?? '';
    for (const chunk of chunks) {
      const eventMatch = chunk.match(/^event: (.+)$/m);
      const dataMatch = chunk.match(/^data: (.+)$/m);
      if (eventMatch?.[1] && dataMatch?.[1]) {
        onEvent({ event: eventMatch[1], data: JSON.parse(dataMatch[1]) });
      }
    }
  }
}

export type EditTripEvent =
  | { event: 'status'; data: { step: string } }
  | { event: 'question'; data: { message: string } }
  | { event: 'trip'; data: RecomputePayload & { validated: boolean } }
  | { event: 'error'; data: { error: string } }
  | { event: 'done'; data: Record<string, never> };

/** POST /api/ai/edit-trip (3.2) — « change le J3 matin en trail 20 km ». */
export async function editTripStream(
  proposal: TripProposal,
  instruction: string,
  lang: Lang,
  plan: PlanId,
  onEvent: (event: EditTripEvent) => void,
): Promise<void> {
  const res = await fetch(`${API_URL}/api/ai/edit-trip`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...planHeaders(plan) },
    body: JSON.stringify({
      title: proposal.title,
      mode: proposal.mode,
      duration_days: proposal.duration_days,
      days: proposal.days ?? [],
      instruction,
      lang,
    }),
  });
  if (!res.ok) throw new Error(`edit-trip failed: ${res.status}`);
  await readSse(res, onEvent as (event: { event: string; data: unknown }) => void);
}

export async function saveTrip(
  proposal: TripProposal,
  plan: PlanId,
  isPublic: boolean,
): Promise<Trip> {
  const { waypoints, title, mode, days, ...metadata } = proposal;
  const res = await fetch(`${API_URL}/api/trips`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...planHeaders(plan) },
    body: JSON.stringify({
      title,
      mode,
      metadata,
      waypoints,
      days: days ?? null,
      cover_photo: proposal.photo_url ?? null,
      is_public: isPublic,
    }),
  });
  if (!res.ok) throw new Error(`saveTrip failed: ${res.status}`);
  return res.json();
}

export interface ExploreBbox {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** GET /api/places/bbox — « search this area » (4.2). */
export async function searchArea(
  bbox: ExploreBbox,
  kinds: PlaceKind[],
  from: { lat: number; lng: number } | null,
  travelMode: SegmentMode,
): Promise<ExplorePlace[]> {
  const params = new URLSearchParams({
    south: String(bbox.south),
    west: String(bbox.west),
    north: String(bbox.north),
    east: String(bbox.east),
    travel_mode: travelMode,
  });
  if (kinds.length > 0) params.set('kinds', kinds.join(','));
  if (from) {
    params.set('from_lat', String(from.lat));
    params.set('from_lng', String(from.lng));
  }
  const res = await fetch(`${API_URL}/api/places/bbox?${params}`);
  if (!res.ok) throw new Error(`bbox search failed: ${res.status}`);
  return ((await res.json()) as { places: ExplorePlace[] }).places;
}

/** Boucle rando renvoyée par GET /api/places/trails (5.2). */
export interface TrailResult {
  id: string;
  name: string | null;
  summary: string | null;
  notoriety: number;
  source: string;
  distance_km: number;
  duration_min: number;
  elevation_gain_m?: number;
  geometry: [number, number][];
  generated: boolean;
}

/** GET /api/places/trails — boucles mappées d'abord, générée en fallback. */
export async function searchTrails(
  center: { lat: number; lng: number },
  radiusM: number,
  targetKm: number | null,
): Promise<TrailResult[]> {
  const params = new URLSearchParams({
    lat: String(center.lat),
    lng: String(center.lng),
    radius: String(radiusM),
  });
  if (targetKm !== null) params.set('target_km', String(targetKm));
  const res = await fetch(`${API_URL}/api/places/trails?${params}`);
  if (!res.ok) throw new Error(`trails search failed: ${res.status}`);
  return ((await res.json()) as { trails: TrailResult[] }).trails;
}

/** POST /api/ai/parse-filters — « décris ton envie du jour » → kinds stricts. */
export async function parseExploreFilters(
  text: string,
  lang: Lang,
  plan: PlanId,
): Promise<{ kinds: PlaceKind[]; keywords: string[] }> {
  const res = await fetch(`${API_URL}/api/ai/parse-filters`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...planHeaders(plan) },
    body: JSON.stringify({ text, lang }),
  });
  if (!res.ok) return { kinds: [], keywords: [] };
  return res.json();
}

/** PATCH /api/trips/:id — synchronise un trip sauvegardé après édition (3.1). */
export async function updateTrip(
  tripId: string,
  proposal: TripProposal,
  plan: PlanId,
): Promise<Trip | null> {
  const { waypoints, title, mode, days, ...metadata } = proposal;
  const res = await fetch(`${API_URL}/api/trips/${tripId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...planHeaders(plan) },
    body: JSON.stringify({ title, mode, metadata, waypoints, days: days ?? null }),
  });
  return res.ok ? res.json() : null;
}

export interface SubmitPlaceInput {
  name: string;
  kind: string;
  lat: number;
  lng: number;
  summary?: string;
}

/**
 * POST /api/places — proposition d'un lieu par l'utilisateur.
 * 'pending' = enregistré (modération), 'merged' = déjà connu de la base.
 */
export async function submitPlace(input: SubmitPlaceInput): Promise<'pending' | 'merged'> {
  const res = await fetch(`${API_URL}/api/places`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`submitPlace failed: ${res.status}`);
  const data = (await res.json()) as { status: 'pending' | 'merged' };
  return data.status;
}

export async function fetchPublicTrip(slug: string): Promise<Trip | null> {
  const res = await fetch(`${API_URL}/api/public/trips/${slug}`);
  return res.ok ? res.json() : null;
}

export function gpxUrl(tripId: string): string {
  return `${API_URL}/api/trips/${tripId}/gpx`;
}

export async function downloadGpx(tripId: string, title: string, plan: PlanId): Promise<boolean> {
  const res = await fetch(gpxUrl(tripId), { headers: planHeaders(plan) });
  if (!res.ok) return false;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.gpx`;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}
