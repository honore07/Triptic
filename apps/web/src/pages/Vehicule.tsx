import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_VEHICLE,
  useProfileStore,
  type Vehicle,
} from '../store/profileStore';

/** Contraintes de tracé cochables — chacune part en contrainte de génération. */
const FLAGS = ['avoid_low_bridges', 'avoid_unpaved', 'official_areas_only'] as const;

/** Champs numériques du gabarit et des réserves. */
const FIELDS: readonly {
  key: keyof Pick<
    Vehicle,
    'height_m' | 'length_m' | 'weight_t' | 'consumption_l' | 'tank_l' | 'water_l'
  >;
  step: number;
  unit: string;
}[] = [
  { key: 'height_m', step: 0.05, unit: 'm' },
  { key: 'length_m', step: 0.1, unit: 'm' },
  { key: 'weight_t', step: 0.1, unit: 't' },
  { key: 'consumption_l', step: 0.1, unit: 'L' },
  { key: 'tank_l', step: 1, unit: 'L' },
  { key: 'water_l', step: 1, unit: 'L' },
];

/**
 * Véhicule — planche PL.13 « MON VAN ».
 * Gabarit, réserves et contraintes de tracé du véhicule. Ces valeurs ne
 * dorment pas : elles rejoignent les contraintes envoyées au moteur à chaque
 * génération (profileConstraints), et le rayon d'autonomie se calcule du
 * réservoir et de la consommation — aucun chiffre décoratif.
 */
export function Vehicule() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const saved = useProfileStore((s) => s.vehicle);
  const saveVehicle = useProfileStore((s) => s.saveVehicle);
  const [draft, setDraft] = useState<Vehicle>(saved ?? DEFAULT_VEHICLE);
  const [done, setDone] = useState(false);

  const set = <K extends keyof Vehicle>(key: K, value: Vehicle[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setDone(false);
  };

  // Rayon d'action réel — ce que le réservoir permet avant ravitaillement
  const range =
    draft.consumption_l > 0 ? Math.round((draft.tank_l / draft.consumption_l) * 100) : 0;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    saveVehicle({ ...draft, name: draft.name.trim() });
    setDone(true);
  };

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6">
      <div className="fade-up flex items-baseline justify-between border-b border-mist pb-2">
        <p className="label-mono text-fog">{t('vehicule.plate')}</p>
        <button
          type="button"
          onClick={() => navigate('/profil')}
          className="label-mono min-h-11 text-copper-deep underline underline-offset-2"
        >
          {t('vehicule.back')}
        </button>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <div className="fade-up flex items-center gap-4">
          <img
            src="/vire/vire_char-sac.jpg"
            alt=""
            aria-hidden="true"
            loading="lazy"
            className="h-16 w-16 shrink-0 rounded-full border border-mist object-cover"
          />
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="label-mono text-fog">{t('vehicule.name')}</span>
            <input
              type="text"
              value={draft.name}
              placeholder={t('vehicule.name_placeholder')}
              onChange={(e) => set('name', e.target.value)}
              className="min-h-12 w-full border border-mist bg-snow px-3 font-display text-xl text-trail placeholder:font-body placeholder:text-base placeholder:text-fog"
            />
          </label>
        </div>

        {/* Gabarit et réserves */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {FIELDS.map(({ key, step, unit }) => (
            <label key={key} className="flex flex-col gap-1">
              <span className="label-mono text-fog">
                {t(`vehicule.${key}`)} ({unit})
              </span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step={step}
                value={draft[key]}
                onChange={(e) => set(key, Number(e.target.value))}
                className="min-h-12 w-full border border-mist bg-snow px-3 font-display text-xl font-semibold text-trail"
              />
            </label>
          ))}
        </section>

        {/* Rayon d'action déduit, jamais saisi */}
        <dl className="grid grid-cols-2 border border-mist">
          <div className="flex flex-col gap-0.5 border-r border-mist p-2.5">
            <dt className="label-mono text-fog">{t('vehicule.range')}</dt>
            <dd className="font-display text-2xl font-semibold leading-none text-trail">
              {range > 0 ? `${range} km` : '—'}
            </dd>
          </div>
          <div className="flex flex-col gap-0.5 p-2.5">
            <dt className="label-mono text-fog">{t('vehicule.service_every')}</dt>
            <dd className="font-display text-2xl font-semibold leading-none text-trail">
              {draft.service_every_days} {t('home.days', { count: draft.service_every_days })}
            </dd>
          </div>
        </dl>
        <p className="text-sm leading-relaxed text-ridge">{t('vehicule.reserves_note')}</p>

        {/* Contraintes de tracé */}
        <fieldset className="flex flex-col">
          <legend className="label-mono mb-1 text-fog">{t('vehicule.constraints')}</legend>
          {FLAGS.map((key) => (
            <div
              key={key}
              className="flex items-center justify-between gap-4 border-b border-mist py-3"
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-display text-lg leading-tight text-trail">
                  {t(`vehicule.flag_${key}`)}
                </span>
                <span className="text-sm text-ridge">{t(`vehicule.flag_${key}_hint`)}</span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={draft[key]}
                aria-label={t(`vehicule.flag_${key}`)}
                onClick={() => set(key, !draft[key])}
                className={`flex h-7 w-12 shrink-0 items-center rounded-full border border-mist p-0.5 transition-colors ${
                  draft[key] ? 'justify-end bg-summit' : 'justify-start bg-snow'
                }`}
              >
                <span className="h-5 w-5 rounded-full border border-mist bg-snow" />
              </button>
            </div>
          ))}
          <label className="flex items-center justify-between gap-4 py-3">
            <span className="font-display text-lg text-trail">
              {t('vehicule.service_every_label')}
            </span>
            <input
              type="number"
              min={0}
              max={14}
              value={draft.service_every_days}
              onChange={(e) => set('service_every_days', Number(e.target.value))}
              className="min-h-12 w-20 border border-mist bg-snow px-3 text-center font-display text-xl font-semibold text-trail"
            />
          </label>
        </fieldset>

        {done && (
          <p role="status" className="border border-pine bg-pine-tint px-3 py-2 text-sm text-pine-deep">
            {t('vehicule.saved')}
          </p>
        )}

        <button type="submit" className="cta-plate flex min-h-13 items-center justify-center px-6 py-4">
          {t('vehicule.save')}
        </button>
      </form>
    </main>
  );
}
