import { useTranslation } from 'react-i18next';
import type { TripProposal } from '@triptic/shared';
import { MAP_COLORS } from '../lib/mapColors';
import { DifficultyBadge } from './DifficultyBadge';
import { RoutePreview } from './RoutePreview';

interface Props {
  trip: TripProposal;
  onChoose: (trip: TripProposal) => void;
  index?: number;
}

/** I, II, III — la numérotation des planches, pas des chiffres arabes. */
const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

/** Case du relevé — étiquette mono au-dessus, valeur en serif. */
function Releve({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-mist p-2.5">
      <dt className="label-mono text-fog">{label}</dt>
      <dd className="font-display text-xl font-semibold leading-none text-trail">{value}</dd>
    </div>
  );
}

/**
 * TripCard — planche PL.07 « COMPARER ».
 * Photo réelle en tête (la seule image non gravée de l'app : c'est le
 * terrain), puis planche papier — numéro de vire, ambiance, titre serif,
 * résumé en italique et relevé chiffré en 2×2.
 */
export function TripCard({ trip, onChoose, index = 0 }: Props) {
  const { t } = useTranslation();

  return (
    <article
      className="trip-card-enter flex flex-col border border-mist bg-snow"
      style={{ animationDelay: `${index * 90}ms` }}
    >
      <div className="relative h-44 border-b border-mist bg-trail sm:h-48">
        {trip.photo_url ? (
          <img
            src={trip.photo_url}
            alt={`${trip.title} — ${trip.ambiance}`}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <RoutePreview
            waypoints={trip.waypoints}
            className="h-full w-full opacity-60"
            stroke={MAP_COLORS.gold}
          />
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="label-mono text-copper-deep">
            {t('trips.line')} {ROMAN[index] ?? index + 1}
          </span>
          <div className="flex items-center gap-1.5">
            <span className="label-mono border border-mist px-2 py-1 text-ridge">
              {trip.ambiance}
            </span>
            <DifficultyBadge level={trip.difficulty} />
          </div>
        </div>

        <h3 className="font-display text-2xl font-semibold leading-tight text-trail">
          {trip.title}
        </h3>
        <p className="line-clamp-3 flex-1 font-display text-base italic leading-snug text-ridge">
          {trip.summary}
        </p>

        <dl className="grid grid-cols-2 border border-mist [&>div:nth-child(-n+2)]:border-b [&>div:nth-child(odd)]:border-r">
          <Releve
            label={t('trips.days')}
            value={t('trips.days_count', { count: trip.duration_days })}
          />
          <Releve label={t('trips.distance')} value={`${Math.round(trip.distance_km)} km`} />
          <Releve
            label={t('trips.elevation')}
            value={`${Math.round(trip.elevation_gain_m)} m`}
          />
          <Releve
            label={t('budget.title')}
            value={
              trip.budget
                ? `${trip.budget.total_eur[0]}–${trip.budget.total_eur[1]} €`
                : '—'
            }
          />
        </dl>

        <button
          type="button"
          onClick={() => onChoose(trip)}
          className="cta-plate flex min-h-12 items-center justify-center px-4 py-3"
        >
          {t('trips.choose')}
        </button>
      </div>
    </article>
  );
}
