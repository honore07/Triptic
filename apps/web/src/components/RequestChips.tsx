import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Minus, Plus, RefreshCw, SlidersHorizontal } from 'lucide-react';
import type { Budget, Difficulty, GroupType, TripRequest, Vehicle } from '@triptic/shared';

/**
 * Onboarding hybride (roadmap 1.1) — les paramètres détectés par l'IA
 * deviennent des puces éditables en 1 tap, liées aux valeurs d'enum
 * TripRequest (jamais de texte re-parsé). Un tap = valeur suivante ;
 * « Régénérer » n'apparaît que si quelque chose a changé.
 */

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];
const GROUPS: GroupType[] = ['solo', 'couple', 'family', 'group'];
const VEHICLES: Vehicle[] = ['van', 'car', 'moto', 'none'];
const BUDGETS: Budget[] = ['low', 'medium', 'high'];

function next<T>(values: T[], current: T): T {
  const i = values.indexOf(current);
  return values[(i + 1) % values.length] as T;
}

interface Props {
  request: TripRequest;
  busy: boolean;
  onRegenerate: (patch: Partial<TripRequest>) => void;
}

export function RequestChips({ request, busy, onRegenerate }: Props) {
  const { t } = useTranslation();
  const [patch, setPatch] = useState<Partial<TripRequest>>({});

  const merged: TripRequest = { ...request, ...patch };
  const dirty = Object.keys(patch).length > 0;

  const setField = <K extends keyof TripRequest>(key: K, value: TripRequest[K]) => {
    setPatch((prev) => ({ ...prev, [key]: value }));
  };

  const chipClass = (changed: boolean) =>
    `flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${
      changed
        ? 'border-summit bg-summit/10 text-copper-deep'
        : 'border-mist bg-snow text-trail hover:border-summit'
    }`;

  return (
    <section
      aria-labelledby="request-chips-title"
      className="fade-up rounded-trip border border-mist bg-terrain/60 p-4"
    >
      <div className="flex items-center gap-2">
        <SlidersHorizontal size={15} className="text-summit" aria-hidden="true" />
        <h2 id="request-chips-title" className="font-display text-sm font-bold text-trail">
          {t('request.title')}
        </h2>
        <span className="text-xs text-ridge">{t('request.hint')}</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {/* Durée : stepper ± */}
        <div
          className={chipClass(patch.duration_days !== undefined)}
          role="group"
          aria-label={t('request.duration')}
        >
          <button
            type="button"
            disabled={busy || merged.duration_days <= 1}
            onClick={() => setField('duration_days', merged.duration_days - 1)}
            aria-label={t('request.duration_minus')}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-gold/20 disabled:opacity-40"
          >
            <Minus size={14} aria-hidden="true" />
          </button>
          <span className="font-mono">
            {merged.duration_days} {t('trips.days')}
          </span>
          <button
            type="button"
            disabled={busy || merged.duration_days >= 60}
            onClick={() => setField('duration_days', merged.duration_days + 1)}
            aria-label={t('request.duration_plus')}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-gold/20 disabled:opacity-40"
          >
            <Plus size={14} aria-hidden="true" />
          </button>
        </div>

        {/* Puces cycliques : 1 tap = valeur suivante */}
        <button
          type="button"
          disabled={busy}
          onClick={() => setField('difficulty', next(DIFFICULTIES, merged.difficulty))}
          aria-label={`${t('request.difficulty')} : ${t(`difficulty.${merged.difficulty}`)} — ${t('request.tap_to_change')}`}
          className={chipClass(patch.difficulty !== undefined)}
        >
          {t('request.difficulty')} · {t(`difficulty.${merged.difficulty}`)}
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() => setField('group_type', next(GROUPS, merged.group_type))}
          aria-label={`${t('request.group')} : ${t(`request.group_${merged.group_type}`)} — ${t('request.tap_to_change')}`}
          className={chipClass(patch.group_type !== undefined)}
        >
          {t(`request.group_${merged.group_type}`)}
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() => setField('vehicle', next(VEHICLES, merged.vehicle ?? 'van'))}
          aria-label={`${t('request.vehicle')} : ${t(`request.vehicle_${merged.vehicle ?? 'van'}`)} — ${t('request.tap_to_change')}`}
          className={chipClass(patch.vehicle !== undefined)}
        >
          {t(`request.vehicle_${merged.vehicle ?? 'van'}`)}
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() => setField('budget', next(BUDGETS, merged.budget))}
          aria-label={`${t('request.budget')} : ${t(`request.budget_${merged.budget}`)} — ${t('request.tap_to_change')}`}
          className={chipClass(patch.budget !== undefined)}
        >
          {t('request.budget')} · {t(`request.budget_${merged.budget}`)}
        </button>

        <button
          type="button"
          disabled={busy}
          role="switch"
          aria-checked={merged.camping}
          onClick={() => setField('camping', !merged.camping)}
          aria-label={t('request.camping')}
          className={chipClass(patch.camping !== undefined)}
        >
          {merged.camping ? '✓ ' : ''}
          {t('request.camping')}
        </button>

        <button
          type="button"
          disabled={busy}
          role="switch"
          aria-checked={merged.avoid_crowds}
          onClick={() => setField('avoid_crowds', !merged.avoid_crowds)}
          aria-label={t('request.crowds')}
          className={chipClass(patch.avoid_crowds !== undefined)}
        >
          {merged.avoid_crowds ? '✓ ' : ''}
          {t('request.crowds')}
        </button>
      </div>

      {dirty && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            onRegenerate(patch);
            setPatch({});
          }}
          className="glow-cta mt-3 flex min-h-11 items-center gap-2 rounded-xl bg-gold px-5 py-2.5 text-sm font-bold text-trail transition-all duration-200 hover:-translate-y-0.5 hover:bg-gold-deep disabled:translate-y-0 disabled:opacity-60"
        >
          <RefreshCw size={15} aria-hidden="true" />
          {t('request.regenerate')}
        </button>
      )}
    </section>
  );
}
