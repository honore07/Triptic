interface LogoVireProps {
  /** Côté du carré, en pixels. */
  size?: number;
  className?: string;
}

/**
 * LogoVire — la marque : le compas à pointes sèches retourné, dont les
 * branches dessinent le V du sommet.
 *
 * C'est la gravure elle-même, avec tout son détail — hachures, reflets sur
 * l'acier, moletage de la vis. Le fond extérieur est détouré mais les blancs
 * intérieurs sont conservés : ce sont eux qui donnent le modelé du métal.
 *
 * Le tracé ne couvre que 3 % de l'image : c'est une gravure au trait fin, qui
 * demande de la place. En dessous de ~32 px elle vire au gris pâle — d'où les
 * tailles généreuses partout où elle apparaît.
 */
export function LogoVire({ size = 40, className = '' }: LogoVireProps) {
  return (
    <img
      src="/vire/vire_logo-compas.webp"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className={`shrink-0 object-contain ${className}`}
    />
  );
}
