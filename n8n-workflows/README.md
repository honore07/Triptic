# Workflows n8n — TRIPTIC

Source de vérité versionnée des workflows de l'instance n8n du VPS
(conteneur Docker, UI sur le port 5678).

| Fichier | Rôle | Déclencheur | Notifications |
|---|---|---|---|
| `agent-enrichment-webhook.json` | Trace chaque zone auto-enrichie par le serveur (`services/enrichment.ts` → `N8N_ENRICH_WEBHOOK_URL`) | Webhook POST `/webhook/triptic-enrich` | Email Resend + Telegram à chaque événement |
| `agent-weekly-places-report.json` | Rapport hebdo de santé de la base de lieux (`GET /api/places/stats`) | CRON lundi 09:00 | Email Resend (rapport complet) + résumé Telegram |
| `agent-compliance-report.json` | Rapport hebdo de conformité TDM (Agent 5) | CRON lundi 09:30 | Email Resend (toujours) + alerte Telegram **seulement si anomalie** (fiches en quarantaine > 0 ou opt-out > 0) |
| `agent-crm-brevo.json` | Pousse chaque **nouvelle inscription** dans le CRM Brevo (contact upsert + attributs TRIPTIC_PLAN/USER_ID/SIGNUP) | Webhook POST `/webhook/triptic-signup` (émis par `server/src/repo/users.ts` via `N8N_CRM_WEBHOOK_URL`) | — |

L'agent correcteur d'itinéraires tourne **dans** le moteur (`packages/ai-engine`,
règle qualité #5) — pas de doublon n8n. L'agent CRM lifecycle attend la clé
Resend.

## Credentials à créer dans n8n (une seule fois, dans l'UI)

Aucune clé n'est (ni ne doit jamais être) dans les JSON de ce dossier — les
nœuds référencent des credentials n8n **par nom**. À créer dans l'UI n8n
(menu Credentials) :

1. **« Resend API »** — type **Header Auth** :
   - Name : `Authorization`
   - Value : `Bearer re_xxx` (la valeur de `RESEND_API_KEY`)
   - ℹ️ `RESEND_API_KEY` existe déjà dans le `.env` du serveur (CLAUDE.md §8),
     mais n8n ne lit pas ce fichier : il stocke sa **propre copie chiffrée**
     dans sa base de credentials. Reprendre la même clé.
   - ⚠️ Le `From` des emails est `TRIPTIC <noreply@hakoe-alsace.com>` :
     **vérifier le domaine `hakoe-alsace.com` dans Resend** (Dashboard →
     Domains → Add Domain, puis poser les enregistrements DNS SPF/DKIM
     demandés — le domaine est chez Cloudflare). Sans domaine vérifié,
     Resend refuse l'envoi.

2. **« Brevo API »** — type **Header Auth** :
   - Name : `api-key`
   - Value : la clé API Brevo (app.brevo.com → Settings → SMTP & API →
     API Keys — créer une clé dédiée « n8n-triptic », révocable séparément).
   - Côté serveur : ajouter `N8N_CRM_WEBHOOK_URL=http://localhost:5678/webhook/triptic-signup`
     au `.env` pour activer l'émission de l'événement d'inscription.

3. **« Telegram TRIPTIC Bot »** — type **Telegram API** :
   - Access Token : le token du bot (voir « Créer le bot Telegram » ci-dessous)

Après import des workflows (voir plus bas), **ouvrir chaque nœud
« Email Resend » / « … Telegram »** et sélectionner la credential dans la
liste déroulante si elle n'est pas déjà résolue (les JSON versionnés ne
portent que le nom, pas l'id interne de la credential).

## Créer le bot Telegram + récupérer le chat_id

1. Dans Telegram, parler à **@BotFather** → `/newbot` → choisir un nom
   (ex. « TRIPTIC Notifs ») et un username (ex. `triptic_notifs_bot`).
   BotFather renvoie le **token** (`123456:ABC-…`) → à mettre dans la
   credential « Telegram TRIPTIC Bot ».
2. Ouvrir une conversation avec le bot et lui envoyer n'importe quel message
   (ex. « salut ») — indispensable, un bot ne peut pas écrire en premier.
3. Récupérer le **chat_id** :
   ```bash
   curl -s "https://api.telegram.org/bot<TOKEN>/getUpdates"
   # → chercher "chat":{"id":XXXXXXXXX,...} dans la réponse
   ```
4. Déclarer le chat_id comme variable d'environnement du **conteneur n8n**
   (les nœuds Telegram l'utilisent via l'expression `{{ $env.TELEGRAM_CHAT_ID }}`) :
   ```yaml
   # docker-compose du conteneur n8n
   environment:
     - TELEGRAM_CHAT_ID=XXXXXXXXX
   ```
   puis recréer le conteneur (`docker compose up -d n8n`).
   > Si l'expression `$env` est vide dans n8n : vérifier que
   > `N8N_BLOCK_ENV_ACCESS_IN_NODE` n'est pas à `true` sur le conteneur.

## Import sur le VPS

```bash
docker cp /opt/triptic/n8n-workflows/. <conteneur-n8n>:/tmp/wf/
docker exec -u node <conteneur-n8n> n8n import:workflow --separate --input=/tmp/wf/
# puis publier/activer les workflows dans l'UI (bouton « Publish » en haut à droite)
```

> ⚠️ `n8n import:workflow` (CLI) **exige un champ `id` de premier niveau** dans
> le JSON, sinon il échoue avec `SQLITE_CONSTRAINT: NOT NULL constraint failed:
> workflow_entity.id`. Le ré-import est idempotent : même `id` ⇒ mise à jour du
> workflow existant, pas de doublon. Un nouveau workflow créé dans l'UI reçoit
> son `id` automatiquement — pensez à le reporter dans le JSON exporté.
> Vérifié le 2026-07-27 sur l'instance du VPS (`agent-compliance-report` importé
> + publié, cron lundi 09:30).

