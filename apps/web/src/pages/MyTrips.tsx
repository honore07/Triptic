import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Trip, TripMode } from '@triptic/shared';
import { listTrips } from '../lib/api';
import { formatDistance, formatElevation } from '../lib/units';
import { useProfileStore } from '../store/profileStore';
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

/** Gravure de repli quand un carnet n'a pas de photo de couverture. */
const MODE_ENGRAVING: Record<string, string> = {
  roadtrip: '/vire/vire_logo-compas.webp',
  trek: '/vire/vire_pic-chaussures.jpg',
  bikepacking: '/vire/vire_pic-sac.jpg',
};

const FILTERS = ['all', 'roadtrip', 'trek', 'bikepacking'] as const;
type Filter = (typeof FILTERS)[number];

/**
 * Page /trips — planche PL.12 « CARNET DE COURSE ».
 * Ce qui est derrière soi : le cumul des vires tracées, un filtre par mode,
 * et chaque carnet en rangée de planche.
 */
export function MyTrips() {
  const { t, i18n } = useTranslation();
  const plan = useUserStore((s) => s.plan);
  const units = useProfileStore((s) => s.units);
  const email = useUserStore((s) => s.email);
  const [state, setState] = useState<FetchState>({ status: 'loading' });
  const [filter, setFilter] = useState<Filter>('all');
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
    new Intl.DateTimeFormat(i18n.language, { month: 'long', year: 'numeric' }).format(
      new Date(iso),
    );

  const all = state.status === 'ready' ? state.trips : [];
  const shown = all.filter((trip) => filter === 'all' || trip.mode === filter);

  // Cumul de tout le carnet — le filtre trie l'affichage, pas le bilan
  const totals = all.reduce(
    (acc, trip) => ({
      count: acc.count + 1,
      km: acc.km + (Number.isFinite(trip.metadata.distance_km) ? trip.metadata.distance_km : 0),
      gain:
        acc.gain +
        (Number.isFinite(trip.metadata.elevation_gain_m) ? trip.metadata.elevation_gain_m : 0),
    }),
    { count: 0, km: 0, gain: 0 },
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6">
      <div className="fade-up flex items-baseline justify-between border-b border-mist pb-2">
        <p className="label-mono text-fog">{t('my_trips.plate')}</p>
      </div>

      <h1 className="fade-up font-display text-3xl font-semibold leading-tight text-trail">
        {t('my_trips.headline')}
      </h1>

      {all.length > 0 && (
        <dl className="grid grid-cols-3 border border-mist">
          {[
            { label: t('my_trips.total_trips'), value: String(totals.count) },
            { label: t('trips.distance'), value: formatDistance(totals.km, units) },
            { label: t('trips.elevation'), value: formatElevation(totals.gain, units) },
          ].map(({ label, value }, i) => (
            <div
              key={label}
              className={`flex flex-col gap-0.5 p-2.5 ${i < 2 ? 'border-r border-mist' : ''}`}
            >
              <dt className="label-mono text-fog">{label}</dt>
              <dd className="font-display text-2xl font-semibold leading-none text-trail">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {all.length > 0 && (
        <div role="group" aria-label={t('home.mode_label')} className="flex border border-mist">
          {FILTERS.map((key, i) => (
            <button
              key={key}
              type="button"
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
              className={`min-h-11 min-w-0 flex-1 font-mono text-[10px] font-medium uppercase tracking-[0.12em] transition-colors ${
                i > 0 ? 'border-l border-mist' : ''
              } ${filter === key ? 'bg-summit text-snow' : 'bg-snow text-trail hover:bg-sky'}`}
            >
              {key === 'all' ? t('my_trips.filter_all') : t(`mode.${key as TripMode}`)}
            </button>
          ))}
        </div>
      )}

      {needsLogin && (
        <p className="border border-mist bg-terrain px-4 py-3 text-sm text-ridge">
          {t('auth.required_generation')}{' '}
          <Link to="/login" className="font-semibold text-copper-deep underline">
            {t('auth.login_nav')}
          </Link>
        </p>
      )}

      {!needsLogin && state.status === 'loading' && (
        <div role="status" className="flex flex-col gap-2">
          <span className="sr-only">{t('my_trips.loading')}</span>
          {[0, 1, 2].map((i) => (
            <div key={i} aria-hidden="true" className="h-20 animate-pulse border border-mist bg-terrain" />
          ))}
        </div>
      )}

      {state.status === 'error' && (
        <div className="flex flex-col items-start gap-3">
          <p
            role="alert"
            className="border border-storm bg-storm-tint px-4 py-3 text-sm font-semibold text-storm-deep"
          >
            {t('my_trips.error')}
          </p>
          <button type="button" onClick={load} className="cta-plate-ghost min-h-11 px-4 py-2.5">
            {t('my_trips.retry')}
          </button>
        </div>
      )}

      {state.status === 'ready' && all.length === 0 && !needsLogin && (
        <div className="flex flex-col items-center gap-3 border border-mist bg-snow px-6 py-12 text-center">
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
          <p className="font-display text-xl font-semibold text-trail">
            {t('my_trips.empty_title')}
          </p>
          <p className="max-w-md text-sm text-ridge">{t('my_trips.empty_hint')}</p>
        </div>
      )}

      {state.status === 'ready' && shown.length > 0 && (
        // Chaque carnet est une planche : la photo de couverture (le terrain)
        // en tonalité gravure, qui prend ses couleurs au survol ; le relevé
        // imprimé dessous.
        <ul className="grid gap-3 sm:grid-cols-2">
          {shown.map((trip, i) => {
            const meta = trip.metadata;
            const hasPhoto = Boolean(trip.cover_photo);
            return (
              <li
                key={trip.id}
                className="ink-reveal"
                style={{ '--i': Math.min(i, 6) } as CSSProperties}
              >
                <Link
                  to={`/trips/${trip.id}`}
                  aria-label={t('my_trips.open', { title: trip.title })}
                  className="plate-hover triptych-plate flex h-full flex-col border border-mist bg-snow text-trail"
                  style={{ minHeight: 0 }}
                >
                  <span className="relative block h-36 w-full overflow-hidden border-b border-mist bg-trail">
                    <img
                      src={trip.cover_photo ?? MODE_ENGRAVING[trip.mode] ?? MODE_ENGRAVING.roadtrip}
                      alt=""
                      aria-hidden="true"
                      loading="lazy"
                      className={`h-full w-full object-cover ${hasPhoto ? 'plate-photo' : 'opacity-90'}`}
                    />
                    <span
                      className={`label-mono absolute left-0 top-0 border-b border-r border-mist px-2 py-1 ${STATUS_STYLES[trip.status]}`}
                    >
                      {t(`my_trips.status_${trip.status}`)}
                    </span>
                  </span>
                  <span className="flex flex-1 flex-col gap-1 p-3">
                    <span className="label-mono text-fog">
                      {formatDate(trip.updated_at)} · {t(`mode.${trip.mode}`)}
                    </span>
                    <span className="line-clamp-2 font-display text-xl font-semibold leading-tight text-trail">
                      {trip.title}
                    </span>
                    <span className="mt-auto flex gap-3 pt-2 font-mono text-xs text-ridge">
                      {Number.isFinite(meta.distance_km) && (
                        <span>{formatDistance(meta.distance_km, units)}</span>
                      )}
                      {Number.isFinite(meta.elevation_gain_m) && (
                        <span className="text-fog">+ {formatElevation(meta.elevation_gain_m, units)}</span>
                      )}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {state.status === 'ready' && !needsLogin && (
        <Link to="/" className="cta-plate flex min-h-13 items-center justify-center px-6 py-4">
          {all.length === 0 ? t('my_trips.empty_cta') : t('my_trips.new')}
        </Link>
      )}
    </main>
  );
}
