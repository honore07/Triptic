/** Largeurs servies par thumb.wikimedia.org : toute autre valeur répond 400. */
const WIKIMEDIA_WIDTHS = [330, 500, 960, 1280, 1920] as const;

/**
 * Vignette à la taille d'affichage. Unsplash et Pexels lisent le paramètre `w` ;
 * Wikimedia porte la largeur dans le nom du fichier (`960px-…`), arrondie à la
 * largeur standard supérieure. Toute autre URL reste intacte.
 */
export function thumbnailUrl(url: string, width = 400): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.endsWith('wikimedia.org') && /\/\d+px-[^/]+$/.test(parsed.pathname)) {
      const step = WIKIMEDIA_WIDTHS.find((w) => w >= width) ?? 1920;
      parsed.pathname = parsed.pathname.replace(/\/\d+px-([^/]+)$/, `/${step}px-$1`);
      return parsed.toString();
    }
    if (!parsed.searchParams.has('w')) return url;
    parsed.searchParams.set('w', String(width));
    return parsed.toString();
  } catch {
    return url;
  }
}
