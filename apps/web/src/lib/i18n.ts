import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import fr from '../locales/fr.json';
import en from '../locales/en.json';
import de from '../locales/de.json';

const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('triptic-lang') : null;
const browser = typeof navigator !== 'undefined' ? navigator.language.slice(0, 2) : 'fr';
const initial = stored ?? (['fr', 'en', 'de'].includes(browser) ? browser : 'fr');

void i18n.use(initReactI18next).init({
  resources: {
    fr: { translation: fr },
    en: { translation: en },
    de: { translation: de },
  },
  lng: initial,
  fallbackLng: 'fr',
  interpolation: { escapeValue: false },
});

export function setLang(lang: 'fr' | 'en' | 'de'): void {
  void i18n.changeLanguage(lang);
  localStorage.setItem('triptic-lang', lang);
}

export default i18n;
