import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BedDouble,
  Bike,
  Car,
  Footprints,
  Landmark,
  Moon,
  UtensilsCrossed,
} from 'lucide-react';
import type { ActivityType, TripDay } from '@triptic/shared';

/**
 * Cartes-étapes synchronisées avec la carte (planche PL.09) : une rangée par
 * jour ; cliquer une rangée recentre la carte, cliquer un marqueur met la
 * rangée en avant. Le détail des activités se déplie sur la rangée choisie —
 * la profondeur existe mais ne s'impose pas.
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

const ACTIVITY_ICONS: Record<ActivityType, typeof Car> = {
  drive: Car,
  hike: Footprints,
  visit: Landmark,
  meal: UtensilsCrossed,
  camp: Moon,
  rest: BedDouble,
};

/**
 * Gravure de médaillon par nature de journée — un jour sans photo réelle
 * garde un objet d'expédition plutôt qu'un carré vide.
 */
const ACTIVITY_ENGRAVINGS: Record<ActivityType, string> = {
  drive: '/vire/vire_pic-boussole.jpg',
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
          const dayMinutes = (day.segments ?? []).reduce((s, seg) => s + seg.duration_min, 0);
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
                        {Math.round(dayDistance)} km{routed ? '' : ` (${t('days.estimated')})`}
                      </span>
                    )}
                    {dayGain > 0 && <span className="text-fog">+ {dayGain} m</span>}
                  </span>
                )}
              </button>

              {/* Détail de la journée — déplié sur la rangée choisie */}
              {selected && (
                <ul className="flex flex-col gap-1.5 border border-t-0 border-summit bg-snow p-4">
                  {dayMinutes > 0 && (
                    <li className="label-mono pb-1 text-fog">
                      {Math.floor(dayMinutes / 60)} h {String(dayMinutes % 60).padStart(2, '0')}
                    </li>
                  )}
                  {day.activities.map((activity, i) => {
                    const Icon = ACTIVITY_ICONS[activity.type] ?? Bike;
                    return (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <Icon
                          size={15}
                          className="mt-0.5 shrink-0 text-summit"
                          aria-hidden="true"
                        />
                        <div className="min-w-0">
                          <span className="font-medium text-trail">{activity.title}</span>
                          <span className="ml-1.5 text-xs text-fog">
                            {t(`time.${activity.time_of_day}`)}
                            {activity.distance_km ? ` · ${activity.distance_km} km` : ''}
                            {activity.elevation_gain_m ? ` · D+ ${activity.elevation_gain_m} m` : ''}
                            {activity.cost_estimate ? ` · ${activity.cost_estimate} €` : ''}
                          </span>
                          {activity.description && (
                            <p className="text-xs text-ridge">{activity.description}</p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
