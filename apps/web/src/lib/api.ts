import type {
  ChatMessage,
  Lang,
  PlanId,
  Trip,
  TripGeneration,
  TripProposal,
  TripTuning,
} from '@triptic/shared';

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
): Promise<void> {
  const res = await fetch(`${API_URL}/api/ai/generate-trips`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...planHeaders(plan) },
    body: JSON.stringify({ messages, lang, ...(tuning ? { tuning } : {}) }),
  });
  if (!res.ok || !res.body) {
    throw new Error(`generate-trips failed: ${res.status}`);
  }

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
        onEvent({ event: eventMatch[1], data: JSON.parse(dataMatch[1]) } as GenerateEvent);
      }
    }
  }
}

export async function saveTrip(
  proposal: TripProposal,
  plan: PlanId,
  isPublic: boolean,
): Promise<Trip> {
  const { waypoints, title, mode, ...metadata } = proposal;
  const res = await fetch(`${API_URL}/api/trips`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...planHeaders(plan) },
    body: JSON.stringify({
      title,
      mode,
      metadata,
      waypoints,
      cover_photo: proposal.photo_url ?? null,
      is_public: isPublic,
    }),
  });
  if (!res.ok) throw new Error(`saveTrip failed: ${res.status}`);
  return res.json();
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
