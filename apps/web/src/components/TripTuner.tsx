import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Compass, Landmark, Mountain, Sparkles, Wind } from 'lucide-react';
import type { TripTuning, TuningValue } from '@triptic/shared';

const AXES = [
  { key: 'physical', Icon: Mountain },
  { key: 'pace', Icon: Wind },
  { key: 'culture', Icon: Landmark },
  { key: 'discovery', Icon: Compass },
] as const;

const DEFAULT_TUNING: TripTuning = { physical: 3, pace: 3, culture: 3, discovery: 3 };

interface Props {
  onConfirm: (tuning: TripTuning) => void;
  disabled?: boolean;
}

/**
 * TripTuner — 4 curseurs 1-5 posés juste après la demande initiale pour
 * tailler les 3 trips sur mesure (niveau sportif, rythme, activités,
 * incontournables ↔ hors des sentiers).
 */
export function TripTuner({ onConfirm, disabled = false }: Props) {
  const { t } = useTranslation();
  const [tuning, setTuning] = useState<TripTuning>(DEFAULT_TUNING);

  const setAxis = (key: keyof TripTuning, value: number) => {
    setTuning((prev) => ({ ...prev, [key]: value as TuningValue }));
  };

  return (
    <section
      aria-labelledby="tuner-title"
      className="fade-up rounded-trip border border-mist bg-snow p-5 shadow-lg sm:p-6"
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold/20">
          <Sparkles size={18} className="text-copper-deep" aria-hidden="true" />
        </span>
        <div>
          <h2 id="tuner-title" className="font-display text-lg font-bold text-trail">
            {t('tuner.title')}
          </h2>
          <p className="text-xs text-ridge">{t('tuner.hint')}</p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-5">
        {AXES.map(({ key, Icon }, i) => {
          const value = tuning[key];
          return (
            <div
              key={key}
              className="fade-up flex flex-col gap-1.5"
              style={{ animationDelay: `${80 + i * 70}ms` }}
            >
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor={`tuner-${key}`}
                  className="flex items-center gap-1.5 text-sm font-semibold text-trail"
                >
                  <Icon size={15} className="text-summit" aria-hidden="true" />
                  {t(`tuner.${key}_label`)}
                </label>
                <span className="rounded-badge bg-gold/20 px-2 py-0.5 font-mono text-xs font-semibold text-trail">
                  {value}/5
                </span>
              </div>
              <input
                id={`tuner-${key}`}
                type="range"
                min={1}
                max={5}
                step={1}
                value={value}
                disabled={disabled}
                onChange={(e) => setAxis(key, Number(e.target.value))}
                aria-valuetext={`${value}/5 — ${
                  value <= 2
                    ? t(`tuner.${key}_low`)
                    : value >= 4
                      ? t(`tuner.${key}_high`)
                      : `${t(`tuner.${key}_low`)} / ${t(`tuner.${key}_high`)}`
                }`}
                className="tuner-range"
              />
              <div className="flex justify-between text-[11px] text-fog">
                <span className={value <= 2 ? 'font-semibold text-copper-deep' : ''}>
                  {t(`tuner.${key}_low`)}
                </span>
                <span className={value >= 4 ? 'font-semibold text-copper-deep' : ''}>
                  {t(`tuner.${key}_high`)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={() => onConfirm(tuning)}
        className="glow-cta mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gold px-6 py-3 font-display font-bold text-trail transition-all duration-200 hover:-translate-y-0.5 hover:bg-gold-deep disabled:translate-y-0 disabled:opacity-60"
      >
        <Sparkles size={18} aria-hidden="true" />
        {t('tuner.cta')}
      </button>
    </section>
  );
}
