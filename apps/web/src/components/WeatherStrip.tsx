import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  Lock,
  Sun,
  Wind,
} from 'lucide-react';
import { PLANS, type PlanId, type TripProposal } from '@triptic/shared';
import { fetchTripWeather, type WeatherDayPayload } from '../lib/api';

/**
 * Météo du parcours (Open-Meteo) + alertes PROACTIVES : chaque jour du trip
 * est croisé avec ses activités planifiées — l'utilisateur est prévenu ici
 * avant de partir (orage sur rando, canicule, neige sur la route…).
 * Feature Aventurier+ (weather_integration) : teaser verrouillé en gratuit.
 */

/** Icône WMO — partagée avec la bande horaire de la fiche d'étape. */
export function WeatherIcon({ code, size = 18 }: { code: number; size?: number }) {
  const cls = 'text-ridge';
  if (code >= 95) return <CloudLightning size={size} className="text-storm" aria-hidden="true" />;
  if ((code >= 71 && code <= 77) || code === 85 || code === 86)
    return <CloudSnow size={size} className={cls} aria-hidden="true" />;
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82))
    return <CloudRain size={size} className={cls} aria-hidden="true" />;
  if (code === 45 || code === 48) return <CloudFog size={size} className={cls} aria-hidden="true" />;
  if (code === 3) return <Cloud size={size} className={cls} aria-hidden="true" />;
  if (code === 2) return <CloudSun size={size} className={cls} aria-hidden="true" />;
  return <Sun size={size} className="text-gold-deep" aria-hidden="true" />;
}

interface Props {
  trip: TripProposal;
  plan: PlanId;
  /** Les prévisions chargées — la fiche d'étape (PL.11) s'en sert pour son heure par heure. */
  onLoaded?: ((days: WeatherDayPayload[]) => void) | undefined;
}

export function WeatherStrip({ trip, plan, onLoaded }: Props) {
  const { t, i18n } = useTranslation();
  const [days, setDays] = useState<WeatherDayPayload[] | null>(null);
  const [failed, setFailed] = useState(false);
  const gated = !PLANS[plan].limits.weather_integration;

  const startDate = trip.start_date;
  const tripDays = trip.days;

  useEffect(() => {
    if (gated || !startDate || !tripDays?.length) return;
    let cancelled = false;
    fetchTripWeather(startDate, tripDays, plan)
      .then((payload) => {
        if (cancelled) return;
        if (payload) {
          setDays(payload.days);
          onLoaded?.(payload.days);
        } else setFailed(true);
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gated, startDate, tripDays, plan]);

  if (!startDate || !tripDays?.length) return null;

  if (gated) {
    return (
      <p className="flex items-center gap-2 border border-mist bg-terrain px-4 py-3 text-sm text-ridge">
        <Lock size={15} aria-hidden="true" />
        {t('weather.locked')}
      </p>
    );
  }
  if (failed || !days) return null;

  const alerts = days.flatMap((d) =>
    d.alerts.map((alert) => ({ ...alert, day: d.day, date: d.date })),
  );

  return (
    <section aria-labelledby="weather-title" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between border-b border-mist pb-2">
        <h2 id="weather-title" className="label-mono text-fog">
          {t('weather.title')}
        </h2>
        <span className="label-mono text-fog">{t('weather.horizon')}</span>
      </div>

      {alerts.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {alerts.map((alert, i) => (
            <li
              key={`${alert.day}-${alert.code}-${i}`}
              role="alert"
              className={`flex items-center gap-2 border px-4 py-2.5 text-sm font-semibold ${
                alert.severity === 'danger'
                  ? 'border-storm-deep bg-storm-tint text-storm-deep'
                  : 'border-amber-deep bg-amber-tint text-amber-deep'
              }`}
            >
              <AlertTriangle size={16} aria-hidden="true" />
              <span>
                {t('trips.day')} {alert.day} — {t(`weather.alert_${alert.code}`)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <ol className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {days.map((d) => (
          <li
            key={d.day}
            className="flex min-w-[7.5rem] shrink-0 snap-start flex-col gap-1 border border-mist bg-snow px-3 py-2.5"
          >
            <span className="label-mono text-copper-deep">
              {t('trips.day')} {d.day}
              {d.date && (
                <span className="ml-1 font-normal text-fog">
                  {new Date(`${d.date}T12:00:00`).toLocaleDateString(i18n.language, {
                    day: 'numeric',
                    month: 'short',
                  })}
                </span>
              )}
            </span>
            {d.forecast ? (
              <>
                <span className="flex items-center gap-2">
                  <WeatherIcon code={d.forecast.weather_code} />
                  <span className="font-display text-lg font-semibold text-trail">
                    {d.forecast.temp_min_c}° / {d.forecast.temp_max_c}°
                  </span>
                </span>
                <span className="flex items-center gap-2 text-xs text-fog">
                  <span className="flex items-center gap-0.5">
                    <Droplets size={12} aria-hidden="true" />
                    {d.forecast.precipitation_probability}%
                  </span>
                  <span className="flex items-center gap-0.5">
                    <Wind size={12} aria-hidden="true" />
                    {d.forecast.wind_max_kmh} km/h
                  </span>
                </span>
              </>
            ) : (
              <span className="text-xs text-fog">{t('weather.too_far')}</span>
            )}
          </li>
        ))}
      </ol>
      <p className="label-mono text-fog">{t('weather.source')}</p>
    </section>
  );
}
