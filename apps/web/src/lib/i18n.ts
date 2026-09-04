import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import fr from '../locales/fr.json';

export type Lang = 'fr' | 'en' | 'de';
const LANGS: Lang[] = ['fr', 'en', 'de'];

/**
 * Le français part dans le bundle initial (langue de repli et de la
 * majorité des visiteurs) ; l'anglais et l'allemand arrivent à la demande —
 * ~65 Ko minifiés de moins au premier chargement pour un visiteur
 * francophone. Les tests préchargent les trois (setup.ts).
 */
const loaders: Record<Exclude<Lang, 'fr'>, () => Promise<{ default: object }>> = {
  en: () => import('../locales/en.json'),
  de: () => import('../locales/de.json'),
};

const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('triptic-lang') : null;
const browser = typeof navigator !== 'undefined' ? navigator.language.slice(0, 2) : 'fr';
const initial: Lang = (
  stored && LANGS.includes(stored as Lang)
    ? stored
    : LANGS.includes(browser as Lang)
      ? browser
      : 'fr'
) as Lang;

void i18n.use(initReactI18next).init({
  resources: { fr: { translation: fr } },
  lng: initial,
  fallbackLng: 'fr',
  interpolation: { escapeValue: false },
});

/** Charge le dictionnaire d'une langue s'il n'est pas déjà là. */
export async function loadLang(lang: Lang): Promise<void> {
  if (lang === 'fr' || i18n.hasResourceBundle(lang, 'translation')) return;
  const bundle = await loaders[lang]();
  i18n.addResourceBundle(lang, 'translation', bundle.default, true, true);
}

/** Résout quand la langue de départ est prête — main.tsx attend avant de rendre. */
export const ready: Promise<void> = loadLang(initial).then(() => {
  if (i18n.language !== initial) return i18n.changeLanguage(initial).then(() => undefined);
  return undefined;
});

// Lecteurs d'écran (prononciation) + SEO : l'attribut lang suit la langue active
if (typeof document !== 'undefined') {
  document.documentElement.lang = initial;
}

/**
 * Change de langue. Synchrone quand le dictionnaire est déjà chargé (tests,
 * langue déjà visitée) ; sinon le temps de charger le fichier, le français
 * de repli couvre l'écran une fraction de seconde.
 */
export function setLang(lang: Lang): void {
  localStorage.setItem('triptic-lang', lang);
  document.documentElement.lang = lang;
  if (lang === 'fr' || i18n.hasResourceBundle(lang, 'translation')) {
    void i18n.changeLanguage(lang);
    return;
  }
  void loadLang(lang).then(() => i18n.changeLanguage(lang));
}

export default i18n;
