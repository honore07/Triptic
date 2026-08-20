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
import { supabase } from './supabase';
import { useUserStore } from '../store/userStore';

const API_URL = import.meta.env.VITE_API_URL ?? '';

/**
 * Échec HTTP portant le statut et le code d'erreur du serveur, pour que l'UI
 * dise la vérité : 400 `invalid_body` = saisie à corriger, 503
 * `db_unavailable` / `routing_unavailable` = service manquant (la saisie était
 * bonne). Une panne réseau lève une TypeError, jamais une ApiError.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(status: number, code: string | undefined, context: string) {
    super(`${context} failed: ${status}${code ? ` (${code})` : ''}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Construit l'ApiError d'une réponse non-ok en lisant le `error` du corps JSON.
 * Corps absent ou non-JSON (404 HTML d'une route non montée) → code undefined.
 */
async function apiError(res: Response, context: string): Promise<ApiError> {
  let code: string | undefined;
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === 'string') code = body.error;
  } catch {
    code = undefined;
  }
  return new ApiError(res.status, code, context);
}

/** GET /api/me — identité, plan effectif (offre de lancement incluse), quota. */
export interface MePayload {
  authenticated: boolean;
  email: string | null;
  plan: PlanId;
  launch_offer: boolean;
  remaining: number | null;
}

export async function fetchMe(): Promise<MePayload | null> {
  try {
    const res = await fetch(`${API_URL}/api/me`, {
      headers: await authHeaders(useUserStore.getState().plan),
    });
    return res.ok ? res.json() : null;
  } catch {
    return null;
  }
}

export interface TripsPayload {
  generation: TripGeneration;
  locked_proposals: number;
  validated: boolean;
  /** null = illimité (Infinity non sérialisable en JSON) */
  remaining: number | null;
}

export type GenerateEvent =
  | { event: 'status'; data: { step: string } }
  | { event: 'question'; data: { message: string; quick_replies?: string[] } }
  | { event: 'trips'; data: TripsPayload }
  | { event: 'error'; data: { error: string } }
  | { event: 'done'; data: Record<string, never> };

/**
 * En-têtes d'auth. Le jeton est demandé FRAIS à supabase-js au moment de la
 * requête : getSession() rafraîchit un jeton expiré — indispensable sur
 * mobile, où l'app revient de veille avec un jeton périmé et où le store
 * peut mentir (bug constaté en prod : requête partie sans Authorization
 * alors que l'UI affichait « connecté »). Repli sur le dernier jeton connu
 * du store si getSession traîne (> 2,5 s) ou échoue. Le header x-plan reste
 * pour le mode démo/dev sans auth — ignoré par le serveur en production.
 */
async function authHeaders(plan: PlanId): Promise<HeadersInit> {
  let token = useUserStore.getState().accessToken;
  if (supabase) {
    try {
      const fresh = await Promise.race([
        supabase.auth.getSession().then(({ data }) => data.session?.access_token ?? null),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
      ]);
      if (fresh) token = fresh;
    } catch {
      // getSession en échec → on tente avec le jeton du store
    }
  }
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(plan === 'free' ? {} : { 'x-plan': plan }),
  };
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
  startDate?: string | null,
): Promise<void> {
  const res = await fetch(`${API_URL}/api/ai/generate-trips`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders(plan)) },
    body: JSON.stringify({
      messages,
      lang,
      ...(tuning ? { tuning } : {}),
      ...(requestOverrides && Object.keys(requestOverrides).length > 0
        ? { request_overrides: requestOverrides }
        : {}),
      ...(startDate ? { start_date: startDate } : {}),
    }),
  });
  if (!res.ok || !res.body) {
    throw await apiError(res, 'generate-trips');
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
    headers: { 'Content-Type': 'application/json', ...(await authHeaders(plan)) },
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
    headers: { 'Content-Type': 'application/json', ...(await authHeaders(plan)) },
    body: JSON.stringify({
      title: proposal.title,
      mode: proposal.mode,
      duration_days: proposal.duration_days,
      days: proposal.days ?? [],
      instruction,
      lang,
    }),
  });
  if (!res.ok) throw await apiError(res, 'edit-trip');
  await readSse(res, onEvent as (event: { event: string; data: unknown }) => void);
}

