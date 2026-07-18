import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Trip } from '@triptic/shared';
import { fetchPublicTrip } from '../lib/api';
import { MapView } from '../components/MapView';

/** Page publique /trip/:slug — accessible sans compte (acquisition). */
export function PublicTrip() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const [trip, setTrip] = useState<Trip | null | 'loading'>('loading');

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

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-1">
        <p className="font-mono text-xs uppercase tracking-widest text-ridge">
          TRIPTIC — {t('app.tagline')}
        </p>
        <h1 className="font-display text-3xl font-bold text-trail">{trip.title}</h1>
      </header>
      <MapView waypoints={trip.waypoints} />
      <Link
        to="/"
        className="glow-cta self-start rounded-xl bg-gold px-5 py-3 text-sm font-bold text-trail transition-all duration-200 hover:-translate-y-0.5 hover:bg-gold-deep"
      >
        {t('home.cta')}
      </Link>
    </main>
  );
}