### Ré-import des workflows mis à jour SANS casser les workflows actifs

Les 3 workflows sont déjà **actifs** sur le VPS. Pour les remplacer par les
versions de ce dossier (qui ajoutent les notifications) :

1. **Récupérer les `id` réels** des workflows sur l'instance :
   ```bash
   docker exec -u node <conteneur-n8n> n8n list:workflow
   ```
2. Seul `agent-compliance-report.json` porte déjà son `id` VPS
   (`9aeaaa35be081366`). **Reporter les `id` listés à l'étape 1** en premier
   niveau dans `agent-enrichment-webhook.json` et
   `agent-weekly-places-report.json` (`"id": "…"` juste avant `"name"`),
   puis les ré-exporter ici pour que le repo reste en phase.
   ⚠️ Ne PAS importer ces deux fichiers via l'UI (« Import from file ») :
   l'UI crée un **nouveau** workflow (doublon, et conflit sur le path du
   webhook) au lieu de mettre à jour l'existant.
3. Lancer l'import CLI ci-dessus (même `id` ⇒ mise à jour en place).
4. Dans l'UI : ouvrir chaque workflow, **sélectionner les credentials** dans
   les nouveaux nœuds (« Resend API », « Telegram TRIPTIC Bot »), puis
   **re-Publish/activer** (l'import CLI peut laisser le workflow désactivé).
5. Vérifier que le webhook enrichment garde **la même URL** : l'URL dépend du
   `path` (`triptic-enrich`), inchangé ici →
   `http://localhost:5678/webhook/triptic-enrich` doit répondre. Test :
   ```bash
   curl -X POST http://localhost:5678/webhook/triptic-enrich \
     -H 'Content-Type: application/json' \
     -d '{"event":"zone_enriched","zone":"test","added":0}'
   ```
   (doit déclencher un email + un message Telegram de test)
6. Tester les deux crons avec « Execute workflow » dans l'UI plutôt que
   d'attendre lundi.

Après modification dans l'UI n8n : ré-exporter le JSON ici (menu ⋯ → Download)
pour garder le repo en phase.

## Variables d'env côté serveur

```
N8N_ENRICH_WEBHOOK_URL=http://localhost:5678/webhook/triptic-enrich
```
(le serveur tourne sur l'hôte, n8n publie le port 5678 en localhost ;
depuis le conteneur n8n, l'API est jointe via l'IP publique)

## Variables d'env côté conteneur n8n

```
TELEGRAM_CHAT_ID=XXXXXXXXX   # chat_id de Jules (voir section bot Telegram)
```
