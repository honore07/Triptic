import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';

/**
 * Étapes réelles du pipeline de génération, dans l'ordre où le serveur les
 * annonce (SSE). « retrying » n'est pas une étape de plus : c'est la
 * validation qui reprend la main.
 */
const STEPS = ['generating', 'grounding', 'validating', 'routing', 'photos'] as const;

export type ReleveStep = (typeof STEPS)[number] | 'retrying';

/** I, II, III… — la numérotation des planches, jamais des chiffres arabes. */
const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

interface ReleveProps {
  /** Étape en cours, telle que le serveur l'a annoncée. */
  status: ReleveStep;
}

/** mm:ss — le chronomètre de la planche, en mono. */
function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Ligne de crête tracée à la plume — décor de la planche pendant l'attente.
 * Le trait se dessine en boucle (stroke-dashoffset), le point rouille marque
 * la tête du tracé. Purement décoratif : la progression réelle est portée
 * par la barre et la check-list en dessous.
 */
function Trace() {
  const ridge =
    'M0 64 C 40 60, 60 40, 90 36 S 140 52, 170 30 S 220 8, 250 22 S 300 56, 330 44 S 380 14, 410 26 S 460 60, 500 48';
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 500 80"
      className="h-20 w-full"
      preserveAspectRatio="none"
    >
      {/* Trame de la planche : lignes de niveau très légères */}
      {[20, 40, 60].map((y) => (
        <line
          key={y}
          x1="0"
          y1={y}
          x2="500"
          y2={y}
          stroke="currentColor"
          strokeWidth="0.5"
          className="text-mist/25"
        />
      ))}
      <path
        d={ridge}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        className="trace-draw text-trail"
        pathLength={1}
      />
      <circle r="3.5" className="fill-summit">
        <animateMotion dur="6s" repeatCount="indefinite" path={ridge} />
      </circle>
    </svg>
  );
}

/**
 * Relevé — planche PL.06 « GÉNÉRATION ».
 * Ce que VIRE est en train de faire, étape par étape. La barre et la
 * check-list suivent le vrai pipeline ; le chronomètre et la fourchette de
 * temps annoncée disent honnêtement que le moteur raisonne avant de tracer.
 * Aucun pourcentage inventé : la première étape est la plus longue, et la
 * planche le dit au lieu de rester figée à zéro.
 */
export function Releve({ status }: ReleveProps) {
  const { t } = useTranslation();
  const current = status === 'retrying' ? 'validating' : status;
  const index = STEPS.indexOf(current as (typeof STEPS)[number]);
  const done = index < 0 ? 0 : index;
  const percent = Math.round((done / STEPS.length) * 100);

  // Chronomètre depuis l'ouverture de la planche — le seul chiffre qui bouge
  // pendant la première étape, et il est vrai.
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <section
      aria-labelledby="releve-title"
      className="fade-up flex flex-col gap-5 border border-mist bg-snow p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <p className="label-mono text-fog">{t('releve.plate')}</p>
          <h2
            id="releve-title"
            className="font-display text-3xl font-semibold leading-tight text-trail"
          >
            {t('releve.title')}
          </h2>
        </div>
        {/* Le marcheur — gravure fixe, c'est le tracé qui bouge */}
        <img
          src="/vire/vire_char-marche.jpg"
          alt=""
          aria-hidden="true"
          className="h-20 w-20 shrink-0 border border-mist object-cover"
        />
      </div>

      <Trace />

      {/* Relevé de tête : étape courante, chronomètre, fourchette annoncée */}
      <dl className="grid grid-cols-2 border border-mist">
        <div className="flex flex-col gap-0.5 border-r border-mist p-2.5">
          <dt className="label-mono text-fog">{t('releve.step_label')}</dt>
          <dd className="font-display text-3xl font-semibold leading-none text-summit">
            {ROMAN[done]}
            <span className="text-lg text-fog"> / {ROMAN[STEPS.length - 1]}</span>
          </dd>
        </div>
        <div className="flex flex-col gap-0.5 p-2.5">
          <dt className="label-mono text-fog">{t('releve.elapsed')}</dt>
          <dd className="font-mono text-2xl leading-none text-trail" aria-live="off">
            {clock(elapsed)}
          </dd>
        </div>
      </dl>

      <div className="flex flex-col gap-1.5">
        <div
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t('releve.axis')}
          className="relative flex h-2.5 w-full gap-px border border-mist bg-cloud"
        >
          {/* Un segment par étape : pleins pour les étapes franchies, animé
           * pour l'étape en cours — la barre vit sans mentir. */}
          {STEPS.map((step, i) => (
            <span
              key={step}
              className={`relative h-full flex-1 overflow-hidden ${
                i < done ? 'bg-summit' : 'bg-transparent'
              }`}
            >
              {i === done && <span className="releve-sweep absolute inset-y-0 w-1/2 bg-summit" />}
            </span>
          ))}
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
                      ? 'releve-pulse border-summit bg-snow'
                      : 'border-mist bg-snow'
                }`}
              >
                {passed && <Check size={10} strokeWidth={3} aria-hidden="true" />}
              </span>
              <span className={`flex-1 text-sm ${running ? 'font-semibold' : ''}`}>
                {t(`chat.status_${step}`)}
              </span>
              {running && (
                <span className="label-mono text-copper-deep" aria-live="polite">
                  {t('releve.running')}
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {/* Ce que ça prend, dit franchement — et la promesse pendant l'attente */}
      <div className="flex flex-col gap-3 border border-mist bg-cloud p-3">
        <p className="text-xs leading-relaxed text-ridge">{t('releve.typical')}</p>
        <div className="flex items-center gap-3">
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
      </div>
    </section>
  );
}
