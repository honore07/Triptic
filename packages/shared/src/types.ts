export type TripMode = 'roadtrip' | 'trek' | 'bikepacking';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type GroupType = 'solo' | 'couple' | 'group' | 'family';
export type Vehicle = 'van' | 'car' | 'moto' | 'none';
export type Budget = 'low' | 'medium' | 'high';
export type Lang = 'fr' | 'en' | 'de';

/** Position d'un curseur de personnalisation (TripTuner). */
export type TuningValue = 1 | 2 | 3 | 4 | 5;

/**
 * Réglages fins posés juste après la demande initiale (curseurs 1-5) —
 * l'hyper-personnalisation des 3 trips. Injectés dans le prompt système.
 */
export interface TripTuning {
  /** 1 tranquille → 5 athlète */
  physical: TuningValue;
  /** 1 chill → 5 intense */
  pace: TuningValue;
  /** 1 pleine nature → 5 culture & villages */
  culture: TuningValue;
  /** 1 incontournables → 5 hors des sentiers battus */
  discovery: TuningValue;
}

/** Paramètres extraits de la conversation par le moteur IA. */
export interface TripRequest {
  departure: string;
  destination?: string | undefined;
  duration_days: number;
  modes: TripMode[];
  difficulty: Difficulty;
  group_type: GroupType;
  vehicle?: Vehicle | undefined;
  avoid_crowds: boolean;
  camping: boolean;
  budget: Budget;
  physical_level: 1 | 2 | 3 | 4 | 5;
  constraints: string[];
  style: string[];
}

/** Un waypoint du tracé (ordre lon/lat côté PostGIS, lat/lng ici côté app). */
export interface Waypoint {
  name: string;
  lat: number;
  lng: number;
  day: number;
  kind: 'start' | 'stage' | 'poi' | 'camp' | 'trailhead' | 'end';
  note?: string | undefined;
}

/** Une des 3 propositions générées par l'IA. */
export interface TripProposal {
  title: string;
  mode: TripMode;
  duration_days: number;
  distance_km: number;
  elevation_gain_m: number;
  difficulty: Difficulty;
  ambiance: string;
  summary: string;
  daily_distance_km: number;
  waypoints: Waypoint[];
  photo_keywords: string[];
  photo_url?: string | undefined;
}

export interface TripGeneration {
  trips: [TripProposal, TripProposal, TripProposal];
  differentiator: string;
  request: TripRequest;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Type d'un lieu de la base de connaissance TRIPTIC. */
export type PlaceKind =
  | 'peak'
  | 'pass'
  | 'lake'
  | 'waterfall'
  | 'gorge'
  | 'glacier'
  | 'viewpoint'
  | 'refuge'
  | 'camp'
  | 'castle'
  | 'village'
  | 'museum'
  | 'attraction'
  | 'poi';

/** Régions couvertes par la base (pilote : Alsace-Vosges + arc alpin). */
export type PlaceRegion = 'alsace-vosges' | 'alpes-fr' | 'alpes-ch' | 'alpes-it';

/**
 * Lieu réel compact envoyé au moteur IA pour l'ancrage (grounding) —
 * quelques dizaines de lignes au lieu de milliers de tokens.
 */
export interface ShortlistPlace {
  name: string;
  lat: number;
  lng: number;
  kind: PlaceKind;
  notoriety: number;
  summary?: string | null;
}

/**
 * Un lieu de la base de connaissance : POI réel, sourcé, scoré.
 * notoriety 0-100 : ≥60 incontournable, ≤35 pépite candidate.
 * confidence 0-100 : fiabilité de la donnée (OSM > web > ajout user non modéré).
 */
export interface Place {
  id: string;
  name: string;
  kind: PlaceKind;
  lat: number;
  lng: number;
  region: PlaceRegion | null;
  elevation_m: number | null;
  tags: string[];
  summary: string | null;
  notoriety: number;
  confidence: number;
  status: 'active' | 'pending' | 'rejected';
  source: string;
  source_url: string | null;
  created_at: string;
}

/** Trip persisté. */
export interface Trip {
  id: string;
  user_id: string | null;
  title: string;
  slug: string | null;
  is_public: boolean;
  mode: TripMode;
  status: 'draft' | 'saved' | 'shared';
  metadata: Omit<TripProposal, 'waypoints' | 'title'>;
  waypoints: Waypoint[];
  cover_photo: string | null;
  created_at: string;
  updated_at: string;
}
