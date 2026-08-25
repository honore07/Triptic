import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock } from 'lucide-react';
import type { TripProposal } from '@triptic/shared';
import { TableauCompare } from './TableauCompare';
import { TripCard } from './TripCard';

interface Props {
  trips: TripProposal[];
  lockedCount: number;
  differentiator: string;
  onChoose: (trip: TripProposal) => void;
  onUnlock: () => void;
}

/**
 * TripCompare — planches PL.07 « COMPARER » et PL.08 « RELEVÉ COMPARÉ ».
 * Deux lectures des mêmes voies : les planches illustrées pour se projeter,
 * le relevé chiffré pour trancher. Le basculement est explicite.
 */
export function TripCompare({ trips, lockedCount, differentiator, onChoose, onUnlock }: Props) {
  const { t } = useTranslation();
  const [view, setView] = useState<'cards' | 'table'>('cards');

  return (
    <section aria-labelledby="compare-title" className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between border-b border-mist pb-2">
        <p className="label-mono text-fog">{t('trips.plate')}</p>
        <p className="label-mono text-fog">
          {t('trips.count', { total: trips.length + lockedCount })}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h2
          id="compare-title"
          className="font-display text-3xl font-semibold leading-tight text-trail"
        >
          {t('trips.compare_title')}
        </h2>
        <p className="font-display text-base italic leading-snug text-ridge">
          {t('trips.compare_hint')} — {differentiator}
        </p>
      </div>

      {/* Cartes ou relevé — deux façons de lire les mêmes voies */}
      <div role="group" aria-label={t('trips.view_label')} className="flex border border-mist">
        {(['cards', 'table'] as const).map((key, i) => (
          <button
            key={key}
            type="button"
            aria-pressed={view === key}
            onClick={() => setView(key)}
            className={`min-h-11 flex-1 font-mono text-[10px] font-medium uppercase tracking-[0.12em] transition-colors ${
              i > 0 ? 'border-l border-mist' : ''
            } ${view === key ? 'bg-summit text-snow' : 'bg-snow text-trail hover:bg-sky'}`}
          >
            {t(`trips.view_${key}`)}
          </button>
        ))}
      </div>

      {view === 'table' ? (
        <TableauCompare trips={trips} onChoose={onChoose} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {trips.map((trip, i) => (
            <TripCard key={trip.title} trip={trip} index={i} onChoose={onChoose} />
          ))}
          {Array.from({ length: lockedCount }).map((_, i) => (
            <button
              key={`locked-${i}`}
              type="button"
              onClick={onUnlock}
              className="trip-card-enter flex min-h-72 flex-col items-center justify-center gap-3 border border-dashed border-mist bg-cloud p-6 text-center transition-colors hover:border-summit"
              style={{ animationDelay: `${(trips.length + i) * 80}ms` }}
              aria-label={t('trips.locked_cta')}
            >
              <img
                src="/vire/vire_pic-corde.jpg"
                alt=""
                aria-hidden="true"
                loading="lazy"
                className="h-16 w-16 rounded-full border border-mist object-cover"
              />
              <Lock size={16} className="text-copper-deep" aria-hidden="true" />
              <p className="font-display text-lg font-semibold text-trail">
                {t('trips.locked_title')}
              </p>
              <span className="label-mono border border-mist bg-summit px-3 py-2 text-snow">
                {t('trips.locked_cta')}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
