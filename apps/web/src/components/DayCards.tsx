import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BedDouble,
  Bike,
  Car,
  Footprints,
  Landmark,
  Moon,
  Route,
  UtensilsCrossed,
} from 'lucide-react';
import type { ActivityType, TripDay } from '@triptic/shared';

/**
 * Cartes-étapes synchronisées avec la carte (roadmap 2.2) : une carte par
 * jour ; cliquer une carte recentre la carte sur l'étape, cliquer un marqueur
 * de la carte met la carte-jour en avant (scroll + surbrillance).
 */

const ACTIVITY_ICONS: Record<ActivityType, typeof Car> = {
  drive: Car,
  hike: Footprints,
  visit: Landmark,
  meal: UtensilsCrossed,
  camp: Moon,
  rest: BedDouble,
};

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
    <section aria-labelledby="days-title" className="flex flex-col gap-3">
      <h2 id="days-title" className="font-display text-xl font-bold text-trail">
        {t('days.title')}
      </h2>
      <ol className="flex flex-col gap-3">
        {sorted.map((day) => {
          const selected = day.day === selectedDay;
          const dayDistance = (day.segments ?? []).reduce((s, seg) => s + seg.distance_km, 0);
          const dayMinutes = (day.segments ?? []).reduce((s, seg) => s + seg.duration_min, 0);
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
                className={`w-full overflow-hidden rounded-trip border text-left transition-all duration-200 ${
                  selected
                    ? 'border-summit shadow-lg ring-2 ring-summit/30'
                    : 'border-mist bg-snow shadow-sm hover:border-summit hover:shadow-md'
                }`}
              >
                {day.photo_url && (
                  <img
                    src={day.photo_url}
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    className="h-28 w-full object-cover"
                  />
                )}
                <div className="flex flex-col gap-2 bg-snow p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="font-display font-bold text-trail">
                      <span className="font-mono text-xs font-semibold text-copper-deep">
                        {t('trips.day')} {day.day}
                      </span>{' '}
                      · {day.title}
                    </h3>
                    {dayDistance > 0 && (
                      <span className="flex shrink-0 items-center gap-1 font-mono text-xs text-ridge">
                        <Route size={12} aria-hidden="true" />
                        {Math.round(dayDistance)} km
                        {dayMinutes > 0 && ` · ${Math.floor(dayMinutes / 60)}h${String(dayMinutes % 60).padStart(2, '0')}`}
                        {routed ? '' : ` (${t('days.estimated')})`}
                      </span>
                    )}
                  </div>
                  <ul className="flex flex-col gap-1.5">
                    {day.activities.map((activity, i) => {
                      const Icon = ACTIVITY_ICONS[activity.type] ?? Bike;
                      return (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <Icon size={15} className="mt-0.5 shrink-0 text-summit" aria-hidden="true" />
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
                </div>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
