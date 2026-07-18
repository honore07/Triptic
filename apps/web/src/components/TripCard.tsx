import { useTranslation } from 'react-i18next';
import { Clock, Mountain, Route } from 'lucide-react';
import type { TripProposal } from '@triptic/shared';
import { DifficultyBadge } from './DifficultyBadge';
import { RoutePreview } from './RoutePreview';

interface Props {
  trip: TripProposal;
  onChoose: (trip: TripProposal) => void;
  index?: number;
}

/**
 * TripCard — photo réelle en fond + overlay dégradé + données IA superposées.
 * Sans photo (pas de clé Unsplash/Pexels) : fond dégradé trail/ridge.
 */
export function TripCard({ trip, onChoose, index = 0 }: Props) {
  const { t } = useTranslation();

  return (
    <article
      className="trip-card-enter group relative flex min-h-[420px] flex-col justify-end overflow-hidden rounded-trip bg-trail shadow-lg transition-all duration-300 hover:-translate-y-1.5 hover:shadow-2xl"
      style={{ animationDelay: `${index * 90}ms` }}
    >
      {trip.photo_url ? (
        <img
          src={trip.photo_url}
          alt={`${trip.title} — ${trip.ambiance}`}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-ridge to-trail">
          <RoutePreview waypoints={trip.waypoints} className="h-full w-full opacity-50" stroke="#FAC05E" />
        </div>
      )}
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(180deg, transparent 30%, rgba(30,30,36,0.9) 100%)' }}
        aria-hidden="true"
      />

      <div className="relative z-10 flex flex-col gap-3 p-5">
        <div className="flex items-center gap-2">
          <span className="rounded-badge bg-gold/25 px-2 py-0.5 text-xs font-semibold text-gold backdrop-blur">
            {t(`mode.${trip.mode}`)}
          </span>
          <DifficultyBadge level={trip.difficulty} />
        </div>
        <h3 className="font-display text-xl font-bold leading-tight text-snow">{trip.title}</h3>
        <p className="line-clamp-2 text-sm text-sky">{trip.summary}</p>

        <dl className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-snow/90">
          <div className="flex items-center gap-1.5">
            <Clock size={14} aria-hidden="true" />
            <dt className="sr-only">{t('trips.days')}</dt>
            <dd>
              {trip.duration_days} {t('trips.days')}
            </dd>
          </div>
          <div className="flex items-center gap-1.5">
            <Route size={14} aria-hidden="true" />
            <dt className="sr-only">{t('trips.distance')}</dt>
            <dd>{Math.round(trip.distance_km)} km</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <Mountain size={14} aria-hidden="true" />
            <dt className="sr-only">{t('trips.elevation')}</dt>
            <dd>
              {t('trips.elevation')} {Math.round(trip.elevation_gain_m)} m
            </dd>
          </div>
        </dl>

        <button
          type="button"
          onClick={() => onChoose(trip)}
          className="mt-1 min-h-11 w-full rounded-xl bg-gold px-4 py-2.5 text-sm font-bold text-trail transition-all duration-200 hover:-translate-y-0.5 hover:bg-gold-deep"
        >
          {t('trips.choose')}
        </button>
      </div>
    </article>
  );
}
