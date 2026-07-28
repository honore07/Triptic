# Workflows n8n — TRIPTIC

Source de vérité versionnée des workflows de l'instance n8n du VPS
(conteneur Docker, UI sur le port 5678).

| Fichier | Rôle | Déclencheur |
|---|---|---|
| `agent-enrichment-webhook.json` | Trace chaque zone auto-enrichie par le serveur (`services/enrichment.ts` → `N8N_ENRICH_WEBHOOK_URL`) | Webhook POST `/webhook/triptic-enrich` |
| `agent-weekly-places-report.json` | Rapport hebdo de santé de la base de lieux (`GET /api/places/stats`) | CRON lundi 09:00 |

L'agent correcteur d'itinéraires tourne **dans** le moteur (`packages/ai-engine`,
règle qualité #5) — pas de doublon n8n. L'agent CRM lifecycle attend la clé
Resend.

## Import sur le VPS

```bash
docker cp /opt/triptic/n8n-workflows/. <conteneur-n8n>:/tmp/wf/
docker exec -u node <conteneur-n8n> n8n import:workflow --separate --input=/tmp/wf/
# puis publier/activer les workflows dans l'UI (bouton « Publish » en haut à droite)
```

> ⚠️ `n8n import:workflow` (CLI) **exige un champ `id` de premier niveau** dans
> le JSON, sinon il échoue avec `SQLITE_CONSTRAINT: NOT NULL constraint failed:
> workflow_entity.id`. Chaque fichier ici en a un (ré-import idempotent : même
> `id` ⇒ mise à jour, pas de doublon). Un nouveau workflow créé dans l'UI reçoit
> son `id` automatiquement — pensez à le reporter dans le JSON exporté.
> Vérifié le 2026-07-27 sur l'instance du VPS (`agent-compliance-report` importé
> + publié, cron lundi 09:30).

Après modification dans l'UI n8n : ré-exporter le JSON ici (menu ⋯ → Download)
pour garder le repo en phase.

## Variables d'env côté serveur

```
N8N_ENRICH_WEBHOOK_URL=http://localhost:5678/webhook/triptic-enrich
```
(le serveur tourne sur l'hôte, n8n publie le port 5678 en localhost ;
depuis le conteneur n8n, l'API est jointe via l'IP publique)
