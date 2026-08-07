import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fetchTrip } from '../lib/api';
import { useTripStore } from '../store/tripStore';
import { useUserStore } from '../store/userStore';
import { TripPage } from './Trip';

/**
 * Page /trips/:id — charge un trip sauvegardé (GET /api/trips/:id), hydrate
 * le tripStore puis réutilise la vue Trip existante (zéro duplication d'UI).
 */
export function SavedTrip() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const plan = useUserStore((s) => s.plan);
  const hydrate = useTripStore((s) => s.hydrate);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');

  useEffect(() => {
    if (!id) {
      setState('missing');
      return;
    }
    let cancelled = false;
    setState('loading');
    fetchTrip(id, plan)
      .then((trip) => {
        if (cancelled) return;
        if (trip) {
          hydrate(trip);
          setState('ready');
        } else {
          setState('missing');
        }
      })
      .catch(() => {
        if (!cancelled) setState('missing');
      });
    return () => {
      cancelled = true;
    };
  }, [id, plan, hydrate]);

  if (state === 'loading') {
    return (
      <main role="status" className="mx-auto max-w-3xl px-4 py-12 text-center">
        <p className="text-ridge">{t('my_trips.loading')}</p>
      </main>
    );
  }

  if (state === 'missing') {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12 text-center">
        <p className="text-ridge">{t('trips.not_found')}</p>
        <Link to="/trips" className="mt-4 inline-block font-semibold text-copper-deep underline">
          {t('my_trips.nav')}
        </Link>
      </main>
    );
  }

  return <TripPage />;
}
