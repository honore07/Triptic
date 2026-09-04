import '@testing-library/jest-dom/vitest';
import { loadLang } from '../lib/i18n';

// Les trois dictionnaires sont chargés d'avance : les tests changent de langue
// de façon synchrone (setLang) et attendent le rendu immédiat.
await Promise.all([loadLang('en'), loadLang('de')]);
