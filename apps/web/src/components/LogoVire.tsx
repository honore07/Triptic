interface LogoVireProps {
  /** Hauteur en pixels — la largeur suit le rapport de la marque. */
  size?: number;
  className?: string;
}

/**
 * LogoVire — la marque VIRE : un compas à pointes sèches retourné, dont les
 * branches dessinent le V du sommet.
 *
 * Ceci est la RÉDUCTION du logo, pour les petites tailles (en-tête, 26-32 px) :
 * branches pleines, plus de hachures. La gravure complète
 * (`/vire/vire_logo-compas.webp`) sert dès 48 px, en médaillon — ses hachures
 * fines ne survivraient pas sous cette taille, elles y feraient une tache
 * grise. Le tracé prend `currentColor` : la marque suit la couleur du texte.
 */
export function LogoVire({ size = 28, className = '' }: LogoVireProps) {
  return (
    <svg
      viewBox="0 0 96 132"
      height={size}
      width={(size * 96) / 132}
      fill="currentColor"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      {/* Branches droites, pointes sèches en haut. Un peu plus charnues que
       * la gravure : à 30 px, un trait plus fin s'effacerait à côté du mot. */}
      <path d="M28.64 6.33 L43.95 85.23 L54.05 82.77 L31.36 5.67 Z" />
      <path d="M75.36 6.33 L60.05 85.23 L49.95 82.77 L72.64 5.67 Z" />

      {/* Vis de réglage : barre, collet, écrou, bouton moleté à gauche */}
      <rect x="8" y="60.3" width="62" height="3.4" />
      <rect x="26" y="57" width="9" height="10" rx="1" />
      <rect x="36" y="58.8" width="3" height="6.4" rx="0.7" />
      <rect x="2" y="57.5" width="7" height="9" rx="3" />

      {/* Pivot, anneau, œillet */}
      <circle cx="52" cy="84.5" r="5" />
      <rect x="50.6" y="107" width="2.8" height="9" />
      <circle cx="52" cy="99.5" r="8.6" fill="none" stroke="currentColor" strokeWidth="4.2" />
      <circle cx="52" cy="121" r="3.4" fill="none" stroke="currentColor" strokeWidth="2.4" />
    </svg>
  );
}
