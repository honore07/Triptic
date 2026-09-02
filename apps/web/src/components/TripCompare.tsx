import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock } from 'lucide-react';
import type { Difficulty, TripProposal } from '@triptic/shared';
import { formatDistance, formatElevation } from '../lib/units';
import { useProfileStore } from '../store/profileStore';
import { TableauCompare } from './TableauCompare';
import { TripCard } from './TripCard';

interface Props {
  trips: TripProposal[];
  lockedCount: number;
  differentiator: string;
  onChoose: (trip: TripProposal) => void;
  onUnlock: () => void;
}

const DIFFICULTY_RANK: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2 };
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

/**
 * TripCompare — planches PL.07 « COMPARER » et PL.08 « RELEVÉ COMPARÉ ».
 * Le triptyque : trois volets photo côte à côte sur grand écran, un
 * carrousel à crans sur mobile où le volet centré prend ses couleurs. Sous
 * le titre, « ce qui les distingue » est CALCULÉ depuis les trois relevés —
 * les axes identiques sont dits identiques, jamais gonflés. Le relevé
 * chiffré (PL.08) reste à un tap pour trancher.
 */
export function TripCompare({ trips, lockedCount, differentiator, onChoose, onUnlock }: Props) {
  const { t } = useTranslation();
  const units = useProfileStore((s) => s.units);
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const [active, setActive] = useState(0);
  const slides = useRef<Array<HTMLDivElement | null>>([]);

  // Mobile : le volet le plus visible dans le carrousel devient l'actif —
  // c'est lui qui prend ses couleurs. Sans IntersectionObserver (jsdom,
  // très vieux navigateurs) on garde l'activation au tap.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        const best = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!best) return;
        const i = slides.current.indexOf(best.target as HTMLDivElement);
        if (i >= 0) setActive(i);
      },
      { threshold: [0.55, 0.75] },
    );
    for (const el of slides.current) if (el) observer.observe(el);
    return () => observer.disconnect();
  }, [trips.length, view]);

  // Ce qui distingue vraiment les trois voies, axe par axe
  const span = (values: number[]) => ({ min: Math.min(...values), max: Math.max(...values) });
  const days = span(trips.map((x) => x.duration_days));
  const km = span(trips.map((x) => x.distance_km));
  const gain = span(trips.map((x) => x.elevation_gain_m));
  const diff = span(trips.map((x) => DIFFICULTY_RANK[x.difficulty]));
  const axes: Array<{ key: string; label: string; value: string; same: boolean }> = [
    {
      key: 'duration',
      label: t('tableau.metric_duration'),
      same: days.min === days.max,
      value: `${days.min} → ${days.max} ${t('trips.days')}`,
    },
    {
      key: 'distance',
      label: t('tableau.metric_distance'),
      same: Math.round(km.min) === Math.round(km.max),
      value: `${formatDistance(km.min, units)} → ${formatDistance(km.max, units)}`,
    },
    {
      key: 'elevation',
      label: t('tableau.metric_elevation'),
      same: Math.round(gain.min) === Math.round(gain.max),
      value: `${formatElevation(gain.min, units)} → ${formatElevation(gain.max, units)}`,
    },
    {
      key: 'difficulty',
      label: t('request.difficulty'),
      same: diff.min === diff.max,
      value: `${t(`difficulty.${DIFFICULTIES[diff.min]}`)} → ${t(`difficulty.${DIFFICULTIES[diff.max]}`)}`,
    },
  ];

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
          className="font-display text-3xl font-semibold leading-tight text-trail sm:text-4xl"
        >
          {t('trips.compare_title')}
        </h2>
        <p className="font-display text-base italic leading-snug text-ridge">
          {t('trips.compare_hint')} — {differentiator}
        </p>
      </div>

      {/* Ce qui les distingue — calculé, axe par axe */}
      <dl className="grid grid-cols-2 gap-px border border-mist bg-mist sm:grid-cols-4">
        {axes.map(({ key, label, value, same }) => (
          <div key={key} className="flex flex-col gap-0.5 bg-snow p-2.5">
            <dt className="label-mono text-fog">{label}</dt>
            <dd
              className={`font-display text-base font-semibold leading-tight ${
                same ? 'text-fog' : 'text-copper-deep'
              }`}
            >
              {same ? t('trips.same') : value}
            </dd>
          </div>
        ))}
      </dl>

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
        <>
          {/* Le triptyque : carrousel à crans sur mobile, trois volets dès md */}
          <div className="triptych -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0">
            {trips.map((trip, i) => (
              <div
                key={trip.title}
                ref={(el) => {
                  slides.current[i] = el;
                }}
                className="w-[84vw] shrink-0 snap-center md:w-auto"
              >
                <TripCard
                  trip={trip}
                  index={i}
                  active={active === i}
                  onActivate={() => setActive(i)}
                  onChoose={onChoose}
                />
              </div>
            ))}
            {Array.from({ length: lockedCount }).map((_, i) => (
              <button
                key={`locked-${i}`}
                type="button"
                onClick={onUnlock}
                className="trip-card-enter flex min-h-[30rem] w-[84vw] shrink-0 snap-center flex-col items-center justify-center gap-3 border border-dashed border-mist bg-cloud p-6 text-center transition-colors hover:border-summit md:w-auto"
                style={{ animationDelay: `${(trips.length + i) * 110}ms` }}
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

          {/* Repère de position du carrousel (mobile) : I · II · III */}
          {trips.length > 1 && (
            <ol
              aria-hidden="true"
              className="flex items-center justify-center gap-4 md:hidden"
            >
              {trips.map((trip, i) => (
                <li
                  key={trip.title}
                  className={`font-display text-lg leading-none transition-colors ${
                    active === i ? 'text-summit' : 'text-fog'
                  }`}
                >
                  {['I', 'II', 'III', 'IV', 'V'][i]}
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}
