# QA.md — Audit TRIPTIC (mode AUDIT SEULEMENT, aucun fix appliqué)

> Audit du 2026-07-29 sur la prod `http://82.25.118.185:3001` (UI servie par l'API Express)
> + revue statique de `apps/web/src/`. Méthodo : skill `qa-loop` (phase 1 uniquement).
> Tout finding listé ici a été **vérifié** (runtime ou code), pas de spéculation.
>
> **✅ Fixes appliqués le 29/07 (même PR)** : tous les findings code sont corrigés —
> 1.1 (mitigations front : clipboard fallback, callbacks géoloc), 1.3, 1.4 (libellé),
> 1.5, 1.6, 1.7, 1.8 (page enrichie + OG serveur), 2.1, 2.2, 3.1-3.5, 4.1-4.3, 6.1-6.5.
> Restent 2 actions VPS : **1.1 TLS** → `deploy/RUNBOOK-https.md` (triptic.hakoe-alsace.com)
> et **1.2 paywall** → mode démo conservé volontairement (décision Jules 29/07) ;
> fermeture au lancement payant via `deploy/NOTE-paywall-prod.md`.

---

## TOP 10 — à fixer d'abord

| # | Sévérité | Finding | Axe |
|---|----------|---------|-----|
| 1 | **P1 critique** | Prod servie en HTTP nu → clipboard, service worker (PWA/offline) et géolocalisation **tous inopérants** (APIs à contexte sécurisé) | Bugs |
| 2 | **P1 critique** | Paywall bypassable : l'API prod honore le header client `x-plan` (vérifié au curl : 402 sans header → 200 avec) | Bugs |
| 3 | **P1 majeur** | « Lien public » re-POST `/api/trips` au lieu de PATCH → trip dupliqué en BDD à chaque partage après sauvegarde | Bugs |
| 4 | **P2 mineur** | Segments `"routed": false` hors zone Alsace (fallback attendu — GraphHopper vérifié ACTIF sur Colmar→Munster : `routed: true`) ; l'incohérence distance affichée vs activité (J5 : 63 km vs « 80 km ») reste à corriger côté fallback | Bugs |
| 5 | **P2 majeur** | Assets servis sans gzip/brotli : mapbox-gl **1,86 Mo** + index **404 Ko** non compressés | Perf |
| 6 | **P2 majeur** | `Cache-Control: max-age=0` sur les assets hashés `/assets/*` → revalidation 304 à chaque navigation | Perf |
| 7 | **P2 majeur** | Contraste KO : DifficultyBadge `medium` ≈ 3,2:1 et `easy` ≈ 3,7:1 (besoin 4,5:1), alertes météo warning ≈ 3,3:1 | A11y |
| 8 | **P2 majeur** | Bouton « Find » d'Explore sans nom accessible sur mobile (<640px : texte `hidden`, icône `aria-hidden`, pas d'aria-label) | A11y |
| 9 | **P2 majeur** | Palette v1 résiduelle : bleu `#1A6BDB` dans theme-color, manifest PWA et tracés carte fallback | Drift |
| 10 | **P2 majeur** | `onSave`/`onShare` (Trip.tsx) sans try/catch — échec réseau = rejet non géré, zéro feedback utilisateur (règle #2 CLAUDE.md) | Bugs |

---

## AXE 1 — Bugs fonctionnels

### 1.1 [CRITIQUE] HTTP sans TLS casse 3 features en prod
- **Repro** : ouvrir `http://82.25.118.185:3001` → `window.isSecureContext === false`, `navigator.clipboard === undefined`, `navigator.serviceWorker === undefined` (vérifié dans la console de la prod).
- Conséquences vérifiées :
  - **Partage** : `apps/web/src/pages/Trip.tsx:67` — `navigator.clipboard.writeText(...)` lève une TypeError silencieuse. Cliquer « Lien public » crée le trip public (201) mais **ne copie rien et n'affiche jamais « Lien copié »**. L'utilisateur n'a aucun moyen de récupérer l'URL.
  - **PWA/offline** : service worker jamais enregistré → critère MVP « l'app fonctionne offline » inopérant en prod (registerSW.js chargé mais registration impossible en contexte non sécurisé).
  - **Géolocalisation** : `apps/web/src/pages/Explore.tsx:106` (« Autour de moi ») et `apps/web/src/components/AddPlaceForm.tsx:36` (« Ma position ») — bloquée par le navigateur sur origine HTTP ; en plus **aucun callback d'erreur** → le clic ne fait rien, silencieusement.
- **Fix (1 ligne)** : servir derrière Nginx + TLS (triptic.app) ; en attendant, fallback clipboard (afficher l'URL sélectionnable) et callback d'erreur sur geolocation.

### 1.2 [CRITIQUE] Le plan payant est spoofable par header client
- **Repro** : `curl http://82.25.118.185:3001/api/trips/<id>/gpx` → **402** ; même requête avec `-H "x-plan: aventurier"` → **200** (vérifié sur la prod). Le PaywallModal « upgrade » ne fait qu'un `localStorage.setItem` (`apps/web/src/store/userStore.ts:19`) et toutes les features payantes (3 trips, GPX, météo) s'ouvrent sans paiement.
- Le commentaire `apps/web/src/lib/api.ts:33` (« ignoré en production ») est **faux** : la prod honore le header.
- **Fix (1 ligne)** : côté serveur, dériver le plan du JWT Supabase et ignorer `x-plan` quand `NODE_ENV=production`.

### 1.3 [MAJEUR] Partage → trip dupliqué en BDD
- **Repro** : /trip → « Sauvegarder » (POST 201) → « Lien public » → **2e POST `/api/trips` 201** observé (deux lignes en BDD pour le même trip).
- **Cause** : `apps/web/src/pages/Trip.tsx:62-65` — `if (!trip || !trip.is_public) { trip = await saveTrip(...) }` recrée au lieu de passer le trip existant en public.
- **Fix (1 ligne)** : si `saved` existe, `updateTrip(saved.id, ..., is_public: true)` (PATCH) au lieu de `saveTrip`.

### 1.4 [MINEUR — requalifié] Segments non routés hors zone de couverture (fallback attendu)
- **Contre-vérifié le 29/07** : GraphHopper est ACTIF en prod — `POST /api/trips/recompute` Colmar→Munster renvoie `routed: true` avec géométrie réelle (20,1 km, 392 m D+). Le trip de repro (Jura, 5 j) était **hors zone Alsace** → fallback estimations, comportement attendu jusqu'à l'extension de couverture (cf. `deploy/RUNBOOK-routing-extension.md`).
- **Reste valable** : en fallback, la distance jour affichée peut contredire le texte des activités (J5 : « 63 km » affiché vs « 80 km final drive ») — l'estimation vol d'oiseau mériterait un libellé plus explicite ou un coefficient route.
- **Fix (1 ligne)** : traité par l'extension de couverture routing (étapes A/B du runbook) ; en attendant, clarifier le libellé « (estimation) » sur les zones non couvertes.

### 1.5 [MAJEUR] Appels API sans try/catch dans Trip.tsx
- `apps/web/src/pages/Trip.tsx:55-71` (`onSave`, `onShare`) : aucun try/catch — un échec de `saveTrip` = promesse rejetée non gérée, aucun message d'erreur i18n (violation règle qualité #2).
- Idem `apps/web/src/store/tripStore.ts:48-53` : `applyDays` a un `try/finally` **sans catch** → un échec réseau de `recomputeTrip` remonte en rejet non géré.
- **Fix (1 ligne)** : try/catch + état d'erreur affiché (clé i18n existante `chat.error_generation` ou nouvelle clé).

### 1.6 [MINEUR] Pas de route 404
- **Repro** : `http://82.25.118.185:3001/nonexistent-route` → page blanche (header seul) + warning console « No routes matched location ».
- `apps/web/src/App.tsx:43-50` : pas de `<Route path="*">`.
- **Fix (1 ligne)** : route catch-all avec message + lien retour accueil (réutiliser `trips.not_found`).

### 1.7 [MINEUR] Budget « Nights 35–35 € »
- **Repro** : trip généré → carte budget affiche `35–35 €` quand min = max (`apps/web/src/pages/Trip.tsx:149-151`, idem tolls/meals/total).
- **Fix (1 ligne)** : afficher la valeur seule quand `min === max`.

### 1.8 [MINEUR] Page publique très pauvre + pas d'OG tags
- `apps/web/src/pages/PublicTrip.tsx` : n'affiche que titre + carte, alors que le trip a résumé, photo, jours, budget (vérifié sur `/trip/classic-wild-jura-5fa9c8`). La carte tombe sur le fallback « trait droit pointillé » bleu hors palette.
- Le HTML servi pour `/trip/:slug` est l'index statique : **aucune balise OG par trip** (aperçu réseaux sociaux générique) — item 19 de la Phase 4.
- **Fix (1 ligne)** : enrichir la page (photo + résumé + jours) et injecter les OG tags côté serveur pour `/trip/:slug`.

### Vérifié OK (axe 1)
- `/health` → `{"status":"ok","provider":"deepseek"}` ; 404 API propre sur `/api/nope`.
- Flow complet : génération SSE (statuts progressifs affichés) → 1 trip + 2 cartes verrouillées (free) → choix → sauvegarde → GPX (plan payant) → 200. Zéro erreur console sur tout le parcours.
- Explore : « Chercher dans cette zone » → 50 résultats Vosges ; gating GPX free → paywall s'ouvre au bon moment.

---

## AXE 2 — i18n

### Vérifié OK
- **Parité des clés** : fr/en/de = 222 clés chacun, aucune clé manquante (script de comparaison récursif).
- **Aucune string UI hardcodée** trouvée dans les 22 composants/pages audités — tout passe par `t()`.
- Switch FR/EN/DE vérifié au runtime sur Home : tous les textes basculent.

### 2.1 [MINEUR] `<html lang>` jamais mis à jour
- **Repro** : passer en EN ou DE → `document.documentElement.lang` reste `"fr"` (vérifié). Impact lecteurs d'écran (prononciation) + SEO.
- `apps/web/src/lib/i18n.ts:22-25` (`setLang`).
- **Fix (1 ligne)** : `document.documentElement.lang = lang;` dans `setLang` (+ à l'init).

### 2.2 [MINEUR] Ponctuation française hardcodée hors locale
- `apps/web/src/pages/Trip.tsx:177` : `{t('budget.co2')} : ` — l'espace insécable + deux-points à la française apparaît aussi en EN/DE (« Carbon footprint : »).
- **Fix (1 ligne)** : mettre le deux-points dans les fichiers de locale.

---

## AXE 3 — Accessibilité

### 3.1 [MAJEUR] Bouton « Find » d'Explore sans nom accessible sur mobile
- `apps/web/src/pages/Explore.tsx:144-151` : le libellé est `<span className="hidden sm:inline">` et l'icône Sparkles est `aria-hidden` → sous 640px le bouton submit n'a **aucun nom accessible** (vérifié dans l'arbre a11y).
- **Fix (1 ligne)** : ajouter `aria-label={t('explore.parse')}` sur le bouton.

### 3.2 [MAJEUR] Contrastes sous 4,5:1 sur composants récurrents (ratios calculés)
| Emplacement | Paire | Ratio | Requis |
|---|---|---|---|
| `components/DifficultyBadge.tsx:6` (medium — sur TOUTES les TripCards) | `text-amber` sur `bg-amber/15` | **≈ 3,2:1** | 4,5:1 (12px semibold) |
| `components/DifficultyBadge.tsx:5` (easy) | `text-pine` sur `bg-pine/15` | **≈ 3,7:1** | 4,5:1 |
| `components/WeatherStrip.tsx:99` (alerte warning) | `text-amber` sur `bg-amber/10` | **≈ 3,3:1** | 4,5:1 |
| `components/OnlineIndicator.tsx:25` (bandeau offline) | `text-snow` sur `bg-amber` | **3,35:1** | 4,5:1 |
| `pages/Explore.tsx:184` (chip boucles actif) + `AddPlaceForm.tsx:188` (succès) | `text-pine` sur pine/10 ou snow | **3,7–4,4:1** | 4,5:1 |
- Sur TripCard, le fond du badge est semi-transparent **sur photo** → ratio réel imprévisible, souvent pire.
- **Fix (1 ligne)** : créer `--color-amber-deep`/`--color-pine-deep` pour le texte (comme `copper-deep` déjà fait pour copper), et `text-trail` sur le bandeau amber.

### 3.3 [MINEUR] `text-fog` sur fond `cloud` = 4,47:1 (limite, sous le seuil)
- fog est calibré pour snow (4,69:1) mais utilisé sur le fond de page cloud : `pages/Explore.tsx:235` (note de couverture), `components/TripTuner.tsx:99`, `pages/Plan.tsx` (statut). Écart faible mais mesurable.
- **Fix (1 ligne)** : assombrir `--color-fog` d'un cran (ex. #676D79 ≥ 4,5:1 sur cloud).

### 3.4 [MINEUR] PaywallModal sans focus trap
- `components/PaywallModal.tsx` : Escape ✓, focus initial ✓, mais Tab sort du dialog vers la page derrière (aria-modal="true" sans trap réel).
- **Fix (1 ligne)** : boucler le focus sur les éléments focusables du dialog (ou `inert` sur le fond).

### 3.5 [MINEUR] Cibles tactiles < 44px (skill : ≥ 44×44)
- `components/DayEditor.tsx:107,116,125` : boutons ↑/↓/supprimer 36×36 (`h-9 w-9`).
- `components/RequestChips.tsx:72,84` : steppers ± 32×32 (`h-8 w-8`).
- `components/PaywallModal.tsx:52-59` : bouton X ≈ 28px.
- **Fix (1 ligne)** : `min-h-11 min-w-11` sur ces boutons.

### Vérifié OK (axe 3)
- aria-labels présents sur tous les autres boutons icône (audit exhaustif), `alt` sur toutes les images, labels de formulaires associés, `role="alert"`/`aria-live` sur les erreurs et statuts, `prefers-reduced-motion` global (styles.css:46), focus visible global 2px summit (styles.css:41), `aria-pressed`/`role="switch"`/`aria-valuetext` corrects sur chips et sliders.

---

## AXE 4 — Design drift

### 4.1 [MAJEUR] Palette v1 (bleu #1A6BDB / #0D1B2A) encore présente
- `apps/web/index.html:6` : `<meta name="theme-color" content="#1A6BDB">` — barre navigateur bleue hors charte v2.
- `apps/web/vite.config.ts:44-45` : manifest PWA `theme_color: '#1A6BDB'`, `background_color: '#0D1B2A'` — splash d'installation hors charte.
- `apps/web/src/components/MapView.tsx:117` : fallback route non routée en `#1A6BDB`.
- `apps/web/src/components/RoutePreview.tsx:13` : stroke par défaut `#1A6BDB` (visible sur PublicTrip et MapView sans token).
- **Fix (1 ligne)** : remplacer par trail `#1E1E24` (theme-color) / summit `#C86341` (tracés).

### 4.2 [MINEUR] Hex en dur dans les composants carte
- `MapView.tsx:87,95,117,124-131`, `ExploreMap.tsx:75,107`, `TripCard.tsx:34`, `RoutePreview.tsx:44-45` — nécessaire pour l'API Mapbox (pas de CSS vars dans `paint`), mais dupliqué en 4 fichiers.
- **Fix (1 ligne)** : centraliser dans une constante `MAP_COLORS` partagée (packages/map-utils ou lib/).

### 4.3 [MINEUR] ChatBubble user : `bg-trail` au lieu du « fond summit » du skill frontend-design
- `components/ChatBubble.tsx:10` — probablement un choix a11y délibéré (summit/snow ≈ 3,4:1 serait non conforme). À documenter dans le skill pour arrêter le drift doc/code.

### Vérifié OK (axe 4)
- Typo conforme (DM Sans/Inter/JetBrains Mono via @theme + Google Fonts), radius trip 16px / badge 6px, CTA gold + texte trail (10:1), hero trail + halos copper/gold, animations 150-360ms ease-out — conforme à la charte v2.

---

## AXE 5 — Mobile-first (375px)

### Vérifié OK
- Aucun débordement horizontal à 375×812 sur Home, Explore, Trip, Plan (`scrollWidth === 375` vérifié partout ; les hero-blobs débordants sont bien clippés par `overflow-hidden`).
- Grille TripCompare passe en colonne, météo en scroll horizontal contenu (`overflow-x-auto`), nav compacte avec icônes + `sr-only`.
- *(Rien à signaler — aucun finding.)*

---

## AXE 6 — Performance

### 6.1 [MAJEUR] Aucune compression des assets statiques
- **Vérifié** : `curl -H "Accept-Encoding: gzip, br"` → pas de `Content-Encoding`. `index-*.js` = **404 050 octets**, `mapbox-gl-*.js` = **1 859 162 octets**, CSS = 76 Ko, servis bruts par Express (`X-Powered-By: Express`).
- ≈ 2,3 Mo transférés pour une page avec carte sur mobile ; gzip ≈ −70 %.
- **Fix (1 ligne)** : middleware `compression` (ou mieux : Nginx devant avec gzip/brotli + TLS, cf. finding 1.1).

### 6.2 [MAJEUR] `Cache-Control: public, max-age=0` sur les assets hashés
- **Vérifié** : chaque navigation re-valide `/assets/*.js` (304 observés à répétition dans le network log) alors que les noms sont contentés-hashés.
- **Fix (1 ligne)** : `express.static` avec `maxAge: '1y', immutable: true` pour `/assets`.

### 6.3 [MINEUR] Google Fonts tiers (perf + RGPD)
- `apps/web/index.html:12-17` : fonts chargées depuis fonts.googleapis.com/gstatic → requête bloquante tierce + transmission IP à Google sans consentement (règle #9 CLAUDE.md, jurisprudence UE).
- **Fix (1 ligne)** : self-héberger les woff2 (fontsource) dans le bundle.

### 6.4 [MINEUR] Images de jour surdimensionnées
- `components/DayCards.tsx:78-84` : vignettes affichées 112px de haut (`h-28`) mais URLs Unsplash `w=1080` (vérifié dans les données du trip généré).
- **Fix (1 ligne)** : demander `w=400` (paramètre d'URL Unsplash/Pexels) ou `srcset`.

### 6.5 [MINEUR] `X-Powered-By: Express` exposé
- **Fix (1 ligne)** : `app.disable('x-powered-by')` (ou helmet).

### Vérifié OK (axe 6)
- mapbox-gl **bien lazy-loadé** (chunk séparé, chargé uniquement sur les pages carte — Home/Plan ne le chargent pas).
- Photos TripCard en `loading="lazy"` ; cache runtime Workbox configuré pour photos et trips (inopérant tant que le SW ne s'enregistre pas, cf. 1.1).

---

## Hors périmètre front (constaté en passant, non compté)
- Qualité data : le trip « Jura » place le Creux du Van (46.933, 6.733 — Neuchâtel) sur le J1 entre Genève et le lac de Joux : détour ~100 km non signalé. L'agent correcteur a validé. À surveiller côté prompts/grounding.
- Résultats Explore renvoyés en français uniquement (« Col à 1139 m ») même en UI EN/DE — données de la base places, pas un bug front.

## Décompte
| Axe | Critique | Majeur | Mineur | Total |
|---|---|---|---|---|
| 1. Bugs fonctionnels | 2 | 3 | 3 | 8 |
| 2. i18n | 0 | 0 | 2 | 2 |
| 3. Accessibilité | 0 | 2 | 3 | 5 |
| 4. Design drift | 0 | 1 | 2 | 3 |
| 5. Mobile-first | 0 | 0 | 0 | 0 |
| 6. Performance | 0 | 2 | 3 | 5 |
| **Total** | **2** | **8** | **13** | **23** |

*(3.2 regroupe 5 paires de contraste en 1 finding ; 4.1 regroupe 4 occurrences de la palette v1.)*
