import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Clock, Route } from 'lucide-react';
import type { Trip } from '@triptic/shared';
import { listTrips } from '../lib/api';
import { supabase } from '../lib/supabase';
import { useUserStore } from '../store/userStore';

type FetchState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; trips: Trip[] };

/** Styles des badges de statut — contrastes ≥ 4.5:1 (tints de styles.css). */
const STATUS_STYLES: Record<Trip['status'], string> = {
  draft: 'bg-terrain text-ridge',
  saved: 'bg-pine-tint text-pine-deep',
  shared: 'bg-sky text-trail',
};

/**
 * Page /trips — « Mes trips » : tous les trips de l'utilisateur (brouillons
 * auto-sauvegardés inclus), en cartes cliquables vers /trips/:id.
 */
export function MyTrips() {
  const { t, i18n } = useTranslation();
  const plan = useUserStore((s) => s.plan);
  const email = useUserStore((s) => s.email);
  const [state, setState] = useState<FetchState>({ status: 'loading' });
  // Auth configurée + déconnecté : proposer la connexion plutôt qu'un 401
  const needsLogin = Boolean(supabase) && !email;

  const load = useCallback(() => {
    if (Boolean(supabase) && !useUserStore.getState().email) {
      setState({ status: 'ready', trips: [] });
      return;
    }
    setState({ status: 'loading' });
    listTrips(plan)
      .then((trips) =>
        setState({
          status: 'ready',
          // Les plus récents d'abord (dates ISO : tri lexicographique valide)
          trips: [...trips].sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
        }),
      )
      .catch(() => setState({ status: 'error' }));
  }, [plan, email]);

  useEffect(load, [load]);

  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(iso));

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-1">
        <h1 className="fade-up font-display text-2xl font-bold text-trail">
          {t('my_trips.title')}
        </h1>
        <p className="text-sm text-ridge">{t('my_trips.hint')}</p>
      </header>

      {needsLogin && (
        <p className="rounded-xl bg-terrain px-4 py-3 text-sm text-ridge">
          {t('auth.required_generation')}{' '}
          <Link to="/login" className="font-semibold text-copper-deep underline">
            {t('auth.login_nav')}
          </Link>
        </p>
      )}

      {!needsLogin && state.status === 'loading' && (
        <div role="status" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <span className="sr-only">{t('my_trips.loading')}</span>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              aria-hidden="true"
              className="h-56 animate-pulse rounded-trip bg-terrain"
            />
          ))}
        </div>
      )}

      {state.status === 'error' && (
        <div className="flex flex-col items-start gap-3">
          <p role="alert" className="rounded-xl bg-storm/10 px-4 py-3 text-sm font-semibold text-storm">
            {t('my_trips.error')}
          </p>
          <button
            type="button"
            onClick={load}
            className="flex min-h-11 items-center rounded-xl border border-mist px-4 py-2.5 text-sm font-semibold text-trail transition-colors hover:border-summit"
          >
            {t('my_trips.retry')}
          </button>
        </div>
      )}

      {state.status === 'ready' && state.trips.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-trip border border-mist bg-snow px-6 py-12 text-center">
          {/* Gravure VIRE — personnage qui cherche sa route, carte dépliée */}
          <img
            src="/vire/vire_char-carte.jpg"
            alt=""
            aria-hidden="true"
            width={112}
            height={112}
            loading="lazy"
            className="h-28 w-28 rounded-full border border-mist object-cover"
          />
          <p className="font-display text-lg font-bold text-trail">{t('my_trips.empty_title')}</p>
          <p className="max-w-md text-sm text-ridge">{t('my_trips.empty_hint')}</p>
          <Link
            to="/plan"
            className="glow-cta mt-2 rounded-xl bg-gold px-5 py-3 text-sm font-bold text-trail transition-all duration-200 hover:-translate-y-0.5 hover:bg-gold-deep"
          >
            {t('my_trips.empty_cta')}
          </Link>
        </div>
      )}

      {state.status === 'ready' && state.trips.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {state.trips.map((trip) => {
            const meta = trip.metadata;
            return (
              <li key={trip.id}>
                <Link
                  to={`/trips/${trip.id}`}
                  aria-label={t('my_trips.open', { title: trip.title })}
                  className="group flex h-full flex-col overflow-hidden rounded-trip border border-mist bg-snow shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-summit"
                >
                  {trip.cover_photo ? (
                    <img
                      src={trip.cover_photo}
                      alt=""
                      aria-hidden="true"
                      loading="lazy"
                      className="h-32 w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div
                      aria-hidden="true"
                      className="h-32 w-full bg-gradient-to-br from-ridge to-trail"
                    />
                  )}
                  <div className="flex flex-1 flex-col gap-2 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-badge bg-summit/10 px-2 py-0.5 text-xs font-semibold text-copper-deep">
                        {t(`mode.${trip.mode}`)}
                      </span>
                      <span
                        className={`rounded-badge px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[trip.status]}`}
                      >
                        {t(`my_trips.status_${trip.status}`)}
                      </span>
                    </div>
                    <h2 className="font-display text-lg font-bold leading-tight text-trail">
                      {trip.title}
                    </h2>
                    <dl className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-ridge">
                      {Number.isFinite(meta.duration_days) && (
                        <div className="flex items-center gap-1.5">
                          <Clock size={13} aria-hidden="true" />
                          <dt className="sr-only">{t('trips.days')}</dt>
                          <dd>{t('trips.days_count', { count: meta.duration_days })}</dd>
                        </div>
                      )}
                      {Number.isFinite(meta.distance_km) && (
                        <div className="flex items-center gap-1.5">
                          <Route size={13} aria-hidden="true" />
                          <dt className="sr-only">{t('trips.distance')}</dt>
                          <dd>{Math.round(meta.distance_km)} km</dd>
                        </div>
                      )}
                    </dl>
                    <p className="mt-auto text-xs text-fog">{formatDate(trip.updated_at)}</p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
