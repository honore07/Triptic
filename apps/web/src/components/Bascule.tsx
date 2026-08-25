interface BasculeProps {
  label: string;
  /** Ligne d'explication sous le libellé — omise sur les listes compactes. */
  hint?: string | undefined;
  on: boolean;
  disabled?: boolean;
  onToggle: () => void;
}

/**
 * Bascule — interrupteur de la charte VIRE : plaque RECTANGULAIRE à filet
 * encre, pastille ronde qui glisse d'un bord à l'autre. Angles droits
 * stricts (DESIGN.md : « no soft rounded iOS-style cards ») — seule la
 * pastille reste ronde, c'est un cadran d'instrument.
 *
 * La plaque fait 32 px de haut mais la cible tactile en fait 44 : le bouton
 * porte la hauteur, la plaque ne porte que le dessin.
 */
export function Bascule({ label, hint, on, disabled = false, onToggle }: BasculeProps) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-mist py-3">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-display text-lg leading-tight text-trail">{label}</span>
        {hint && <span className="text-sm text-ridge">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={disabled}
        onClick={onToggle}
        className="flex min-h-11 shrink-0 items-center disabled:opacity-55"
      >
        <span
          aria-hidden="true"
          className={`flex h-8 w-14 items-center border-2 border-mist p-1 transition-colors ${
            on ? 'justify-end bg-summit' : 'justify-start bg-terrain'
          }`}
        >
          {/* 20 px = exactement la hauteur libre de la plaque (32 − filets − marge) */}
          <span className="h-5 w-5 rounded-full border-2 border-mist bg-snow" />
        </span>
      </button>
    </div>
  );
}