export async function saveTrip(
  proposal: TripProposal,
  plan: PlanId,
  isPublic: boolean,
  status: 'draft' | 'saved' = 'saved',
): Promise<Trip> {
  const { waypoints, title, mode, days, ...metadata } = proposal;
  const res = await fetch(`${API_URL}/api/trips`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders(plan)) },
    body: JSON.stringify({
      title,
      mode,
      metadata,
      waypoints,
      days: days ?? null,
      cover_photo: proposal.photo_url ?? null,
      is_public: isPublic,
      status,
    }),
  });
  if (!res.ok) throw new Error(`saveTrip failed: ${res.status}`);
  return res.json();
}

/** GET /api/trips — les trips de l'utilisateur (brouillons inclus). */
export async function listTrips(plan: PlanId): Promise<Trip[]> {
  const res = await fetch(`${API_URL}/api/trips`, { headers: await authHeaders(plan) });
  if (!res.ok) throw new Error(`listTrips failed: ${res.status}`);
  return res.json();
}

/** GET /api/trips/:id — null si introuvable ou inaccessible (404). */
export async function fetchTrip(tripId: string, plan: PlanId): Promise<Trip | null> {
  const res = await fetch(`${API_URL}/api/trips/${tripId}`, { headers: await authHeaders(plan) });
  return res.ok ? res.json() : null;
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
  if (!res.ok) throw await apiError(res, 'bbox search');
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
  if (!res.ok) throw await apiError(res, 'trails search');
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
    headers: { 'Content-Type': 'application/json', ...(await authHeaders(plan)) },
    body: JSON.stringify({ text, lang }),
  });
  // Un échec remonte (au lieu de renvoyer une liste vide) : « aucun filtre
  // détecté » et « le service de filtres est tombé » ne se disent pas pareil.
  if (!res.ok) throw await apiError(res, 'parse-filters');
  return res.json();
}

/** Fenêtre météo d'un jour du trip + alertes proactives (POST /api/trips/weather). */
export interface WeatherDayPayload {
  day: number;
  date: string | null;
  forecast: {
    weather_code: number;
    temp_min_c: number;
    temp_max_c: number;
    precipitation_mm: number;
    precipitation_probability: number;
    wind_max_kmh: number;
  } | null;
  alerts: { code: string; severity: 'warning' | 'danger' }[];
  out_of_range: boolean;
}

/**
 * Météo du trip (Aventurier+). Retourne null si plan insuffisant (402) ou
 * service indisponible — l'UI reste silencieuse dans ce cas.
 */
export async function fetchTripWeather(
  startDate: string,
  days: NonNullable<TripProposal['days']>,
  plan: PlanId,
): Promise<{ days: WeatherDayPayload[]; horizon_days: number } | null> {
  const res = await fetch(`${API_URL}/api/trips/weather`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders(plan)) },
    body: JSON.stringify({ start_date: startDate, days }),
  });
  return res.ok ? res.json() : null;
}

/**
 * PATCH /api/trips/:id — synchronise un trip sauvegardé après édition (3.1).
 * `patch.is_public: true` rend le trip public sans le dupliquer (le serveur
 * génère le slug si absent).
 */
export async function updateTrip(
  tripId: string,
  proposal: TripProposal,
  plan: PlanId,
  patch?: { is_public?: boolean; status?: Trip['status'] },
): Promise<Trip | null> {
  const { waypoints, title, mode, days, ...metadata } = proposal;
  const res = await fetch(`${API_URL}/api/trips/${tripId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders(plan)) },
    body: JSON.stringify({ title, mode, metadata, waypoints, days: days ?? null, ...patch }),
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
  if (!res.ok) throw await apiError(res, 'submitPlace');
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
  const res = await fetch(gpxUrl(tripId), { headers: await authHeaders(plan) });
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

/** Un média de lieu (photo ou vidéo) avec son crédit (CGU Unsplash & Pexels). */
export interface PlaceMedia {
  type: 'photo' | 'video';
  url: string;
  thumb: string;
  author: string;
  link: string;
  source: 'commons' | 'unsplash' | 'pexels';
  license?: string | undefined;
}

/**
 * Galerie d'un lieu. Les coordonnees priment sur le nom : elles selectionnent
 * des photos reellement prises sur place. [] si indisponible.
 */
export async function fetchPlaceMedia(
  query: string,
  coords?: { lat: number; lng: number },
): Promise<PlaceMedia[]> {
  try {
    const geo = coords ? `&lat=${coords.lat}&lng=${coords.lng}` : '';
    const res = await fetch(`${API_URL}/api/photos?q=${encodeURIComponent(query)}${geo}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { media?: PlaceMedia[] };
    return data.media ?? [];
  } catch {
    return [];
  }
}
