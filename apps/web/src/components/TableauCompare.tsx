import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TripProposal } from '@triptic/shared';

/** Les 4 axes de comparaison chiffrée de la planche PL.08. */
const METRICS = ['duration', 'distance', 'elevation', 'budget'] as const;
export type CompareMetric = (typeof METRICS)[number];

/** Valeur comparable d'un trip sur un axe — budget = milieu de fourchette. */
export function metricValue(trip: TripProposal, metric: CompareMetric): number {
  switch (metric) {
    case 'duration':
      return trip.duration_days;
    case 'distance':
      return Math.round(trip.distance_km);
    case 'elevation':
      return Math.round(trip.elevation_gain_m);
    case 'budget':
      return trip.budget
        ? Math.round((trip.budget.total_eur[0] + trip.budget.total_eur[1]) / 2)
        : 0;
  }
}

interface Props {
  trips: TripProposal[];
  onChoose: (trip: TripProposal) => void;
}

/**
 * TableauCompare — planche PL.08 « RELEVÉ COMPARÉ ».
 * Les trois voies mises à plat sur un axe au choix : barres proportionnelles,
 * rang de chacune, et écart réel au plus petit. Aucun chiffre inventé — tout
 * vient des propositions.
 */
export function TableauCompare({ trips, onChoose }: Props) {
  const { t } = useTranslation();
  const [metric, setMetric] = useState<CompareMetric>('duration');
  const [selected, setSelected] = useState(0);

  const values = trips.map((trip) => metricValue(trip, metric));
  const max = Math.max(...values, 1);
  const min = Math.min(...values);
  // Ordre croissant sur l'axe courant — le plus sobre en tête
  const order = trips.map((_, i) => i).sort((a, b) => (values[a] ?? 0) - (values[b] ?? 0));

  const rankLabel = (value: number) => {
    if (value === min) return metric === 'budget' ? t('trips.rank_min_budget') : t('trips.rank_min');
    if (value === max) return metric === 'budget' ? t('trips.rank_max_budget') : t('trips.rank_max');
    return t('trips.rank_mid');
  };

  const chosen = trips[selected];

  return (
    <section aria-labelledby="tableau-title" className="fade-up flex flex-col gap-4">
      <div className="flex items-center gap-3">
        {/* Le compas de la marque — l'outil qui reporte et compare */}
        <img
          src="/vire/vire_logo-compas.webp"
          alt=""
          aria-hidden="true"
          loading="lazy"
          className="h-12 w-12 shrink-0 rounded-full border border-mist object-cover"
        />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="label-mono text-fog">{t('tableau.plate')}</p>
          <h2
            id="tableau-title"
            className="font-display text-3xl font-semibold leading-tight text-trail"
          >
            {t('tableau.title')}
          </h2>
        </div>
      </div>

      {/* Axe de tri */}
      <div>
        <p className="label-mono mb-1.5 text-fog">{t('tableau.sort_by')}</p>
        <div role="group" aria-label={t('tableau.sort_by')} className="flex border border-mist">
          {METRICS.map((key, i) => (
            <button
              key={key}
              type="button"
              aria-pressed={metric === key}
              onClick={() => setMetric(key)}
              className={`min-h-11 min-w-0 flex-1 font-mono text-[10px] font-medium uppercase tracking-[0.12em] transition-colors ${
                i > 0 ? 'border-l border-mist' : ''
              } ${metric === key ? 'bg-summit text-snow' : 'bg-snow text-trail hover:bg-sky'}`}
            >
              {t(`tableau.metric_${key}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Les trois voies, dans l'ordre de l'axe choisi */}
      <ul className="flex flex-col gap-2">
        {order.map((i) => {
          const trip = trips[i];
          if (!trip) return null;
          const value = values[i] ?? 0;
          return (
            <li key={trip.title}>
              <button
                type="button"
                aria-pressed={selected === i}
                onClick={() => setSelected(i)}
                className={`flex w-full flex-col gap-2 border p-3 text-left transition-colors ${
                  selected === i ? 'border-summit bg-sky' : 'border-mist bg-snow hover:bg-sky'
                }`}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="font-display text-xl font-semibold leading-tight text-trail">
                    {trip.title}
                  </span>
                  <span className="label-mono shrink-0 border border-mist bg-snow px-2 py-1 text-ridge">
                    {rankLabel(value)}
                  </span>
                </span>

                {/* Barre proportionnelle sur l'axe courant */}
                <span
                  aria-hidden="true"
                  className="block h-2.5 w-full border border-mist bg-cloud"
                >
                  <span
                    className="block h-full bg-summit transition-all duration-300"
                    style={{ width: `${Math.round((value / max) * 100)}%` }}
                  />
                </span>

                <dl className="grid grid-cols-4 gap-2">
                  {METRICS.map((key) => (
                    <span key={key} className="flex flex-col gap-0.5">
                      <dt className="label-mono text-fog">{t(`tableau.metric_${key}`)}</dt>
                      <dd className="font-display text-base font-semibold text-trail">
                        {metricValue(trip, key) || '—'}
                      </dd>
                    </span>
                  ))}
                </dl>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Écart réel au plus sobre */}
      <div className="flex flex-col gap-2 border-t border-mist pt-3">
        <p className="label-mono text-fog">{t('tableau.gap')}</p>
        {order.map((i) => {
          const trip = trips[i];
          if (!trip) return null;
          const value = values[i] ?? 0;
          const gap = min > 0 ? Math.round(((value - min) / min) * 100) : 0;
          return (
            <div key={trip.title} className="flex items-center gap-3">
              <span className="label-mono w-24 shrink-0 truncate text-ridge">{trip.title}</span>
              <span aria-hidden="true" className="h-2 flex-1 border border-mist bg-cloud">
                <span
                  className="block h-full bg-summit"
                  style={{ width: `${Math.round((value / max) * 100)}%` }}
                />
              </span>
              <span className="w-14 shrink-0 text-right font-mono text-xs text-ridge">
                {gap === 0 ? '—' : `+${gap} %`}
              </span>
            </div>
          );
        })}
      </div>

      {chosen && (
        <button
          type="button"
          onClick={() => onChoose(chosen)}
          className="cta-plate flex min-h-13 items-center justify-center px-6 py-4 text-center"
        >
          {t('tableau.open', { title: chosen.title })}
        </button>
      )}
    </section>
  );
}
