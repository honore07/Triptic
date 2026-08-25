import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin } from 'lucide-react';
import { seasonForDate, tripDurationDays } from '@triptic/shared';
import type { GroupType, TripRequest, TripTuning, TuningValue } from '@triptic/shared';
import type { TripDates } from '../store/chatStore';
import { Bascule } from './Bascule';
import { profileConstraints } from '../store/profileStore';

/** Corrections confirmées à la main, transmises telles quelles au moteur. */
export type TripPlaces = Pick<
  Partial<TripRequest>,
  'departure' | 'destination' | 'modes' | 'group_type' | 'constraints'
>;

/** Les 4 axes qui différencient les 3 trips (injectés dans le prompt système). */
const AXES = ['physical', 'pace', 'culture', 'discovery'] as const;

/** Le curseur « nous serons » mappe 1:1 l'énumération du moteur. */
const GROUPS: readonly GroupType[] = ['solo', 'couple', 'family', 'group'];

/** Contraintes à cocher — la valeur envoyée est la phrase traduite. */
const CONSTRAINTS = ['train', 'exposed', 'dog'] as const;

const DEFAULT_TUNING: TripTuning = { physical: 3, pace: 3, culture: 3, discovery: 3 };

interface Props {
  /** Fenêtre posée en PL.04 — alimente le relevé de bas de planche. */
  dates?: TripDates | null;
  /** Les dates ne transitent plus ici : la fenêtre (PL.04) les a déjà posées. */
  onConfirm: (tuning: TripTuning, places: TripPlaces) => void;
  disabled?: boolean;
}

/** Rangée de curseur — libellé, valeur courante à l'accent, bornes en mono. */
function Reglage({
  id,
  label,
  value,
  valueLabel,
  low,
  high,
  max,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  valueLabel: string;
  low: string;
  high: string;
  max: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="label-mono text-ridge">
          {label}
        </label>
        <span className="label-mono text-copper-deep">{valueLabel}</span>
      </div>
      <input
        id={id}
        type="range"
        min={1}
        max={max}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="tuner-range"
      />
      <div className="flex justify-between">
        <span className="label-mono text-fog">{low}</span>
        <span className="label-mono text-fog">{high}</span>
      </div>
    </div>
  );
}

/**
 * TripTuner — planche PL.05 « PRÉCISIONS ».
 * Les derniers réglages avant de tracer : la cordée, le sac, les 4 axes qui
 * différencient les 3 trips, les contraintes à cocher et le champ libre.
 * Le relevé de bas de planche rappelle la fenêtre posée en PL.04.
 */
