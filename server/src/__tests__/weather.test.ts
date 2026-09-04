import { describe, expect, it, vi } from 'vitest';
import type { TripActivity } from '@triptic/shared';
import {
  weatherAlertsForDay,
  WeatherService,
  type DayForecast,
} from '../services/weather.js';

const HIKE: TripActivity = { type: 'hike', time_of_day: 'morning', title: 'Hohneck', lat: 48.04, lng: 7.01 };
const CAMP: TripActivity = { type: 'camp', time_of_day: 'evening', title: 'Bivouac', lat: 48.02, lng: 7.03 };
const DRIVE: TripActivity = { type: 'drive', time_of_day: 'morning', title: 'Col', lat: 48.06, lng: 7.02 };

function forecast(overrides: Partial<DayForecast> = {}): DayForecast {
  return {
    date: '2026-08-01',
    weather_code: 1,
    temp_min_c: 12,
    temp_max_c: 24,
    precipitation_mm: 0,
    precipitation_probability: 10,
    wind_max_kmh: 15,
    hours: [],
    ...overrides,
  };
}

describe('weatherAlertsForDay (alertes proactives sur activités)', () => {
  it('beau temps → aucune alerte', () => {
    expect(weatherAlertsForDay(forecast(), [HIKE, CAMP])).toEqual([]);
  });

  it('orage sur journée extérieure → danger', () => {
    const alerts = weatherAlertsForDay(forecast({ weather_code: 95 }), [HIKE]);
    expect(alerts).toEqual([{ code: 'thunderstorm', severity: 'danger' }]);
  });

  it('pluie soutenue sur rando → warning (mais pas sans rando)', () => {
    const wet = forecast({ precipitation_probability: 85, precipitation_mm: 12 });
    expect(weatherAlertsForDay(wet, [HIKE])).toEqual([
      { code: 'rain_on_hike', severity: 'warning' },
    ]);
    expect(weatherAlertsForDay(wet, [DRIVE])).toEqual([]);
  });

  it('canicule sur rando, nuit glaciale en camp, neige sur la route', () => {
    expect(weatherAlertsForDay(forecast({ temp_max_c: 35 }), [HIKE])).toEqual([
      { code: 'heat_on_hike', severity: 'warning' },
    ]);
    expect(weatherAlertsForDay(forecast({ temp_min_c: -8 }), [CAMP])).toEqual([
      { code: 'cold_camp', severity: 'warning' },
    ]);
    expect(weatherAlertsForDay(forecast({ weather_code: 73 }), [DRIVE])).toEqual([
      { code: 'snow_on_route', severity: 'danger' },
    ]);
  });

  it('vent fort : danger avec rando, warning sinon', () => {
    expect(weatherAlertsForDay(forecast({ wind_max_kmh: 80 }), [HIKE])[0]).toEqual({
      code: 'strong_wind',
      severity: 'danger',
    });
    expect(weatherAlertsForDay(forecast({ wind_max_kmh: 80 }), [CAMP])[0]).toEqual({
      code: 'strong_wind',
      severity: 'warning',
    });
  });
});

describe('WeatherService', () => {
  const OPEN_METEO_BODY = {
    daily: {
      time: ['2026-08-01'],
      weather_code: [61],
      temperature_2m_max: [21.4],
      temperature_2m_min: [11.8],
      precipitation_sum: [7.35],
      precipitation_probability_max: [80],
      wind_speed_10m_max: [23.6],
    },
    hourly: {
      time: ['2026-08-01T05:00', '2026-08-01T06:00', '2026-08-01T14:00', '2026-08-01T22:00'],
      weather_code: [1, 2, 61, 3],
      temperature_2m: [9.6, 11.2, 20.7, 14.1],
      precipitation_probability: [0, 10, 80, 30],
      wind_speed_10m: [5.2, 8.9, 19.4, 12.0],
    },
  };

  function tomorrow(): string {
    return new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  }

  it('parse la prévision quotidienne et met en cache', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(OPEN_METEO_BODY)));
    const service = new WeatherService('https://api.open-meteo.com', fetchMock as unknown as typeof fetch);
    const date = tomorrow();
    const result = await service.dayForecast(48.04, 7.01, date);
    expect(result).toMatchObject({
      date,
      weather_code: 61,
      temp_min_c: 12,
      temp_max_c: 21,
      precipitation_mm: 7.4,
      precipitation_probability: 80,
      wind_max_kmh: 24,
    });
    await service.dayForecast(48.04, 7.01, date);
    expect(fetchMock).toHaveBeenCalledTimes(1); // cache
    // Heure par heure (PL.11) : la fenêtre 6 h → 21 h seulement, arrondie
    expect(result?.hours).toEqual([
      { hour: 6, weather_code: 2, temp_c: 11, precipitation_probability: 10, wind_kmh: 9 },
      { hour: 14, weather_code: 61, temp_c: 21, precipitation_probability: 80, wind_kmh: 19 },
    ]);
    expect(String((fetchMock.mock.calls as unknown[][])[0]?.[0])).toContain('hourly=');
  });

  it('sans bloc horaire : la journée reste valable, heures vides', async () => {
    const body = { daily: OPEN_METEO_BODY.daily };
    const service = new WeatherService(
      'https://api.open-meteo.com',
      vi.fn(async () => new Response(JSON.stringify(body))) as unknown as typeof fetch,
    );
    const result = await service.dayForecast(48.1, 7.1, tomorrow());
    expect(result?.hours).toEqual([]);
  });

  it('null hors horizon (passé ou > 16 jours) sans appel réseau', async () => {
    const fetchMock = vi.fn(async () => new Response('{}'));
    const service = new WeatherService('https://api.open-meteo.com', fetchMock as unknown as typeof fetch);
    expect(await service.dayForecast(48, 7, '2020-01-01')).toBeNull();
    const farAway = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);
    expect(await service.dayForecast(48, 7, farAway)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('null en erreur réseau (jamais bloquant)', async () => {
    const service = new WeatherService(
      'https://api.open-meteo.com',
      vi.fn(async () => {
        throw new Error('down');
      }) as unknown as typeof fetch,
    );
    expect(await service.dayForecast(48, 7, tomorrow())).toBeNull();
  });
});
