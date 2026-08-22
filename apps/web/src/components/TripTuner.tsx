import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bike,
  CalendarDays,
  Caravan,
  Compass,
  Footprints,
  Landmark,
  Lock,
  MapPin,
  Mountain,
  Sparkles,
  Wind,
} from 'lucide-react';
import { PLANS, seasonForDate, tripDurationDays } from '@triptic/shared';
import type { TripMode, TripRequest, TripTuning, TuningValue } from '@triptic/shared';
import type { TripDates } from '../store/chatStore';
import { useUserStore } from '../store/userStore';

/** Corrections confirmées à la main (boucle = arrivée == départ ; mode choisi). */
export type TripPlaces = Pick<Partial<TripRequest>, 'departure' | 'destination' | 'modes'>;

/** Van life en premier plan, puis trek, puis bikepacking (objectif produit). */
const MODES: Array<{ key: TripMode; Icon: typeof Caravan }> = [
  { key: 'roadtrip', Icon: Caravan },
  { key: 'trek', Icon: Footprints },
  { key: 'bikepacking', Icon: Bike },
];

const AXES = [
  { key: 'physical', Icon: Mountain },
  { key: 'pace', Icon: Wind },
  { key: 'culture', Icon: Landmark },
  { key: 'discovery', Icon: Compass },
] as const;

const DEFAULT_TUNING: TripTuning = { physical: 3, pace: 3, culture: 3, discovery: 3 };

interface Props {
  onConfirm: (tuning: TripTuning, dates: TripDates | null, places: TripPlaces) => void;
  disabled?: boolean;
}

/**
 * TripTuner — 4 curseurs 1-5 posés juste après la demande initiale pour
 * tailler les 3 trips sur mesure (niveau sportif, rythme, activités,
 * incontournables ↔ hors des sentiers).
 */
