import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';

/**
 * Étapes réelles du pipeline de génération, dans l'ordre où le serveur les
 * annonce (SSE). « retrying » n'est pas une étape de plus : c'est la
 * validation qui reprend la main.
 */
const STEPS = ['generating', 'grounding', 'validating', 'routing', 'photos'] as const;

export type ReleveStep = (typeof STEPS)[number] | 'retrying';

interface ReleveProps {
  /** Étape en cours, telle que le serveur l'a annoncée. */
  status: ReleveStep;
}

/**
 * Relevé — planche PL.06 « GÉNÉRATION ».
 * Ce que VIRE est en train de faire, étape par étape : la barre et la
 * check-list suivent le vrai pipeline, jamais une animation décorative.
 */
export function Releve({ status }: ReleveProps) {
  const { t } = useTranslation();
  const current = status === 'retrying' ? 'validating' : status;
  const index = STEPS.indexOf(current as (typeof STEPS)[number]);
  const done = index < 0 ? 0 : index;
  const percent = Math.round((done / STEPS.length) * 100);

  return (
    <section
      aria-labelledby="releve-title"
      className="fade-up flex flex-col gap-5 border border-mist bg-snow p-5"
    >
      <div className="flex flex-col gap-2">
        <p className="label-mono text-fog">{t('releve.plate')}</p>
        <h2
          id="releve-title"
          className="font-display text-3xl font-semibold leading-tight text-trail"
        >
          {t('releve.title')}
        </h2>
      </div>

      {/* Gravure du marcheur — le seul élément animé de la planche */}
      <img
        src="/vire/vire_char-marche.jpg"
        alt=""
        aria-hidden="true"
        className="mx-auto h-32 w-32 animate-pulse border border-mist object-cover"
      />

      <div className="flex flex-col items-center gap-1">
        <p className="font-display text-5xl font-bold leading-none text-summit">{percent} %</p>
        <p className="label-mono text-fog">{t('releve.progress_label')}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <div
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t('releve.axis')}
          className="h-2.5 w-full border border-mist bg-cloud"
        >
          <div className="h-full bg-summit transition-all duration-500" style={{ width: `${percent}%` }} />
        </div>
        <div className="flex justify-between">
          <span className="label-mono text-fog">0</span>
          <span className="label-mono text-fog">{t('releve.axis')}</span>
          <span className="label-mono text-fog">100</span>
        </div>
      </div>

      {/* Check-list du pipeline — l'étape courante est annoncée aux lecteurs
       * d'écran, les suivantes restent en attente. */}
      <ol className="flex flex-col">
        {STEPS.map((step, i) => {
          const passed = i < done;
          const running = i === done;
          return (
            <li
              key={step}
              className={`flex items-center gap-2.5 border-b border-mist py-2.5 last:border-b-0 ${
                passed || running ? 'text-trail' : 'text-fog'
              }`}
            >
              <span
                aria-hidden="true"
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                  passed
                    ? 'border-mist bg-summit text-snow'
                    : running
                      ? 'border-summit bg-snow'
                      : 'border-mist bg-snow'
                }`}
              >
                {passed && <Check size={10} strokeWidth={3} aria-hidden="true" />}
              </span>
              <span className="flex-1 text-sm">{t(`chat.status_${step}`)}</span>
              {running && (
                <span className="label-mono text-copper-deep" aria-live="polite">
                  {t('releve.running')}
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {/* Rappel de la promesse pendant l'attente */}
      <div className="flex items-center gap-3 border border-mist bg-cloud p-3">
        <img
          src="/vire/vire_nav-sextant.webp"
          alt=""
          aria-hidden="true"
          loading="lazy"
          className="h-12 w-12 shrink-0 rounded-full border border-mist object-cover"
        />
        <p className="font-display text-base italic leading-snug text-ridge">
          {t('releve.note')}
        </p>
      </div>
    </section>
  );
}
