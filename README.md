# TRIPTIC — Plan, Explore, Repeat.

Application de planification d'aventures multi-modales (road trip → trek → bikepacking) propulsée par IA conversationnelle. Tu décris ton envie en langage naturel ; l'IA génère **3 itinéraires en compétition**, proches mais distincts sur 1-2 axes. Tu choisis, tu peaufines, tu pars.

> Brief complet du projet : [CLAUDE.md](CLAUDE.md) · Skills Claude Code : [.claude/SKILLS_GUIDE.md](.claude/SKILLS_GUIDE.md)

## Structure du monorepo (pnpm workspaces)

```
apps/web/            PWA React 19 + Vite 6 + Tailwind v4 (chat, TripCards, carte, paywall, i18n fr/en/de)
packages/shared/     Types & plans tarifaires partagés
packages/ai-engine/  Moteur IA : Deepseek V3 (principal) + fallback Anthropic, agent correcteur, sanitization
packages/map-utils/  Export GPX, helpers géo
server/              API Express 5 : SSE /api/ai/generate-trips, trips CRUD, GPX, quotas, Drizzle + PostGIS
deploy/              Config Nginx VPS
```

## Démarrage local

```bash
pnpm install
cp .env.example .env        # renseigner DEEPSEEK_API_KEY ou ANTHROPIC_API_KEY
pnpm dev                    # API :3001 + web :5173 (proxy /api)
```

Sans `DATABASE_URL`, l'API utilise un store in-memory (les trips ne survivent pas au restart). Sans token Mapbox, la carte affiche un aperçu SVG du tracé.

## Tests & build

```bash
pnpm test        # Vitest — moteur IA, GPX, API (supertest), composants React
pnpm build       # typecheck strict + build Vite + service worker PWA
```

## Déploiement VPS (Hostinger)

1. `psql -d triptic_db -f server/src/db/migrations/0000_init.sql` (PostGIS requis)
2. `pm2 start ecosystem.config.cjs --env production`
3. Nginx : `deploy/nginx-triptic.conf`
4. CI/CD : `.github/workflows/ci.yml` (déploiement SSH activable via `DEPLOY_ENABLED`)

## Plans

| | Explorer (free) | Aventurier 29 €/an | Explorateur 49 €/an |
|---|---|---|---|
| Générations IA | 3/mois | Illimitées | Illimitées |
| Trips proposés | 1 | 3 en compétition | 3 en compétition |
| Modes | Road trip | + trek, bikepacking | + trek, bikepacking |
| Export GPX | — | ✓ | ✓ |
| Offline | — | 5 régions | Monde entier + Garmin/Wahoo |
