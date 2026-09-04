import type { TripActivity } from '@triptic/shared';
import { logger } from '../logger.js';

/**
 * Météo sur le trip (Open-Meteo, gratuit sans clé — CLAUDE.md §7) et alertes
 * PROACTIVES : on croise la prévision de chaque jour avec les activités
 * planifiées (rando sous orage, canicule, vent fort, nuit glaciale en
 * camping…) pour prévenir l'utilisateur AVANT qu'il parte.
 * Prévisions fiables jusqu'à ~16 jours ; au-delà : pas de données (l'UI
 * affiche « trop loin pour une prévision »).
 */

/** Une heure de la journée (fenêtre 6 h → 21 h, celle où l'on est dehors). */
export interface HourForecast {
  /** Heure locale, 0-23. */
  hour: number;
  weather_code: number;
  temp_c: number;
  precipitation_probability: number;
  wind_kmh: number;
}

export interface DayForecast {
  date: string;
  weather_code: number;
  temp_min_c: number;
  temp_max_c: number;
  precipitation_mm: number;
  precipitation_probability: number;
  wind_max_kmh: number;
  /** Heure par heure (PL.11) — vide si l'API ne l'a pas fournie. */
  hours: HourForecast[];
}

export type WeatherAlertCode =
  | 'thunderstorm'
  | 'rain_on_hike'
  | 'strong_wind'
  | 'heat_on_hike'
  | 'cold_camp'
  | 'snow_on_route';

export interface WeatherAlert {
  code: WeatherAlertCode;
  severity: 'warning' | 'danger';
}

/** Horizon de prévision Open-Meteo (jours). */
export const FORECAST_HORIZON_DAYS = 16;

const REQUEST_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 h — politesse envers l'API gratuite
const CACHE_MAX = 500;

interface OpenMeteoDaily {
  time: string[];
  weather_code: number[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
  precipitation_sum: number[];
  precipitation_probability_max: (number | null)[];
  wind_speed_10m_max: number[];
}

interface OpenMeteoHourly {
  time: string[];
  weather_code: (number | null)[];
  temperature_2m: (number | null)[];
  precipitation_probability: (number | null)[];
  wind_speed_10m: (number | null)[];
}

/** Fenêtre horaire affichée : de 6 h à 21 h, là où la journée se joue. */
const HOUR_FROM = 6;
const HOUR_TO = 21;

function hoursOf(hourly: OpenMeteoHourly | undefined): HourForecast[] {
  if (!hourly) return [];
  const out: HourForecast[] = [];
  hourly.time.forEach((stamp, i) => {
    const hour = Number(stamp.slice(11, 13));
    if (!Number.isFinite(hour) || hour < HOUR_FROM || hour > HOUR_TO) return;
    out.push({
      hour,
      weather_code: hourly.weather_code[i] ?? 0,
      temp_c: Math.round(hourly.temperature_2m[i] ?? 0),
      precipitation_probability: hourly.precipitation_probability[i] ?? 0,
      wind_kmh: Math.round(hourly.wind_speed_10m[i] ?? 0),
    });
  });
  return out;
}

export class WeatherService {
  private readonly cache = new Map<string, { at: number; forecast: DayForecast }>();

  constructor(
    private readonly baseUrl = 'https://api.open-meteo.com',
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  /**
   * Prévision quotidienne pour un point et une date. null si hors horizon,
   * dans le passé, ou API indisponible (jamais bloquant).
   */
  async dayForecast(lat: number, lng: number, date: string): Promise<DayForecast | null> {
    const today = new Date().toISOString().slice(0, 10);
    const horizon = new Date(Date.now() + FORECAST_HORIZON_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10);
    if (date < today || date > horizon) return null;

    const key = `${lat.toFixed(2)},${lng.toFixed(2)}:${date}`;
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.forecast;

    try {
      const params = new URLSearchParams({
        latitude: lat.toFixed(4),
        longitude: lng.toFixed(4),
        daily:
          'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max',
        hourly: 'weather_code,temperature_2m,precipitation_probability,wind_speed_10m',
        timezone: 'auto',
        start_date: date,
        end_date: date,
      });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const response = await this.fetchImpl(`${this.baseUrl}/v1/forecast?${params}`, {
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!response.ok) return null;
      const body = (await response.json()) as { daily?: OpenMeteoDaily; hourly?: OpenMeteoHourly };
      const daily = body.daily;
      if (!daily || daily.time.length === 0) return null;
      const forecast: DayForecast = {
        date,
        weather_code: daily.weather_code[0] ?? 0,
        temp_min_c: Math.round(daily.temperature_2m_min[0] ?? 0),
        temp_max_c: Math.round(daily.temperature_2m_max[0] ?? 0),
        precipitation_mm: Math.round((daily.precipitation_sum[0] ?? 0) * 10) / 10,
        precipitation_probability: daily.precipitation_probability_max[0] ?? 0,
        wind_max_kmh: Math.round(daily.wind_speed_10m_max[0] ?? 0),
        hours: hoursOf(body.hourly),
      };
      if (this.cache.size >= CACHE_MAX) {
        const oldest = this.cache.keys().next().value;
        if (oldest !== undefined) this.cache.delete(oldest);
      }
      this.cache.set(key, { at: Date.now(), forecast });
      return forecast;
    } catch (error) {
      logger.warn({ error }, 'Open-Meteo unreachable');
      return null;
    }
  }
}

/** Codes WMO : 95-99 orage, 71-77/85-86 neige. */
const THUNDER_CODES = [95, 96, 99];
const SNOW_CODES = [71, 73, 75, 77, 85, 86];

/**
 * Alertes proactives : prévision du jour × activités planifiées.
 * Règles volontairement franches (peu d'alertes, mais fiables).
 */
export function weatherAlertsForDay(
  forecast: DayForecast,
  activities: TripActivity[],
): WeatherAlert[] {
  const alerts: WeatherAlert[] = [];
  const hasHike = activities.some((a) => a.type === 'hike');
  const hasDrive = activities.some((a) => a.type === 'drive');
  const hasCamp = activities.some((a) => a.type === 'camp');
  const outdoor = hasHike || hasCamp || activities.some((a) => a.type === 'visit');

  if (THUNDER_CODES.includes(forecast.weather_code) && outdoor) {
    alerts.push({ code: 'thunderstorm', severity: 'danger' });
  }
  if (
    hasHike &&
    forecast.precipitation_probability >= 70 &&
    forecast.precipitation_mm >= 5 &&
    !THUNDER_CODES.includes(forecast.weather_code)
  ) {
    alerts.push({ code: 'rain_on_hike', severity: 'warning' });
  }
  if (forecast.wind_max_kmh >= 70 && outdoor) {
    alerts.push({ code: 'strong_wind', severity: hasHike ? 'danger' : 'warning' });
  }
  if (hasHike && forecast.temp_max_c >= 32) {
    alerts.push({ code: 'heat_on_hike', severity: 'warning' });
  }
  if (hasCamp && forecast.temp_min_c <= -5) {
    alerts.push({ code: 'cold_camp', severity: 'warning' });
  }
  if (SNOW_CODES.includes(forecast.weather_code) && (hasDrive || hasHike)) {
    alerts.push({ code: 'snow_on_route', severity: 'danger' });
  }
  return alerts;
}
