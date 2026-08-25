import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  SEASON_ACTIVITIES,
  isPracticable,
  seasonForDate,
  tripDurationDays,
} from '@triptic/shared';
import type { TripDates } from '../store/chatStore';

/** Date locale au format ISO court — jamais toISOString (décalage UTC). */
function iso(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

/** Lundi = 0 (semaine européenne). */
function mondayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

interface FenetreProps {
  /** null = pas de dates : l'IA déduit la durée de la demande. */
  onConfirm: (dates: TripDates | null) => void;
  disabled?: boolean;
}

/**
 * Fenêtre — planche PL.04 « DATES ».
 * Calendrier de sélection d'une fenêtre de départ, relevé des nuits, et
 * lecture de la saison : ce qu'elle rend praticable s'affiche en plein, le
 * reste en retrait (proposable, mais avec un avertissement).
 */
export function Fenetre({ onConfirm, disabled = false }: FenetreProps) {
  const { t, i18n } = useTranslation();
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);

  const monthLabel = new Intl.DateTimeFormat(i18n.language, {
    month: 'long',
    year: 'numeric',
  }).format(cursor);

  // Initiales de jours dans la langue courante — aucune chaîne en dur
  const weekdays = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(i18n.language, { weekday: 'narrow' });
    // 2024-01-01 est un lundi : base stable pour dérouler la semaine
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 1 + i)));
  }, [i18n.language]);

  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const total = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const blanks = Array.from({ length: mondayIndex(first) }, () => null);
    const days = Array.from(
      { length: total },
      (_, i) => new Date(cursor.getFullYear(), cursor.getMonth(), i + 1),
    );
    return [...blanks, ...days];
  }, [cursor]);

  const pick = (day: Date) => {
    const value = iso(day);
    // Premier clic, ou clic avant le départ : la fenêtre repart de ce jour
    if (!start || end || value < start) {
      setStart(value);
      setEnd(null);
      return;
    }
    setEnd(value);
  };

  const nights = start && end ? (tripDurationDays(start, end) ?? 1) - 1 : null;
  const season = start ? seasonForDate(start) : null;

  const dayFmt = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'long' });
  const fullFmt = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long' });
  const windowLabel =
    start && end
      ? `${new Intl.DateTimeFormat(i18n.language, { day: 'numeric' }).format(new Date(start))} → ${dayFmt.format(new Date(end))}`
      : null;

  return (
    <section className="fade-up flex flex-col gap-5 border border-mist bg-snow p-5">
      <div className="flex flex-col gap-2">
        <p className="label-mono text-fog">{t('fenetre.plate')}</p>
        <h2 className="font-display text-3xl font-semibold leading-tight text-trail">
          {t('fenetre.title')}
        </h2>
      </div>

      {/* Navigation de mois */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          disabled={disabled}
          aria-label={t('fenetre.prev_month')}
          onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-mist bg-snow text-trail transition-colors hover:bg-sky disabled:text-fog"
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <p aria-live="polite" className="label-mono text-trail">
          {monthLabel}
        </p>
        <button
          type="button"
          disabled={disabled}
          aria-label={t('fenetre.next_month')}
          onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-mist bg-snow text-trail transition-colors hover:bg-sky disabled:text-fog"
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>

      {/* Grille du mois */}
      <div>
        <div className="grid grid-cols-7 gap-1" aria-hidden="true">
          {weekdays.map((w, i) => (
            <span key={i} className="label-mono py-1 text-center text-fog">
              {w}
            </span>
          ))}
        </div>
        <div role="grid" aria-label={t('fenetre.title')} className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (!day) return <span key={`b${i}`} />;
            const value = iso(day);
            const past = day < today;
            const isStart = value === start;
            const isEnd = value === end;
            const inside = Boolean(start && end && value > start && value < end);
            const edge = isStart || isEnd;
            return (
              <button
                key={value}
                type="button"
                role="gridcell"
                disabled={disabled || past}
                aria-pressed={edge || inside}
                aria-label={fullFmt.format(day)}
                onClick={() => pick(day)}
                className={`flex min-h-11 items-center justify-center border font-mono text-xs transition-colors ${
                  edge
                    ? 'border-mist bg-summit font-bold text-snow'
                    : inside
                      ? 'border-mist bg-sky text-trail'
                      : past
                        ? 'border-transparent text-fog'
                        : 'border-mist bg-snow text-trail hover:bg-sky'
                }`}
              >
                {day.getDate()}
              </button>
            );
          })}
        </div>
      </div>

      {/* Relevé de la fenêtre */}
      <div className="flex items-end justify-between border-y border-mist py-3">
        <div className="flex flex-col gap-1">
          <p className="label-mono text-fog">{t('fenetre.window')}</p>
          <p className="font-display text-2xl font-semibold text-trail">
            {windowLabel ?? t('fenetre.no_window')}
          </p>
        </div>
        {nights !== null && (
          <div className="flex flex-col items-end gap-1">
            <p className="label-mono text-fog">{t('fenetre.nights')}</p>
            <p className="font-display text-2xl font-semibold text-trail">{nights}</p>
          </div>
        )}
      </div>

      {/* Lecture de la saison */}
      {season && (
        <div className="flex flex-col gap-3">
          <p className="label-mono text-fog">
            {t('fenetre.season')} — {t(`season.${season}`)}
          </p>
          <p className="font-display text-base italic text-ridge">
            {t(`season.note_${season}`)}
          </p>
          <div role="group" aria-label={t('fenetre.activities')} className="flex flex-wrap gap-1.5">
            {SEASON_ACTIVITIES.map((activity) => {
              const ok = isPracticable(season, activity);
              return (
                <span
                  key={activity}
                  className={`border px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.14em] ${
                    ok ? 'border-mist bg-summit text-snow' : 'border-mist bg-snow text-fog'
                  }`}
                >
                  {t(`season.activity_${activity}`)}
                  <span className="sr-only">
                    {' — '}
                    {ok ? t('fenetre.practicable') : t('fenetre.with_warning')}
                  </span>
                </span>
              );
            })}
          </div>
          <p className="text-xs leading-relaxed text-ridge">{t('fenetre.season_note')}</p>
        </div>
      )}

      <button
        type="button"
        disabled={disabled}
        onClick={() => onConfirm(start && end ? { start, end } : null)}
        className="cta-plate flex min-h-13 items-center justify-center px-6 py-4"
      >
        {t('fenetre.cta')}
      </button>
    </section>
  );
}
