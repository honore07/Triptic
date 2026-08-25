import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Ouverture — planche PL.01 « OUVERTURE » des maquettes VIRE.
 * Gravure de sommet plein cadre, marque tracée au centre, plaque d'entrée en
 * bas. Ne s'affiche qu'à la PREMIÈRE visite : un habitué arrive directement
 * sur l'accueil (décision produit — le splash est une entrée en matière, pas
 * un péage).
 */

/** Clé de mémorisation de la première visite. */
export const OUVERTURE_SEEN_KEY = 'vire-ouverture-seen';

/**
 * Vrai tant que l'utilisateur n'a jamais franchi l'ouverture.
 * Stockage indisponible (navigation privée stricte) : on ne montre rien —
 * mieux vaut sauter l'intro que la réafficher à chaque page.
 */
export function shouldShowOuverture(): boolean {
  try {
    return localStorage.getItem(OUVERTURE_SEEN_KEY) === null;
  } catch {
    return false;
  }
}

/** Mémorise le passage — sans effet si le stockage est refusé. */
export function markOuvertureSeen(): void {
  try {
    localStorage.setItem(OUVERTURE_SEEN_KEY, '1');
  } catch {
    /* stockage indisponible : l'ouverture se rejouera, sans casse */
  }
}

interface OuvertureProps {
  /** Franchit l'ouverture — l'appelant mémorise et démonte le composant. */
  onStart: () => void;
}

export function Ouverture({ onStart }: OuvertureProps) {
  const { t } = useTranslation();
  const ctaRef = useRef<HTMLButtonElement>(null);

  // Le splash couvre l'app : on fige le défilement du fond et on pose le
  // focus sur la seule action disponible (clavier + lecteur d'écran).
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ctaRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby="ouverture-title"
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-trail"
    >
      {/* Gravure de sommet — décorative : la marque est du vrai texte en dessous.
       * L'asset est déjà monochrome ; grayscale reste par sécurité si la photo
       * est un jour remplacée par une couleur. */}
      <img
        src="/vire/vire_ouverture-cime.webp"
        alt=""
        aria-hidden="true"
        fetchPriority="high"
        className="absolute inset-0 h-full w-full object-cover grayscale contrast-110 brightness-[0.72]"
      />
      {/* Voile d'encre — dimensionné pour le PIRE cas (ciel clair derrière la
       * signature) : 50 % d'encre au centre plafonnent le fond sous #5F5F5F,
       * seuil au-delà duquel la signature mono (petit texte) passerait sous
       * 4.5:1. Signature ≈ 5:1, marque ≈ 6.3:1. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-b from-trail/55 via-trail/50 to-trail/90"
      />

      <div className="relative flex flex-1 flex-col items-center justify-center px-6 text-center">
        <h1
          id="ouverture-title"
          className="fade-up font-display text-6xl font-semibold leading-none text-cloud sm:text-7xl"
          // Le tracking pousse la marque vers la gauche : l'indentation
          // compense la chasse ajoutée après le E pour rester centré.
          style={{ letterSpacing: '0.3em', textIndent: '0.3em' }}
        >
          {t('app.name')}
        </h1>
        <p
          className="fade-up label-mono mt-5 text-sky"
          style={{ animationDelay: '140ms' }}
        >
          {t('ouverture.tagline')}
        </p>
      </div>

      {/* max-w-md : pleine largeur sur mobile (la planche d'origine), plaque
       * centrée de largeur raisonnable au-delà — un CTA de 1200 px s'étire. */}
      <div className="relative mx-auto w-full max-w-md px-5 pb-8 sm:pb-10">
        <button
          ref={ctaRef}
          type="button"
          onClick={onStart}
          className="cta-plate fade-up flex min-h-13 w-full items-center justify-center px-6 py-4"
          style={{ animationDelay: '220ms' }}
        >
          {t('ouverture.cta')}
        </button>
      </div>
    </section>
  );
}
