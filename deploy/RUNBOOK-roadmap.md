# TRIPTIC — Runbook VPS : mise en service de la roadmap (phases 0-6)

> Commandes à exécuter **sur le VPS** (SSH), dans l'ordre, une fois la PR
> mergée sur `main`. Chaque étape est idempotente et relançable.

## 1. Code + migrations + reload (5 min)

```bash
cd /opt/triptic && git pull origin main && pnpm install --frozen-lockfile
for m in server/src/db/migrations/*.sql; do sudo -u postgres psql -d triptic_db -f "$m"; done
pnpm test && pm2 reload triptic-api && curl -fsS http://localhost:3001/health
```

## 2. GraphHopper — routing réel (30-90 min au premier import)

```bash
bash /opt/triptic/deploy/graphhopper-setup.sh
```

Puis dans `/opt/triptic/.env` : `GRAPHHOPPER_URL=http://localhost:8989`, et
`pm2 reload triptic-api`. Test :
`curl "http://localhost:8989/route?point=48.0631,7.0209&point=47.9014,7.0994&profile=car_scenic"`.
⚠️ RAM : l'import JVM est plafonné à 4 Go (KVM 2 = 8 Go). Si OOM, réduire la
liste `TRIPTIC_PBF_URLS` (ex. commencer par Alsace/Lorraine seulement).

## 3. OpenTopoData — élévation (optionnel, ~3 Go de tuiles)

```bash
bash /opt/triptic/deploy/opentopodata-setup.sh
```

Puis `OPENTOPODATA_URL=http://localhost:5000` dans `.env` + reload.

## 4. Imports de données (relançables, dans cet ordre)

```bash
cd /opt/triptic/server
pnpm import:osm                  # POI outdoor + NOUVEAU : restos/cafés/bars
pnpm import:datatourisme         # NOUVEAU : conserve les traces GPX jointes
pnpm import:villages && pnpm enrich:wikidata
pnpm import:geotrek              # NOUVEAU : boucles rando des parcs (traces)
pnpm import:osm-trails           # NOUVEAU : boucles OSM (GR/GRP exclus)
```

## 5. Agent de conformité + pipeline blogs (phase 6)

Test sur UNE page (l'agent gate tout — rien ne passe `active` sans lui) :

```bash
cd /opt/triptic/server && pnpm import:blog -- --url=https://exemple-blog-outdoor.fr/article
```

Audit trail : `pm2 logs triptic-api | grep '"agent":"compliance"'` (ou le
fichier de log Pino). Rapport hebdo : importer
`n8n-workflows/agent-compliance-report.json` dans n8n (http://localhost:5678)
comme les autres workflows, puis y brancher Resend/Telegram.

## 6. Vérifications finales

```bash
curl -fsS http://localhost:3001/api/places/stats
```

- `by_source` doit montrer osm / datatourisme / wikidata / geotrek-* ;
- `tdm` doit exister (zéros tant qu'aucun blog n'est fouillé) ;
- générer un trip depuis l'app : la carte doit suivre les routes (plus de
  traits droits) et afficher budget + CO₂.

## Notes légales embarquées dans le code

- FFRandonnée : GR®/GRP® exclus des imports OSM (testé).
- Mapbox : affichage seul ; tout le routing/stockage passe par GraphHopper (ODbL).
- Attributions : © OpenStreetMap contributors, DATAtourisme, Geotrek/Etalab,
  © UE Copernicus, ADEME Base Carbone — page légale publique à créer (reste à faire).
- LIA TDM : `docs/legal/LIA-tdm.md` + prompt de règles versionné
  (`server/src/agents/complianceAgent.ts`) — relecture avocat recommandée.
