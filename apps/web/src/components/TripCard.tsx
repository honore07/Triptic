import type { CSSProperties } from 'react';
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
  /** Planche mise en avant : la photo prend ses couleurs, le cadre rouille. */
  active?: boolean;
  /** Un tap sur la planche la met en avant (sans encore l'ouvrir). */
  onActivate?: (() => void) | undefined;
}

/** I, II, III — la numérotation des planches, pas des chiffres arabes. */
const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

/** Case du relevé — étiquette mono au-dessus, valeur en serif, sur l'encre. */
function Releve({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 px-2.5 py-2">
      <dt className="label-mono text-cloud/65">{label}</dt>
      <dd className="font-display text-xl font-semibold leading-none text-cloud">
        {value}
      </dd>
    </div>
  );
}

/**
 * TripCard — planche PL.07 « COMPARER », volet du triptyque.
 * La photo réelle du terrain remplit toute la planche : c'est la seule
 * image non gravée de l'app, et elle porte le relevé. Au repos elle se lit
 * comme une gravure (tonalité encre) ; dès qu'on s'y arrête — survol, tap,
 * volet centré sur mobile — elle prend ses couleurs. Le relevé chiffré se
 * pose sur l'encre du bas, la plaque d'action ferme la planche.
 */
export function TripCard({ trip, onChoose, index = 0, active = false, onActivate }: Props) {
  const { t } = useTranslation();
  const units = useProfileStore((s) => s.units);
  const numeral = ROMAN[index] ?? String(index + 1);

  return (
    <article
      className={`ink-reveal triptych-plate relative flex flex-col overflow-hidden border bg-trail text-cloud ${
        active ? 'is-active border-summit' : 'border-mist'
      }`}
      style={{ '--i': index } as CSSProperties}
      onClick={onActivate}
      aria-current={active ? 'true' : undefined}
    >
      {/* Le terrain — photo réelle plein cadre, tracé SVG à défaut */}
      <div aria-hidden={trip.photo_url ? undefined : 'true'} className="absolute inset-0">
        {trip.photo_url ? (
          <img
            src={trip.photo_url}
            alt={`${trip.title} — ${trip.ambiance}`}
            loading="lazy"
            className="plate-photo h-full w-full object-cover"
          />
        ) : (
          <RoutePreview
            waypoints={trip.waypoints}
            className="h-full w-full p-10 opacity-60"
            stroke={MAP_COLORS.gold}
          />
        )}
        {/* Voile d'encre : léger en haut (le numéro se lit sur l'image),
         * plein en bas (le relevé et la plaque sont en clair). */}
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(17,17,17,0.35)_0%,rgba(17,17,17,0.08)_22%,rgba(17,17,17,0.76)_46%,rgba(17,17,17,0.93)_62%,rgba(17,17,17,0.97)_100%)]" />
      </div>

      {/* Tête de planche : le numéro en grand, la difficulté en cartouche */}
      <div className="relative flex items-start justify-between p-4">
        <span
          aria-hidden="true"
          className="font-display text-6xl font-semibold leading-none text-cloud drop-shadow-[2px_2px_0_rgba(17,17,17,0.8)]"
        >
          {numeral}
        </span>
        <DifficultyBadge level={trip.difficulty} />
      </div>

      {/* Relevé — posé sur l'encre du bas */}
      <div className="relative mt-auto flex flex-col gap-3 p-4 pt-16">
        <div className="flex flex-col gap-1">
          <span className="label-mono self-start border border-cloud/30 bg-trail px-2 py-1 text-gold">
            {t('trips.line')} {numeral}
          </span>
          <h3 className="on-photo font-display text-2xl font-semibold leading-tight text-cloud sm:text-[1.7rem]">
            {trip.title}
          </h3>
          {/* L'ambiance est une phrase du moteur : sous-titre serif, pas une étiquette */}
          <p className="on-photo font-display text-base italic leading-snug text-cloud">{trip.ambiance}</p>
        </div>

        <p className="plate-summary line-clamp-2 text-sm leading-relaxed text-cloud/85">
          {trip.summary}
        </p>

        <dl className="grid grid-cols-2 border border-cloud/30 [&>div:nth-child(-n+2)]:border-b [&>div:nth-child(odd)]:border-r [&>div]:border-cloud/30">
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
              trip.budget ? `${trip.budget.total_eur[0]}–${trip.budget.total_eur[1]} €` : '—'
            }
          />
        </dl>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onChoose(trip);
          }}
          className="cta-plate flex min-h-12 items-center justify-center px-4 py-3"
        >
          {t('trips.choose')}
        </button>
      </div>
    </article>
  );
}
