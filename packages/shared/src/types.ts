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

/** Type d'une activité dans une journée de trip. */
export type ActivityType = 'hike' | 'drive' | 'visit' | 'meal' | 'camp' | 'rest';

export type TimeOfDay = 'morning' | 'afternoon' | 'evening';

/** Mode de déplacement d'un segment routé (profils GraphHopper). */
export type SegmentMode = 'car' | 'foot' | 'bike';

/**
 * Une activité d'une journée : le grain fin du trip (édition, budget, CO₂).
 * Les waypoints[] historiques restent dérivables des activités.
 */
export interface TripActivity {
  type: ActivityType;
  time_of_day: TimeOfDay;
  title: string;
  lat: number;
  lng: number;
  description?: string | undefined;
  duration_min?: number | undefined;
  distance_km?: number | undefined;
  elevation_gain_m?: number | undefined;
  /** Estimation de coût en EUR (activité payante, nuit, repas). */
  cost_estimate?: number | undefined;
  /** Lien vers la base de lieux (table places) quand l'activité y est ancrée. */
  place_id?: string | undefined;
}

/**
 * Segment de déplacement entre deux activités, routé par GraphHopper (0.2).
 * Sans routing disponible : distance/durée estimées par le LLM, routed=false.
 */
export interface TripSegment {
  /** Coordonnées GeoJSON [lng, lat][] de la géométrie routée. */
  geometry?: [number, number][] | undefined;
  distance_km: number;
  duration_min: number;
  mode: SegmentMode;
  /** true = valeurs issues du routing réel, false/absent = estimation LLM. */
  routed?: boolean | undefined;
  elevation_gain_m?: number | undefined;
  fuel_cost?: number | undefined;
  co2_kg?: number | undefined;
}

/** Une journée du trip : activités ordonnées + segments de déplacement. */
export interface TripDay {
  day: number;
  title: string;
  start_location?: string | undefined;
  end_location?: string | undefined;
  activities: TripActivity[];
  segments?: TripSegment[] | undefined;
  /** Photo réelle de l'étape (Unsplash/Pexels) — posée côté serveur (2.3). */
  photo_url?: string | undefined;
}

/** Fourchette de coût en EUR [min, max]. */
export type EurRange = [number, number];

/**
 * Budget itemisé d'un trip (roadmap 1.3) — heuristiques ajustables, carburant
 * depuis les segments routés + prix pays. Fourchettes assumées : jamais de
 * fausse précision.
 */
export interface TripBudget {
  fuel_eur: number;
  /** Péages/vignettes — heuristique « à confirmer sur place ». */
  tolls_eur: EurRange;
  nights_eur: EurRange;
  meals_eur: EurRange;
  /** Somme des cost_estimate d'activités (hors nuits). */
  activities_eur: number;
  total_eur: EurRange;
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
  /** Structure jours → activités (roadmap 0.1). Absente sur les anciens trips. */
  days?: TripDay[] | undefined;
  /** CO₂e total estimé (ADEME Base Carbone, well-to-wheel) — roadmap 1.2. */
  co2_kg?: number | undefined;
  /** Budget itemisé estimé — roadmap 1.3. */
  budget?: TripBudget | undefined;
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
  | 'restaurant'
  | 'cafe'
  | 'bar'
  | 'fast_food'
  | 'poi';

/** Types food — exclus de la shortlist de grounding des trips (bruit), mais
 * interrogeables via « search this area » (phase 4). */
export const FOOD_KINDS: readonly PlaceKind[] = ['restaurant', 'cafe', 'bar', 'fast_food'];

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
  metadata: Omit<TripProposal, 'waypoints' | 'title' | 'days'>;
  waypoints: Waypoint[];
  /** Structure jours → activités. null sur les trips antérieurs à la migration 0003. */
  days: TripDay[] | null;
  cover_photo: string | null;
  created_at: string;
  updated_at: string;
}