export function TripTuner({ dates = null, onConfirm, disabled = false }: Props) {
  const { t } = useTranslation();
  const [tuning, setTuning] = useState<TripTuning>(DEFAULT_TUNING);
  const [group, setGroup] = useState(2); // 1-4 → GROUPS
  const [pack, setPack] = useState(3); // 1-5, 3 = standard
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState('');
  const [departure, setDeparture] = useState('');
  const [destination, setDestination] = useState('');
  const [roundTrip, setRoundTrip] = useState(true);

  const setAxis = (key: keyof TripTuning, value: number) => {
    setTuning((prev) => ({ ...prev, [key]: value as TuningValue }));
  };

  const season = dates ? seasonForDate(dates.start) : null;
  const duration = dates ? tripDurationDays(dates.start, dates.end) : null;

  const submit = () => {
    const places: TripPlaces = {};
    // Champs vides = on laisse l'IA déduire depuis la conversation
    const from = departure.trim();
    const to = destination.trim();
    if (from) {
      places.departure = from;
      if (roundTrip) places.destination = from;
    }
    if (!roundTrip && to) places.destination = to;

    places.group_type = GROUPS[group - 1] as GroupType;

    // Les contraintes sont du texte libre côté moteur : on lui envoie les
    // phrases dans la langue de l'utilisateur, jamais des codes internes.
    const constraints = CONSTRAINTS.filter((key) => flags[key]).map((key) =>
      t(`tuner.constraint_${key}`),
    );
    if (pack !== 3) constraints.push(t(`tuner.pack_${pack}`));
    const free = note.trim();
    if (free) constraints.push(free);
    // Préférences durables et véhicule enregistré (PL.13/PL.14) — même canal
    constraints.push(...profileConstraints().map(({ key, params }) => t(key, params ?? {})));
    if (constraints.length > 0) places.constraints = constraints;

    onConfirm(tuning, places);
  };

  return (
    <section
      aria-labelledby="tuner-title"
      className="fade-up flex flex-col gap-6 border border-mist bg-snow p-5"
    >
      <div className="flex flex-col gap-2">
        <p className="label-mono text-fog">{t('tuner.plate')}</p>
        <h2
          id="tuner-title"
          className="font-display text-3xl font-semibold leading-tight text-trail"
        >
          {t('tuner.title')}
        </h2>
      </div>

      <div className="flex flex-col gap-5">
        <Reglage
          id="tuner-group"
          label={t('tuner.group_label')}
          value={group}
          valueLabel={t(`group.${GROUPS[group - 1]}`)}
          low={t('group.solo')}
          high={t('group.group')}
          max={GROUPS.length}
          disabled={disabled}
          onChange={setGroup}
        />
        <Reglage
          id="tuner-pack"
          label={t('tuner.pack_label')}
          value={pack}
          valueLabel={t(`tuner.pack_${pack}`)}
          low={t('tuner.pack_1')}
          high={t('tuner.pack_5')}
          max={5}
          disabled={disabled}
          onChange={setPack}
        />
        {AXES.map((key) => (
          <Reglage
            key={key}
            id={`tuner-${key}`}
            label={t(`tuner.${key}_label`)}
            value={tuning[key]}
            valueLabel={`${tuning[key]}/5`}
            low={t(`tuner.${key}_low`)}
            high={t(`tuner.${key}_high`)}
            max={5}
            disabled={disabled}
            onChange={(v) => setAxis(key, v)}
          />
        ))}
      </div>

      <fieldset className="flex flex-col">
        <legend className="label-mono mb-1 text-fog">{t('tuner.constraints_label')}</legend>
        {CONSTRAINTS.map((key) => (
          <Bascule
            key={key}
            label={t(`tuner.constraint_${key}`)}
            on={Boolean(flags[key])}
            disabled={disabled}
            onToggle={() => setFlags((prev) => ({ ...prev, [key]: !prev[key] }))}
          />
        ))}
      </fieldset>

      {/* Départ / arrivée — facultatif, mais c'est ce qui rend les temps de
       * trajet justes (domicile, gare, agence de location). */}
      <fieldset className="flex flex-col gap-3">
        <legend className="label-mono mb-1 flex items-center gap-1.5 text-fog">
          <MapPin size={13} aria-hidden="true" />
          {t('tuner.places_label')}
        </legend>
        <label className="flex flex-col gap-1">
          <span className="label-mono text-ridge">{t('tuner.place_from')}</span>
          <input
            type="text"
            value={departure}
            disabled={disabled}
            placeholder={t('tuner.place_from_placeholder')}
            onChange={(e) => setDeparture(e.target.value)}
            className="min-h-11 border border-mist bg-cloud px-3 text-sm text-trail placeholder:text-fog"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-ridge">
          <input
            type="checkbox"
            checked={roundTrip}
            disabled={disabled}
            onChange={(e) => setRoundTrip(e.target.checked)}
            className="h-4 w-4 accent-[var(--color-summit)]"
          />
          {t('tuner.round_trip')}
        </label>
        {!roundTrip && (
          <label className="flex flex-col gap-1">
            <span className="label-mono text-ridge">{t('tuner.place_to')}</span>
            <input
              type="text"
              value={destination}
              disabled={disabled}
              placeholder={t('tuner.place_to_placeholder')}
              onChange={(e) => setDestination(e.target.value)}
              className="min-h-11 border border-mist bg-cloud px-3 text-sm text-trail placeholder:text-fog"
            />
          </label>
        )}
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="tuner-note" className="label-mono text-fog">
          {t('tuner.other_label')}
        </label>
        <textarea
          id="tuner-note"
          rows={2}
          value={note}
          disabled={disabled}
          placeholder={t('tuner.other_placeholder')}
          onChange={(e) => setNote(e.target.value)}
          className="w-full resize-none border border-mist bg-cloud p-3 font-display text-base italic text-trail placeholder:text-fog"
        />
      </div>

      {/* Relevé de bas de planche — ce qui est déjà acquis */}
      {dates && duration !== null && season && (
        <dl className="grid grid-cols-3 border border-mist">
          <div className="flex flex-col gap-0.5 border-r border-mist p-2.5">
            <dt className="label-mono text-fog">{t('fenetre.window')}</dt>
            <dd className="font-display text-base font-semibold text-trail">
              {new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(
                new Date(dates.start),
              )}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5 border-r border-mist p-2.5">
            <dt className="label-mono text-fog">{t('fenetre.season')}</dt>
            <dd className="font-display text-base font-semibold text-trail">
              {t(`season.${season}`)}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5 p-2.5">
            <dt className="label-mono text-fog">{t('tuner.summary_engagement')}</dt>
            <dd className="font-display text-base font-semibold text-trail">
              {t(`tuner.engagement_${tuning.physical}`)}
            </dd>
          </div>
        </dl>
      )}

      <button
        type="button"
        disabled={disabled}
        onClick={submit}
        className="cta-plate flex min-h-13 items-center justify-center px-6 py-4"
      >
        {t('tuner.cta')}
      </button>
    </section>
  );
}
