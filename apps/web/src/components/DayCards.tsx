import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { ActivityType, TripDay } from '@triptic/shared';
import { formatDistance, formatElevation } from '../lib/units';
import { useProfileStore } from '../store/profileStore';

/**
 * Cartes-étapes synchronisées avec la carte (planche PL.09) : une rangée par
 * jour ; cliquer une rangée recentre la carte, cliquer un marqueur met la
 * rangée en avant. La rangée reste compacte : le détail de la journée vit
 * dans la fiche d'étape (PL.11), ouverte juste en dessous.
 */

/**
 * Vignette h-28 (112px) : réduit la largeur demandée aux CDN images
 * (Unsplash/Pexels utilisent tous deux le paramètre `w`). On ne réécrit
 * l'URL que si elle porte déjà ce paramètre — sinon on la laisse intacte.
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
 * Gravure de médaillon par nature de journée — un jour sans photo réelle
 * garde un objet d'expédition plutôt qu'un carré vide.
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

  // Synchro carte → cartes-jours : scroll vers la carte du jour sélectionné
  useEffect(() => {
    if (selectedDay == null) return;
    refs.current.get(selectedDay)?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }, [selectedDay]);

  const sorted = [...days].sort((a, b) => a.day - b.day);

  return (
    <section aria-labelledby="days-title" className="flex flex-col gap-2">
      <h2 id="days-title" className="label-mono text-fog">
        {t('days.title')}
      </h2>
      <ol className="flex flex-col">
        {sorted.map((day) => {
          const selected = day.day === selectedDay;
          const type = dominantType(day);
          const dayDistance = (day.segments ?? []).reduce((s, seg) => s + seg.distance_km, 0);
          const dayGain = day.activities.reduce((s, a) => s + (a.elevation_gain_m ?? 0), 0);
          const routed = (day.segments ?? []).some((s) => s.routed);
          return (
            <li
              key={day.day}
              ref={(el) => {
                if (el) refs.current.set(day.day, el);
              }}
            >
              <button
                type="button"
                onClick={() => onSelectDay(day.day)}
                aria-pressed={selected}
                aria-label={`${t('trips.day')} ${day.day} — ${day.title}`}
                className={`flex w-full items-center gap-3 border border-b-0 p-3 text-left transition-colors last:border-b ${
                  selected ? 'border-summit bg-sky' : 'border-mist bg-snow hover:bg-sky'
                }`}
              >
                {/* Photo réelle du jour si elle existe, gravure sinon */}
                <img
                  src={day.photo_url ? thumbnailUrl(day.photo_url, 160) : ACTIVITY_ENGRAVINGS[type]}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  className="h-12 w-12 shrink-0 rounded-full border border-mist object-cover"
                />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="label-mono text-fog">
                    {t('trips.day')} {String(day.day).padStart(2, '0')} · {t(`activity.${type}`)}
                  </span>
                  <span className="truncate font-display text-lg font-semibold text-trail">
                    {day.title}
                  </span>
                </span>
                {(dayDistance > 0 || dayGain > 0) && (
                  <span className="flex shrink-0 flex-col items-end gap-0.5 font-mono text-xs text-ridge">
                    {dayDistance > 0 && (
                      <span>
                        {formatDistance(dayDistance, units)}{routed ? '' : ` (${t('days.estimated')})`}
                      </span>
                    )}
                    {dayGain > 0 && <span className="text-fog">+ {formatElevation(dayGain, units)}</span>}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
