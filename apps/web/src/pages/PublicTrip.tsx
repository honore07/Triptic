import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Trip } from '@triptic/shared';
import { fetchPublicTrip } from '../lib/api';
import { formatDistance, formatElevation } from '../lib/units';
import { useProfileStore } from '../store/profileStore';
import { DayCards } from '../components/DayCards';
import { DifficultyBadge } from '../components/DifficultyBadge';
import { LogoVire } from '../components/LogoVire';
import { MapView } from '../components/MapView';
import { RoutePreview } from '../components/RoutePreview';
import { MAP_COLORS } from '../lib/mapColors';

/**
 * Page publique /trip/:slug — accessible sans compte (acquisition).
 * Une épreuve à offrir : la photo réelle de la vire plein cadre avec le
 * relevé posé sur l'encre, la carte, le programme en planches, et la
 * plaque qui invite à tracer la sienne. Même vocabulaire que l'itinéraire,
 * sans aucune action d'édition.
 */
export function PublicTrip() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const units = useProfileStore((s) => s.units);
  const [trip, setTrip] = useState<Trip | null | 'loading'>('loading');
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  useEffect(() => {
    if (!slug) return;
    void fetchPublicTrip(slug).then(setTrip);
  }, [slug]);

  if (trip === 'loading') {
    return (
      <main className="px-4 py-12 text-center" role="status">
        <span className="label-mono text-fog">{t('public.loading')}</span>
      </main>
    );
  }
  if (!trip) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12 text-center">
        <p className="text-ridge">{t('trips.not_found')}</p>
        <Link to="/" className="mt-4 inline-block font-semibold text-copper-deep underline">
          VIRE
        </Link>
      </main>
    );
  }

  const meta = trip.metadata;
  const releve = [
    Number.isFinite(meta.duration_days)
      ? { label: t('trips.days'), value: t('trips.days_count', { count: meta.duration_days }) }
      : null,
    Number.isFinite(meta.distance_km)
      ? { label: t('trips.distance'), value: formatDistance(meta.distance_km, units) }
      : null,
    Number.isFinite(meta.elevation_gain_m)
      ? { label: t('trips.elevation'), value: formatElevation(meta.elevation_gain_m, units) }
      : null,
    Number.isFinite(meta.daily_distance_km)
      ? { label: t('trips.per_day'), value: formatDistance(meta.daily_distance_km, units) }
      : null,
  ].filter((x): x is { label: string; value: string } => x !== null);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6">
      {/* L'épreuve : photo réelle plein cadre, ou le tracé sur l'encre */}
      <header className="hero-open ink-reveal relative -mx-4 overflow-hidden border-y border-mist bg-trail text-cloud sm:mx-0 sm:border">
        <div aria-hidden="true" className="absolute inset-0">
          {trip.cover_photo ? (
            <img
              src={trip.cover_photo}
              alt=""
              fetchPriority="high"
              className="hero-drift h-full w-full object-cover"
            />
          ) : (
            <RoutePreview
              waypoints={trip.waypoints}
              className="h-full w-full p-10 opacity-60"
              stroke={MAP_COLORS.gold}
            />
          )}
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(17,17,17,0.45)_0%,rgba(17,17,17,0.10)_30%,rgba(17,17,17,0.55)_60%,rgba(17,17,17,0.94)_100%)]" />
        </div>

        <div className="relative flex min-h-[22rem] flex-col justify-end gap-4 p-4 sm:min-h-[28rem] sm:p-6">
          <div className="absolute inset-x-4 top-4 flex items-center justify-between sm:inset-x-6 sm:top-5">
            <p className="label-mono border border-cloud/30 bg-trail/80 px-2.5 py-1 text-cloud">
              {t('public.plate')}
            </p>
            <div className="flex items-center gap-2">
              <span className="label-mono border border-cloud/30 bg-trail/80 px-2 py-1 text-gold">
                {t(`mode.${trip.mode}`)}
              </span>
              {meta.difficulty && <DifficultyBadge level={meta.difficulty} />}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <h1 className="font-display text-3xl font-semibold leading-tight text-cloud sm:text-5xl">
              {trip.title}
            </h1>
            {meta.summary && (
              <p className="max-w-2xl font-display text-base italic leading-snug text-sky sm:text-lg">
                {meta.summary}
              </p>
            )}
          </div>

          {releve.length > 0 && (
            <dl className="grid grid-cols-2 divide-cloud/25 border-y border-cloud/30 sm:grid-cols-4 sm:divide-x">
              {releve.map(({ label, value }) => (
                <div key={label} className="flex flex-col gap-0.5 px-2.5 py-2.5">
                  <dt className="label-mono text-cloud/65">{label}</dt>
                  <dd className="font-display text-xl font-semibold leading-none text-cloud">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </header>

      <MapView
        waypoints={trip.waypoints}
        days={trip.days ?? undefined}
        selectedDay={selectedDay}
        onSelectDay={setSelectedDay}
      />

      {trip.days && trip.days.length > 0 && (
        <DayCards days={trip.days} selectedDay={selectedDay} onSelectDay={setSelectedDay} />
      )}

      {/* La plaque d'invitation : ce que VIRE fait, et la porte pour le faire */}
      <section className="ink-reveal flex flex-col gap-4 border border-mist bg-snow p-5 sm:flex-row sm:items-center sm:gap-6">
        <LogoVire size={64} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="label-mono text-fog">{t('app.name')} — {t('app.tagline')}</p>
          <p className="font-display text-2xl font-semibold leading-tight text-trail">
            {t('public.pitch')}
          </p>
        </div>
        <Link to="/" className="cta-plate flex min-h-13 items-center justify-center px-6 py-4">
          {t('public.cta')}
        </Link>
      </section>
    </main>
  );
}
