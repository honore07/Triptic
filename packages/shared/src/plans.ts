import type { Lang, TripMode } from './types.js';

export type PlanId = 'free' | 'aventurier' | 'explorateur';

export interface PlanLimits {
  ai_trips_per_month: number;
  modes: TripMode[];
  offline_regions: number;
  gpx_export: boolean;
  public_share: boolean;
  trip_proposals: 1 | 3;
  weather_integration?: boolean;
  garmin_wahoo_sync?: boolean;
}

export interface Plan {
  id: PlanId;
  name: Record<Lang, string>;
  price_eur_year: number;
  stripe_price_id?: string;
  revenuecat_id?: string;
  limits: PlanLimits;
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: 'free',
    name: { fr: 'Explorer', en: 'Explorer', de: 'Entdecker' },
    price_eur_year: 0,
    limits: {
      ai_trips_per_month: 3,
      modes: ['roadtrip'],
      offline_regions: 0,
      gpx_export: false,
      public_share: true,
      trip_proposals: 1,
    },
  },
  aventurier: {
    id: 'aventurier',
    name: { fr: 'Aventurier', en: 'Adventurer', de: 'Abenteurer' },
    price_eur_year: 29,
    revenuecat_id: 'triptic_aventurier_annual',
    limits: {
      ai_trips_per_month: Number.POSITIVE_INFINITY,
      modes: ['roadtrip', 'trek', 'bikepacking'],
      offline_regions: 5,
      gpx_export: true,
      public_share: true,
      trip_proposals: 3,
      weather_integration: true,
    },
  },
  explorateur: {
    id: 'explorateur',
    name: { fr: 'Explorateur', en: 'Explorer Pro', de: 'Profi-Entdecker' },
    price_eur_year: 49,
    revenuecat_id: 'triptic_explorateur_annual',
    limits: {
      ai_trips_per_month: Number.POSITIVE_INFINITY,
      modes: ['roadtrip', 'trek', 'bikepacking'],
      offline_regions: Number.POSITIVE_INFINITY,
      gpx_export: true,
      public_share: true,
      trip_proposals: 3,
      weather_integration: true,
      garmin_wahoo_sync: true,
    },
  },
};
