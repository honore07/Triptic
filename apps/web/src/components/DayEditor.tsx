import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import type { ActivityType, TimeOfDay, TripActivity, TripDay } from '@triptic/shared';

/**
 * Édition manuelle des activités (roadmap 3.1) : réordonner (boutons ↑↓,
 * accessibles clavier — pas de lib de drag), éditer inline, ajouter,
 * supprimer. Chaque mutation remonte le tableau days complet → recalcul live.
 */

const ACTIVITY_TYPES: ActivityType[] = ['hike', 'drive', 'visit', 'meal', 'camp', 'rest'];
const TIMES: TimeOfDay[] = ['morning', 'afternoon', 'evening'];

interface Props {
  days: TripDay[];
  busy: boolean;
  onChange: (days: TripDay[]) => void;
}

export function DayEditor({ days, busy, onChange }: Props) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<string | null>(null);

  const sorted = [...days].sort((a, b) => a.day - b.day);

  const mutate = (dayNumber: number, fn: (activities: TripActivity[]) => TripActivity[]) => {
    onChange(
      sorted.map((d) => (d.day === dayNumber ? { ...d, activities: fn([...d.activities]) } : d)),
    );
  };

  const move = (dayNumber: number, index: number, delta: -1 | 1) => {
    mutate(dayNumber, (activities) => {
      const target = index + delta;
      if (target < 0 || target >= activities.length) return activities;
      const [item] = activities.splice(index, 1);
      activities.splice(target, 0, item!);
      return activities;
    });
  };

  const remove = (dayNumber: number, index: number) => {
    mutate(dayNumber, (activities) => activities.filter((_, i) => i !== index));
  };

  const add = (day: TripDay) => {
    const last = day.activities[day.activities.length - 1];
    mutate(day.day, (activities) => [
      ...activities,
      {
        type: 'visit',
        time_of_day: 'afternoon',
        title: t('editor.new_activity'),
        lat: last?.lat ?? 46.5,
        lng: last?.lng ?? 6.5,
      },
    ]);
    setExpanded(`${day.day}-${day.activities.length}`);
  };

  const update = (dayNumber: number, index: number, patch: Partial<TripActivity>) => {
    mutate(dayNumber, (activities) =>
      activities.map((a, i) => (i === index ? { ...a, ...patch } : a)),
    );
  };

  return (
    <ol className="flex flex-col gap-3">
      {sorted.map((day) => (
        <li key={day.day} className="rounded-trip border border-mist bg-snow p-4">
          <h3 className="font-display font-bold text-trail">
            <span className="font-mono text-xs font-semibold text-copper-deep">
              {t('trips.day')} {day.day}
            </span>{' '}
            · {day.title}
          </h3>
          <ul className="mt-2 flex flex-col gap-1.5">
            {day.activities.map((activity, i) => {
              const key = `${day.day}-${i}`;
              const open = expanded === key;
              return (
                <li key={key} className="rounded-xl border border-mist/70 bg-cloud">
                  <div className="flex items-center gap-1.5 px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : key)}
                      aria-expanded={open}
                      aria-label={`${t('editor.edit_activity')} — ${activity.title}`}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-medium text-trail"
                    >
                      {open ? (
                        <ChevronUp size={14} aria-hidden="true" />
                      ) : (
                        <ChevronDown size={14} aria-hidden="true" />
                      )}
                      <span className="truncate">{activity.title}</span>
                      <span className="shrink-0 text-xs text-fog">
                        {t(`activity.${activity.type}`)} · {t(`time.${activity.time_of_day}`)}
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={busy || i === 0}
                      onClick={() => move(day.day, i, -1)}
                      aria-label={`${t('editor.move_up')} — ${activity.title}`}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-ridge hover:bg-gold/20 disabled:opacity-30"
                    >
                      <ArrowUp size={15} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      disabled={busy || i === day.activities.length - 1}
                      onClick={() => move(day.day, i, 1)}
                      aria-label={`${t('editor.move_down')} — ${activity.title}`}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-ridge hover:bg-gold/20 disabled:opacity-30"
                    >
                      <ArrowDown size={15} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      disabled={busy || day.activities.length <= 1}
                      onClick={() => remove(day.day, i)}
                      aria-label={`${t('editor.delete')} — ${activity.title}`}
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-storm hover:bg-storm/10 disabled:opacity-30"
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </div>

                  {open && (
                    <div className="grid grid-cols-2 gap-2 border-t border-mist/70 p-3 sm:grid-cols-3">
                      <label className="col-span-2 flex flex-col gap-1 text-xs font-semibold text-ridge sm:col-span-3">
                        {t('editor.title')}
                        <input
                          type="text"
                          value={activity.title}
                          disabled={busy}
                          onChange={(e) => update(day.day, i, { title: e.target.value })}
                          className="min-h-10 rounded-lg border border-mist bg-snow px-2.5 text-sm font-normal text-trail"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-xs font-semibold text-ridge">
                        {t('editor.type')}
                        <select
                          value={activity.type}
                          disabled={busy}
                          onChange={(e) =>
                            update(day.day, i, { type: e.target.value as ActivityType })
                          }
                          className="min-h-10 rounded-lg border border-mist bg-snow px-2 text-sm font-normal text-trail"
                        >
                          {ACTIVITY_TYPES.map((type) => (
                            <option key={type} value={type}>
                              {t(`activity.${type}`)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1 text-xs font-semibold text-ridge">
                        {t('editor.time')}
                        <select
                          value={activity.time_of_day}
                          disabled={busy}
                          onChange={(e) =>
                            update(day.day, i, { time_of_day: e.target.value as TimeOfDay })
                          }
                          className="min-h-10 rounded-lg border border-mist bg-snow px-2 text-sm font-normal text-trail"
                        >
                          {TIMES.map((time) => (
                            <option key={time} value={time}>
                              {t(`time.${time}`)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1 text-xs font-semibold text-ridge">
                        {t('editor.duration')}
                        <input
                          type="number"
                          min={0}
                          value={activity.duration_min ?? ''}
                          disabled={busy}
                          onChange={(e) =>
                            update(day.day, i, {
                              duration_min: e.target.value ? Number(e.target.value) : undefined,
                            })
                          }
                          className="min-h-10 rounded-lg border border-mist bg-snow px-2.5 font-mono text-sm font-normal text-trail"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-xs font-semibold text-ridge">
                        {t('editor.cost')}
                        <input
                          type="number"
                          min={0}
                          value={activity.cost_estimate ?? ''}
                          disabled={busy}
                          onChange={(e) =>
                            update(day.day, i, {
                              cost_estimate: e.target.value ? Number(e.target.value) : undefined,
                            })
                          }
                          className="min-h-10 rounded-lg border border-mist bg-snow px-2.5 font-mono text-sm font-normal text-trail"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-xs font-semibold text-ridge">
                        {t('places.lat_label')}
                        <input
                          type="number"
                          step="0.0001"
                          value={activity.lat}
                          disabled={busy}
                          onChange={(e) => update(day.day, i, { lat: Number(e.target.value) })}
                          className="min-h-10 rounded-lg border border-mist bg-snow px-2.5 font-mono text-sm font-normal text-trail"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-xs font-semibold text-ridge">
                        {t('places.lng_label')}
                        <input
                          type="number"
                          step="0.0001"
                          value={activity.lng}
                          disabled={busy}
                          onChange={(e) => update(day.day, i, { lng: Number(e.target.value) })}
                          className="min-h-10 rounded-lg border border-mist bg-snow px-2.5 font-mono text-sm font-normal text-trail"
                        />
                      </label>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            disabled={busy}
            onClick={() => add(day)}
            className="mt-2 flex min-h-10 items-center gap-1.5 rounded-lg border border-dashed border-mist px-3 text-sm font-semibold text-ridge transition-colors hover:border-summit hover:text-copper-deep disabled:opacity-50"
          >
            <Plus size={15} aria-hidden="true" />
            {t('editor.add_activity')}
          </button>
        </li>
      ))}
    </ol>
  );
}
