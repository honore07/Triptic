import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { ActivityType, TripDay } from '@triptic/shared';
import { formatDistance, formatElevation } from '../lib/units';
import { useProfileStore } from '../store/profileStore';

/**
 * Bandeau des étapes, synchronisé avec la carte (planche PL.09) : une
 * planche par jour, en file horizontale à crans ; cliquer une planche
 * recentre la carte, cliquer un marqueur fait défiler jusqu'à la planche.
 * La photo réelle du jour est en tête quand elle existe — c'est le terrain,
 * la seule image non gravée — sinon l'objet d'expédition de la journée.
 * Le détail vit dans la fiche d'étape (PL.11), ouverte juste en dessous.
 */

/**
 * Vignette : réduit la largeur demandée aux CDN images (Unsplash/Pexels
 * utilisent tous deux le paramètre `w`). On ne réécrit l'URL que si elle
 * porte déjà ce paramètre — sinon on la laisse intacte.
 */
export function thumbnailUrl(url: string, width = 400): string {
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has('w')) return url;
    parsed.searchParams.set('w', String(width));
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Gravure par nature de journée — un jour sans photo réelle garde un objet
 * d'expédition plutôt qu'un cadre vide.
 */
const ACTIVITY_ENGRAVINGS: Record<ActivityType, string> = {
  drive: '/vire/vire_logo-compas.webp',
  hike: '/vire/vire_pic-chaussures.jpg',
  visit: '/vire/vire_char-carte.jpg',
  meal: '/vire/vire_pic-sac.jpg',
  camp: '/vire/vire_pic-lanterne.jpg',
  rest: '/vire/vire_pic-corde.jpg',
};

/** Nature dominante de la journée = son premier temps fort. */
function dominantType(day: TripDay): ActivityType {
  return day.activities[0]?.type ?? 'hike';
}

interface Props {
  days: TripDay[];
  selectedDay: number | null;
  onSelectDay: (day: number) => void;
}

export function DayCards({ days, selectedDay, onSelectDay }: Props) {
  const { t } = useTranslation();
  const units = useProfileStore((s) => s.units);
  const refs = useRef(new Map<number, HTMLElement>());

  // Synchro carte → bandeau : la planche du jour sélectionné vient au centre
  useEffect(() => {
    if (selectedDay == null) return;
    refs.current
      .get(selectedDay)
      ?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [selectedDay]);

  const sorted = [...days].sort((a, b) => a.day - b.day);

  return (
    <section aria-labelledby="days-title" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between border-b border-mist pb-2">
        <h2 id="days-title" className="label-mono text-fog">
          {t('days.title')}
        </h2>
        <span className="label-mono text-fog">{t('trips.days_count', { count: sorted.length })}</span>
      </div>
      <ol className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        {sorted.map((day) => {
          const selected = day.day === selectedDay;
          const type = dominantType(day);
          const dayDistance = (day.segments ?? []).reduce((s, seg) => s + seg.distance_km, 0);
          const dayGain = day.activities.reduce((s, a) => s + (a.elevation_gain_m ?? 0), 0);
          const routed = (day.segments ?? []).some((s) => s.routed);
          return (
            <li
              key={day.day}
              className="w-44 shrink-0 snap-start sm:w-52"
              ref={(el) => {
                if (el) refs.current.set(day.day, el);
              }}
            >
              <button
                type="button"
                onClick={() => onSelectDay(day.day)}
                aria-pressed={selected}
                aria-label={`${t('trips.day')} ${day.day} — ${day.title}`}
                className={`plate-hover flex h-full w-full flex-col border text-left transition-colors ${
                  selected ? 'border-summit bg-sky' : 'border-mist bg-snow'
                }`}
              >
                <span className="relative block h-28 w-full overflow-hidden border-b border-mist bg-terrain">
                  {/* Photo réelle du jour si elle existe, gravure sinon */}
                  <img
                    src={day.photo_url ? thumbnailUrl(day.photo_url) : ACTIVITY_ENGRAVINGS[type]}
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    className={`h-full w-full object-cover ${day.photo_url ? '' : 'opacity-90'}`}
                  />
                  {/* Le numéro du jour, imprimé dans le coin */}
                  <span
                    aria-hidden="true"
                    className={`absolute left-0 top-0 border-b border-r border-mist px-2 py-1 font-display text-lg font-semibold leading-none ${
                      selected ? 'bg-summit text-cloud' : 'bg-snow text-trail'
                    }`}
                  >
                    {String(day.day).padStart(2, '0')}
                  </span>
                </span>
                <span className="flex flex-1 flex-col gap-1 p-2.5">
                  <span className="label-mono text-fog">{t(`activity.${type}`)}</span>
                  <span className="line-clamp-2 font-display text-base font-semibold leading-tight text-trail">
                    {day.title}
                  </span>
                  {(dayDistance > 0 || dayGain > 0) && (
                    <span className="mt-auto flex flex-col gap-0.5 pt-1 font-mono text-[11px] text-ridge">
                      {dayDistance > 0 && (
                        <span>
                          {formatDistance(dayDistance, units)}
                          {routed ? '' : ` (${t('days.estimated')})`}
                        </span>
                      )}
                      {dayGain > 0 && (
                        <span className="text-fog">+ {formatElevation(dayGain, units)}</span>
                      )}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
