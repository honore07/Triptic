import { useTranslation } from 'react-i18next';
import type { TripProposal } from '@triptic/shared';
import { MAP_COLORS } from '../lib/mapColors';
import { formatDistance, formatElevation } from '../lib/units';
import { useProfileStore } from '../store/profileStore';
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
  const units = useProfileStore((s) => s.units);

  return (
    <article
      className="trip-card-enter plate-hover flex flex-col border border-mist bg-snow"
      style={{ animationDelay: `${index * 90}ms` }}
    >
      <div className="relative h-44 overflow-hidden border-b border-mist bg-trail sm:h-48">
        {trip.photo_url ? (
          <img
            src={trip.photo_url}
            alt={`${trip.title} — ${trip.ambiance}`}
            loading="lazy"
            className="photo-settle h-full w-full object-cover"
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
          <DifficultyBadge level={trip.difficulty} />
        </div>

        <div className="flex flex-col gap-1">
          <h3 className="font-display text-2xl font-semibold leading-tight text-trail">
            {trip.title}
          </h3>
          {/* L'ambiance est une phrase du moteur, pas une étiquette : elle se
           * lit en sous-titre serif, jamais dans un cartouche mono. */}
          <p className="font-display text-base italic leading-snug text-copper-deep">
            {trip.ambiance}
          </p>
        </div>
        <p className="line-clamp-3 flex-1 text-sm leading-relaxed text-ridge">{trip.summary}</p>

        <dl className="grid grid-cols-2 border border-mist [&>div:nth-child(-n+2)]:border-b [&>div:nth-child(odd)]:border-r">
          <Releve
            label={t('trips.days')}
            value={t('trips.days_count', { count: trip.duration_days })}
          />
          <Releve label={t('trips.distance')} value={formatDistance(trip.distance_km, units)} />
          <Releve
            label={t('trips.elevation')}
            value={formatElevation(trip.elevation_gain_m, units)}
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
