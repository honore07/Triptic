import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Caravan } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useProfileStore, type Preferences, type Units } from '../store/profileStore';
import { useUserStore } from '../store/userStore';

const UNITS: readonly Units[] = ['metric', 'imperial'];

const PREFS: readonly (keyof Preferences)[] = [
  'weather_alerts',
  'legal_bivouac',
  'avoid_refuges',
  'offline_maps',
];

/** Interrupteur de préférence — plaque pleine à l'accent quand il est actif. */
function Bascule({
  label,
  hint,
  on,
  onToggle,
}: {
  label: string;
  hint: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-mist py-3">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-display text-lg leading-tight text-trail">{label}</span>
        <span className="text-sm text-ridge">{hint}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={onToggle}
        className={`flex h-7 w-12 shrink-0 items-center rounded-full border border-mist p-0.5 transition-colors ${
          on ? 'justify-end bg-summit' : 'justify-start bg-snow'
        }`}
      >
        <span className="h-5 w-5 rounded-full border border-mist bg-snow" />
      </button>
    </div>
  );
}

/**
 * Profil — planche PL.14 « PROFIL ».
 * Unités d'affichage, préférences durables et région couverte. Les
 * préférences ne décorent pas : elles partent en contraintes de génération
 * (profileConstraints), au même titre que celles de PL.05.
 */
export function Profil() {
  const { t } = useTranslation();
  const email = useUserStore((s) => s.email);
  const { units, preferences, vehicle, setUnits, setPreference } = useProfileStore();
  // Copie locale : sans elle, TypeScript ne peut pas garantir que le client
  // est encore non-null au moment du clic.
  const client = supabase;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6">
      <div className="fade-up flex items-baseline justify-between border-b border-mist pb-2">
        <p className="label-mono text-fog">{t('profil.plate')}</p>
      </div>

      {/* Identité — la gravure du sac tient lieu de portrait */}
      <div className="fade-up flex items-center gap-4">
        <img
          src="/vire/vire_pic-sac.jpg"
          alt=""
          aria-hidden="true"
          loading="lazy"
          className="h-16 w-16 shrink-0 rounded-full border border-mist object-cover"
        />
        <div className="flex min-w-0 flex-col gap-0.5">
          <h1 className="truncate font-display text-3xl font-semibold leading-tight text-trail">
            {email ?? t('profil.anonymous')}
          </h1>
          <p className="label-mono text-copper-deep">{t('profil.subtitle')}</p>
        </div>
      </div>

      {/* Unités */}
      <section className="flex flex-col gap-1.5">
        <p className="label-mono text-fog">{t('profil.units')}</p>
        <div role="group" aria-label={t('profil.units')} className="flex border border-mist">
          {UNITS.map((key, i) => (
            <button
              key={key}
              type="button"
              aria-pressed={units === key}
              onClick={() => setUnits(key)}
              className={`min-h-11 flex-1 font-mono text-[10px] font-medium uppercase tracking-[0.12em] transition-colors ${
                i > 0 ? 'border-l border-mist' : ''
              } ${units === key ? 'bg-summit text-snow' : 'bg-snow text-trail hover:bg-sky'}`}
            >
              {t(`profil.units_${key}`)}
            </button>
          ))}
        </div>
      </section>

      {/* Préférences */}
      <section className="flex flex-col">
        <p className="label-mono mb-1 text-fog">{t('profil.preferences')}</p>
        {PREFS.map((key) => (
          <Bascule
            key={key}
            label={t(`profil.pref_${key}`)}
            hint={t(`profil.pref_${key}_hint`)}
            on={preferences[key]}
            onToggle={() => setPreference(key, !preferences[key])}
          />
        ))}
      </section>

      {/* Véhicule enregistré — raccourci vers PL.13 */}
      <Link
        to="/vehicule"
        className="flex items-center gap-3 border border-mist bg-snow p-3 transition-colors hover:bg-sky"
      >
        <Caravan size={20} className="shrink-0 text-summit" aria-hidden="true" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="label-mono text-fog">{t('vehicule.plate')}</span>
          <span className="truncate font-display text-lg font-semibold text-trail">
            {vehicle?.name || t('profil.no_vehicle')}
          </span>
        </span>
      </Link>

      {/* Région couverte */}
      <section className="flex flex-col gap-1.5">
        <p className="label-mono text-fog">{t('profil.region')}</p>
        <div className="border border-mist bg-cloud p-3">
          <p className="font-display text-xl font-semibold text-trail">
            {t('profil.region_pilot')}
          </p>
          <p className="label-mono mt-1 text-fog">{t('profil.region_next')}</p>
        </div>
      </section>

      <div className="flex items-center justify-between border-t border-mist pt-3">
        <p className="label-mono text-fog">{t('profil.build')}</p>
        {client && email && (
          <button
            type="button"
            onClick={() => void client.auth.signOut()}
            className="min-h-11 font-semibold text-copper-deep underline underline-offset-2"
          >
            {t('auth.logout')}
          </button>
        )}
      </div>
    </main>
  );
}