export function TripTuner({ onConfirm, disabled = false }: Props) {
  const { t } = useTranslation();
  const { plan, openPaywall } = useUserStore();
  const [tuning, setTuning] = useState<TripTuning>(DEFAULT_TUNING);
  // null = pas de choix explicite → l'IA déduit le mode depuis la conversation
  const [mode, setMode] = useState<TripMode | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [departure, setDeparture] = useState('');
  const [destination, setDestination] = useState('');
  const [roundTrip, setRoundTrip] = useState(true);

  const allowedModes = PLANS[plan].limits.modes;

  const setAxis = (key: keyof TripTuning, value: number) => {
    setTuning((prev) => ({ ...prev, [key]: value as TuningValue }));
  };

  const today = new Date().toISOString().slice(0, 10);
  const duration = startDate && endDate ? tripDurationDays(startDate, endDate) : null;
  const season = startDate ? seasonForDate(startDate) : null;
  const datesInvalid = Boolean(startDate && endDate && duration === null);
  const dates: TripDates | null =
    startDate && endDate && duration !== null ? { start: startDate, end: endDate } : null;

  // Champs vides = on laisse l'IA déduire depuis la conversation (pas d'override)
  const places: TripPlaces = {};
  const from = departure.trim();
  const to = destination.trim();
  if (from) {
    places.departure = from;
    if (roundTrip) places.destination = from;
  }
  if (!roundTrip && to) places.destination = to;
  if (mode) places.modes = [mode];

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

      <fieldset className="mt-5 rounded-xl border border-mist bg-cloud p-3">
        <legend className="flex items-center gap-1.5 px-1 text-sm font-semibold text-trail">
          <Caravan size={15} className="text-summit" aria-hidden="true" />
          {t('tuner.mode_label')}
        </legend>
        <p className="mb-2 text-xs text-fog">{t('tuner.mode_hint')}</p>
        <div className="flex flex-wrap gap-2">
          {MODES.map(({ key, Icon }) => {
            const active = mode === key;
            const locked = !allowedModes.includes(key);
            return (
              <button
                key={key}
                type="button"
                disabled={disabled}
                aria-pressed={active}
                title={locked ? t('tuner.mode_locked') : undefined}
                onClick={() => {
                  if (locked) {
                    openPaywall();
                    return;
                  }
                  setMode((prev) => (prev === key ? null : key));
                }}
                className={`flex min-h-11 items-center gap-1.5 border px-3.5 text-sm font-semibold transition-colors ${
                  active
                    ? 'border-summit bg-summit text-snow'
                    : locked
                      ? 'border-mist bg-snow text-fog'
                      : 'border-mist bg-snow text-trail hover:border-summit'
                }`}
              >
                <Icon size={15} aria-hidden="true" />
                {t(`mode.${key}`)}
                {locked && <Lock size={12} aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="mt-4 rounded-xl border border-mist bg-cloud p-3">
        <legend className="flex items-center gap-1.5 px-1 text-sm font-semibold text-trail">
          <MapPin size={15} className="text-summit" aria-hidden="true" />
          {t('tuner.places_label')}
        </legend>
        <p className="mb-2 text-xs text-fog">{t('tuner.places_hint')}</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs font-semibold text-ridge">
            {t('tuner.place_from')}
            <input
              type="text"
              value={departure}
              disabled={disabled}
              placeholder={t('tuner.place_from_placeholder')}
              onChange={(e) => setDeparture(e.target.value)}
              className="min-h-11 rounded-lg border border-mist bg-snow px-2.5 text-sm font-normal text-trail placeholder:text-fog"
            />
          </label>
          {!roundTrip && (
            <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs font-semibold text-ridge">
              {t('tuner.place_to')}
              <input
                type="text"
                value={destination}
                disabled={disabled}
                placeholder={t('tuner.place_to_placeholder')}
                onChange={(e) => setDestination(e.target.value)}
                className="min-h-11 rounded-lg border border-mist bg-snow px-2.5 text-sm font-normal text-trail placeholder:text-fog"
              />
            </label>
          )}
        </div>
        <label className="mt-2 flex min-h-11 items-center gap-2 text-sm font-semibold text-trail">
          <input
            type="checkbox"
            checked={roundTrip}
            disabled={disabled}
            onChange={(e) => setRoundTrip(e.target.checked)}
            className="h-5 w-5 shrink-0 rounded border-mist accent-summit"
          />
          {t('tuner.round_trip')}
        </label>
      </fieldset>

      <fieldset className="mt-4 rounded-xl border border-mist bg-cloud p-3">
        <legend className="flex items-center gap-1.5 px-1 text-sm font-semibold text-trail">
          <CalendarDays size={15} className="text-summit" aria-hidden="true" />
          {t('tuner.dates_label')}
        </legend>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-semibold text-ridge">
            {t('tuner.date_start')}
            <input
              type="date"
              value={startDate}
              min={today}
              disabled={disabled}
              onChange={(e) => {
                setStartDate(e.target.value);
                if (endDate && e.target.value > endDate) setEndDate(e.target.value);
              }}
              className="min-h-11 rounded-lg border border-mist bg-snow px-2.5 font-mono text-sm font-normal text-trail"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-ridge">
            {t('tuner.date_end')}
            <input
              type="date"
              value={endDate}
              min={startDate || today}
              disabled={disabled}
              onChange={(e) => setEndDate(e.target.value)}
              className="min-h-11 rounded-lg border border-mist bg-snow px-2.5 font-mono text-sm font-normal text-trail"
            />
          </label>
          {duration !== null && season && (
            <p className="rounded-badge bg-gold/20 px-2.5 py-1.5 text-xs font-semibold text-trail">
              {t('trips.days_count', { count: duration })} · {t(`season.${season}`)} —{' '}
              {t('tuner.dates_season_hint')}
            </p>
          )}
          {!startDate && (
            <p className="text-xs text-fog">{t('tuner.dates_hint')}</p>
          )}
        </div>
        {datesInvalid && (
          <p role="alert" className="mt-2 text-xs font-semibold text-storm">
            {t('tuner.dates_invalid')}
          </p>
        )}
      </fieldset>

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
        disabled={disabled || datesInvalid}
        onClick={() => onConfirm(tuning, dates, places)}
        className="glow-cta mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gold px-6 py-3 font-display font-bold text-trail transition-all duration-200 hover:-translate-y-0.5 hover:bg-gold-deep disabled:translate-y-0 disabled:opacity-60"
      >
        <Sparkles size={18} aria-hidden="true" />
        {t('tuner.cta')}
      </button>
    </section>
  );
}
