# TRIPTIC — Passation de session (2026-07-17, mise à jour session 2)

> À lire en début de session avec le CLAUDE.md. Résume ce qui est FAIT, où tout se trouve, et ce qui reste.

## État : MVP fonctionnel, déployé en production

- **App en ligne : http://82.25.118.185:3001** (VPS Hostinger srv1731348, PM2 `triptic-api` sert l'API + la PWA buildée, démarrage auto au boot)
- **PR #1, #2, #3 mergées dans `main`** le 2026-07-17. Session 2 : PgTripRepo (Drizzle + PostGIS), agent correcteur recalibré, `vps-setup.sh` installe PostgreSQL+PostGIS
- **VPS À JOUR : PostgreSQL 16 + PostGIS actifs** (store `postgres`, vérifié : trip API → ligne en base avec longueur PostGIS), **Deepseek actif** (clé posée le 17/07, `provider: deepseek` au /health)
- Tests : 35 Vitest verts (`pnpm test`), build strict vert (`pnpm build`)
- Validé en réel : génération 3 trips (trek 2-3 j, road trips 12 et 14 j avec logement/food/randos), paywall→déblocage→régénération auto, sauvegarde, lien public, export GPX

## Ce qui existe (monorepo pnpm)

| Où | Quoi |
|---|---|
| `packages/ai-engine` | Moteur IA : Deepseek V3 principal + fallback Anthropic (streaming, retry réseau, maxTokens 32k), prompt 3-trips + règles road trip (nuit kind`camp` avec logement nommé, POI randos avec D+/durée, food locale, notes télégraphiques), agent correcteur R1 (1 retry), sanitization anti-injection, schémas Zod |
| `packages/map-utils` | Export GPX 1.1 |
| `server/` | Express 5 : SSE `/api/ai/generate-trips`, CRUD trips, lien public par slug, GPX gated par plan (402), quota free 3/mois (in-memory), rate limiting, Pino, schéma Drizzle PostGIS + migration `server/src/db/migrations/0000_init.sql`, PgTripRepo (Drizzle + PostGIS, actif si `DATABASE_URL` défini, sinon MemoryTripRepo) |
| `apps/web/` | PWA React 19 + Vite 6 + Tailwind v4 : chat SSE, TripCompare (cartes verrouillées → PaywallModal), régénération auto après upgrade de plan, MapView (Mapbox si `VITE_MAPBOX_PUBLIC_TOKEN`, sinon aperçu SVG), i18n fr/en/de complet, service worker Workbox |
| `deploy/` | `vps-setup.sh` (idempotent), `nginx-triptic.conf` (pas utilisé pour l'instant) |
| `.claude/skills/` | 19 skills installés + 4 créés (guide : `.claude/SKILLS_GUIDE.md`) |

## Particularités du VPS (importantes, découvertes à la main)

- **Pas de Nginx** ; Traefik (Docker) tient 80/443 pour n8n (:5678), Hermes, Gotenberg → TRIPTIC vit sur le **port 3001** servi par Express directement
- **PostgreSQL 16 + PostGIS installés le 2026-07-17** (base `triptic_db`, rôle `triptic_user`, DATABASE_URL dans le .env) → trips persistants ; les **quotas free restent in-memory** (`server/src/services/quota.ts`)
- ⚠️ Reboot du VPS recommandé à l'occasion (kernel 6.8.0-134 en attente) — PM2 `pm2 save` fait, redémarrage auto OK
- npm global prefix = `/root/.hermes/node` (hors PATH) → symlinks pnpm/pm2 créés dans `/usr/local/bin`
- PM2 lance `node --import tsx` (voir `ecosystem.config.cjs`), 1 seule instance fork (store in-memory non partageable)
- `.env` du VPS : `/opt/triptic/.env` — contient la clé Anthropic de Jules + **`ALLOW_PLAN_OVERRIDE=true` (MODE DÉMO : le paywall débloque les plans sans paiement — À RETIRER quand Stripe/Supabase seront branchés)**
- Mise à jour : `cd /opt/triptic && git pull && pnpm install --frozen-lockfile && pnpm build && pm2 restart triptic-api --update-env`
- Terminal navigateur Hostinger : la **première frappe après chargement est toujours perdue** (taper un `echo test` sacrificiel d'abord) ; les builds longs figent l'onglet → toujours lancer en `nohup ... > /var/log/xxx.log`

## Prochaines étapes (par priorité)

1. **Features / design / UI-UX** de la PWA (Phase 2 du CLAUDE.md) — polish TripCompare/chat, carte, i18n ; la skill `frontend-design` porte le design system
2. Token **Mapbox** (`VITE_MAPBOX_PUBLIC_TOKEN` au build web) pour la carte interactive + clés photos `UNSPLASH_ACCESS_KEY`/`PEXELS_API_KEY` (le code est prêt, `server/src/services/photos.ts`)
3. **Auth Supabase** (Phase 1.3 du CLAUDE.md) puis **Stripe Checkout** (Phase 3.12) → retirer `ALLOW_PLAN_OVERRIDE` du .env. ⚠️ Au premier login Supabase, provisionner la ligne `users` (FK `trips.user_id`) — voir commentaire dans `server/src/repo/pgTrips.ts`
4. Quotas free en PostgreSQL (encore in-memory), météo Open-Meteo, spots iOverlander/Park4Night, app React Native, agents n8n (Phases 3-4 du CLAUDE.md)

## Sécurité — rappels

- La toute première clé API Anthropic (collée dans le chat du 2026-07-16) doit être **révoquée** si ce n'est pas fait
- Ne jamais commiter `.env` ; `.env.example` fait foi
- Le header `x-plan` n'est accepté qu'en dev ou si `ALLOW_PLAN_OVERRIDE=true` (validé contre les plans connus)
