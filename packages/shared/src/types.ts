export type TripMode = 'roadtrip' | 'trek' | 'bikepacking';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type GroupType = 'solo' | 'couple' | 'group' | 'family';
export type Vehicle = 'van' | 'car' | 'moto' | 'none';
export type Budget = 'low' | 'medium' | 'high';
export type Lang = 'fr' | 'en' | 'de';

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
