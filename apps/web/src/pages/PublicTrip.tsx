import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Trip } from '@triptic/shared';
import { fetchPublicTrip } from '../lib/api';
import { DayCards } from '../components/DayCards';
import { DifficultyBadge } from '../components/DifficultyBadge';
import { MapView } from '../components/MapView';

/**
 * Page publique /trip/:slug — accessible sans compte (acquisition).
 * Affiche l'essentiel du trip partagé : photo de couverture, résumé,
 * métadonnées (durée, distance, D+, difficulté), carte et programme
 * jour par jour (lecture seule).
 */
export function PublicTrip() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const [trip, setTrip] = useState<Trip | null | 'loading'>('loading');
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  useEffect(() => {
    if (!slug) return;
    void fetchPublicTrip(slug).then(setTrip);
  }, [slug]);

  if (trip === 'loading') {
    return <main className="px-4 py-12 text-center text-ridge">…</main>;
  }
  if (!trip) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12 text-center">
        <p className="text-ridge">{t('trips.not_found')}</p>
        <Link to="/" className="mt-4 inline-block font-semibold text-copper-deep underline">
          TRIPTIC
        </Link>
      </main>
    );
  }

  const meta = trip.metadata;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-2">
        <p className="font-mono text-xs uppercase tracking-widest text-ridge">
          TRIPTIC — {t('app.tagline')}
        </p>
        <div className="flex items-center gap-2">
          <span className="rounded-badge bg-summit/10 px-2 py-0.5 text-xs font-semibold text-copper-deep">
            {t(`mode.${trip.mode}`)}
          </span>
          {meta.difficulty && <DifficultyBadge level={meta.difficulty} />}
        </div>
        <h1 className="font-display text-3xl font-bold text-trail">{trip.title}</h1>
        {meta.summary && <p className="text-sm text-ridge">{meta.summary}</p>}
        <p className="font-mono text-xs text-ridge">
          {[
            Number.isFinite(meta.duration_days)
              ? `${meta.duration_days} ${t('trips.days')}`
              : null,
            Number.isFinite(meta.distance_km) ? `${Math.round(meta.distance_km)} km` : null,
            Number.isFinite(meta.elevation_gain_m)
              ? `${t('trips.elevation')} ${Math.round(meta.elevation_gain_m)} m`
              : null,
            Number.isFinite(meta.daily_distance_km)
              ? `${Math.round(meta.daily_distance_km)} km ${t('trips.per_day')}`
              : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </header>

      {trip.cover_photo && (
        <img
          src={trip.cover_photo}
          alt=""
          aria-hidden="true"
          loading="lazy"
          className="h-56 w-full rounded-trip object-cover sm:h-72"
        />
      )}

      <MapView
        waypoints={trip.waypoints}
        days={trip.days ?? undefined}
        selectedDay={selectedDay}
        onSelectDay={setSelectedDay}
      />

      {trip.days && trip.days.length > 0 && (
        <DayCards days={trip.days} selectedDay={selectedDay} onSelectDay={setSelectedDay} />
      )}

      <Link
        to="/"
        className="glow-cta self-start rounded-xl bg-gold px-5 py-3 text-sm font-bold text-trail transition-all duration-200 hover:-translate-y-0.5 hover:bg-gold-deep"
      >
        {t('home.cta')}
      </Link>
    </main>
  );
}
