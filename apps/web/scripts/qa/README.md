# Contrôles QA — VIRE web

Quatre scripts Node sans dépendance (Chrome headless piloté en CDP brut).
Ils demandent Chrome : `CHROME=/chemin/vers/chrome` si l'emplacement
Windows par défaut ne convient pas.

| Script | Ce qu'il fait | Cible |
|---|---|---|
| `live-check.mjs [url]` | Parcourt toutes les pages, collecte exceptions JS, erreurs console et requêtes en échec, capture les écrans clés | site en ligne (défaut) |
| `a11y-check.mjs [url]` | Audit axe-core WCAG 2.1 AA + bonnes pratiques, page par page | site en ligne (défaut) |
| `contrast-check.mjs` | Contraste **composé** des textes posés sur photo, mesuré sur les pixels de la capture (pire cas = décile le plus clair) | `pnpm dev` sur :5173 |
| `shots.mjs` | Captures desktop + mobile de tous les écrans avec un état d'exemple injecté (`localStorage triptic-chat`) | `pnpm dev` sur :5173 |

```bash
pnpm --filter @triptic/web qa:live
pnpm --filter @triptic/web qa:a11y
pnpm --filter @triptic/web qa:contrast   # serveur de dev lancé
pnpm --filter @triptic/web qa:shots      # serveur de dev lancé → shots-jpg/
```

Résultats attendus (04/09/2026) : `live` — un seul incident, le 404 volontaire
sur un lien public inexistant ; `a11y` — zéro défaut sur les dix pages.
