import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Fonts self-hébergées (@fontsource) — RGPD : aucune requête vers Google Fonts.
// Subset latin (couvre fr/en/de : accents, ß, œ, €) ; poids réellement utilisés :
// DM Sans 600/700 (titres), Inter 400/500/600/700 (body), JetBrains Mono 400/600 (données).
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/dm-sans/latin-700.css';
import '@fontsource/cormorant-garamond/latin-600.css';
import '@fontsource/cormorant-garamond/latin-700.css';
import '@fontsource/cormorant-garamond/latin-700-italic.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-600.css';
import './lib/i18n';
import './styles.css';
import 'mapbox-gl/dist/mapbox-gl.css';
import { initAnalytics } from './lib/analytics';
import { App } from './App';

// Mesure d'audience anonyme sans cookie (PostHog UE) — no-op sans clé,
// respecte Do Not Track et l'opt-out localStorage (voir lib/analytics.ts).
initAnalytics();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
