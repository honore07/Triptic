# NOTE — Fermer le bypass paywall en prod (QA 1.2)

Le header `x-plan` n'est honoré que si `NODE_ENV !== production` ou `ALLOW_PLAN_OVERRIDE=true`.
Sur le VPS :

1. Vérifier l'env vu par PM2 : `pm2 env <id triptic-api> | grep -E "NODE_ENV|ALLOW_PLAN_OVERRIDE"`
   → `NODE_ENV=production` doit apparaître (sinon l'ajouter dans `ecosystem.config` → `env`).
2. Retirer `ALLOW_PLAN_OVERRIDE` de l'ecosystem et du `.env`, puis `pm2 reload triptic-api --update-env`.
3. Au boot, un log `warn` « Plan override actif (démo) » signale que le bypass est encore ouvert.
4. Vérif : `curl -s -o /dev/null -w "%{http_code}" -H "x-plan: aventurier" http://localhost:3001/api/trips/<id>/gpx` → doit répondre **402**.
