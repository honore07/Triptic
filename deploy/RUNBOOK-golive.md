# RUNBOOK — Go-live web (23/08/2026)

> Lancement « offre de lancement » : comptes Supabase + toutes les features
> ouvertes aux inscrits, Stripe branché plus tard. Prérequis : PR mergée sur
> main, DNS `triptic` (A → 82.25.118.185, nuage GRIS) créé chez Cloudflare.

## 0. Pré-vol (déjà en place le 18/08)

- [x] Traefik : provider fichier + route `triptic.hakoe-alsace.com` → 127.0.0.1:3001
      (`/docker/traefik/dynamic/triptic.yml`, certResolver letsencrypt).
      Sauvegarde compose : `/docker/traefik/docker-compose.yml.bak-20260818`.
- [x] Projet Supabase `triptic` (eu-central-1), Site URL configurée,
      confirmation email désactivée (SMTP Resend à brancher plus tard).
- [ ] DNS `triptic.hakoe-alsace.com` → 82.25.118.185 (DNS only). Dès qu'il
      propage, Traefik obtient le certificat tout seul (HTTP-01) — vérifier :
      `docker logs traefik-traefik-1 --since 5m | grep -i acme`

## 1. Sauvegarde BDD (obligatoire avant migration)

```bash
ssh root@82.25.118.185 "pg_dump -U triptic_user -h localhost triptic_db | gzip > /root/backup-triptic-$(date +%Y%m%d-%H%M).sql.gz && ls -lh /root/backup-triptic-*.gz | tail -1"
```

## 2. Variables d'environnement (/opt/triptic/.env)

Ajouter :

```bash
SUPABASE_URL=https://ztiphyayxnpqimnfxmmu.supabase.co
VITE_SUPABASE_URL=https://ztiphyayxnpqimnfxmmu.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_DNsTFm2M6Lv6jT-xuuFByQ_FqHxMhvS
LAUNCH_OFFER=true
APP_URL=https://triptic.hakoe-alsace.com
```

Retirer : `ALLOW_PLAN_OVERRIDE` (ferme le bypass x-plan).
Vérifier : `NODE_ENV=production` dans l'env PM2 (`pm2 env <id> | grep NODE_ENV`).

## 3. Déploiement

```bash
cd /opt/triptic && git pull origin main && pnpm install --frozen-lockfile && pnpm build
psql -U triptic_user -h localhost -d triptic_db -f server/src/db/migrations/0008_generation_quotas.sql
pm2 reload triptic-api --update-env
```

## 4. Smoke tests (tous doivent passer)

```bash
curl -s https://triptic.hakoe-alsace.com/health                             # {"status":"ok"}
curl -s https://triptic.hakoe-alsace.com/api/me                             # authenticated:false
curl -s -o /dev/null -w "%{http_code}" -X POST https://triptic.hakoe-alsace.com/api/trips -H "Content-Type: application/json" -d '{}'   # 401 (plus de pool anonyme)
curl -s -o /dev/null -w "%{http_code}" -H "x-plan: aventurier" https://triptic.hakoe-alsace.com/api/trips/<id>/gpx                      # 402 (bypass fermé)
curl -s -D - -o /dev/null https://triptic.hakoe-alsace.com/ | grep -i "content-security\|strict-transport"                              # CSP présente
```

Puis depuis un téléphone : créer un compte, générer un trip, sauvegarder,
partager le lien public, exporter le GPX, installer la PWA.

## 5. Rollback

```bash
cd /opt/triptic && git reset --hard <sha-précédent> && pnpm install --frozen-lockfile && pnpm build && pm2 reload triptic-api --update-env
# La migration 0008 est additive (CREATE TABLE IF NOT EXISTS) : aucun rollback BDD requis.
# Restauration complète si nécessaire : gunzip -c /root/backup-triptic-<date>.sql.gz | psql -U triptic_user -h localhost triptic_db
```

## 6. Après le lancement (suivi)

- `pm2 logs triptic-api --lines 100` — chasser les erreurs des premières heures.
- Supabase dashboard → Authentication → Users : suivre les inscriptions.
- Health check externe (UptimeRobot ou n8n cron) sur `/health` + alerte.
- Quand Jules crée le compte Stripe : brancher checkout + webhooks, passer
  `LAUNCH_OFFER=false`, réactiver la confirmation email (SMTP Resend :
  Supabase → Auth → Emails → SMTP : host `smtp.resend.com`, port 465,
  user `resend`, password = clé API Resend).
