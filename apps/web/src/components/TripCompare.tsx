import { useTranslation } from 'react-i18next';
import { Lock } from 'lucide-react';
import type { TripProposal } from '@triptic/shared';
import { TripCard } from './TripCard';

interface Props {
  trips: TripProposal[];
  lockedCount: number;
  differentiator: string;
  onChoose: (trip: TripProposal) => void;
  onUnlock: () => void;
}

/** Vue côte-à-côte des trips en compétition (colonne sur mobile). */
export function TripCompare({ trips, lockedCount, differentiator, onChoose, onUnlock }: Props) {
  const { t } = useTranslation();

  return (
    <section aria-labelledby="compare-title" className="flex flex-col gap-4">
      <div>
        <h2 id="compare-title" className="font-display text-2xl font-bold text-trail">
          {t('trips.compare_title')}
        </h2>
        <p className="text-sm text-ridge">
          {t('trips.compare_hint')} — {differentiator}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {trips.map((trip, i) => (
          <TripCard key={trip.title} trip={trip} index={i} onChoose={onChoose} />
        ))}
        {Array.from({ length: lockedCount }).map((_, i) => (
          <button
            key={`locked-${i}`}
            type="button"
            onClick={onUnlock}
            className="trip-card-enter flex min-h-[420px] flex-col items-center justify-center gap-3 rounded-trip border-2 border-dashed border-mist bg-snow/60 p-6 text-center transition-colors hover:border-summit"
            style={{ animationDelay: `${(trips.length + i) * 80}ms` }}
            aria-label={t('trips.locked_cta')}
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gold/25">
              <Lock size={20} className="text-copper-deep" aria-hidden="true" />
            </span>
            <p className="font-display font-semibold text-trail">{t('trips.locked_title')}</p>
            <span className="rounded-xl bg-gold px-4 py-2 text-sm font-bold text-trail">
              {t('trips.locked_cta')}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
