#!/bin/bash
# TRIPTIC — installation GraphHopper sur le VPS (roadmap 0.2)
# Usage : bash deploy/graphhopper-setup.sh          (depuis /opt/triptic)
# Idempotent : relançable ; re-télécharge/refusionne seulement si demandé
# (FORCE_REBUILD=1). Le premier import prend 30-90 min sur KVM 2.
#
# Périmètre = régions pilotes (server/src/import/osm/regions.ts) :
# Alsace-Vosges + Alpes FR/CH/IT. Surcharger : TRIPTIC_PBF_URLS="url1 url2…"
#
# ⛔ GOTCHA confirmé (07/2026) : l'étape 3 (`osmium merge` d'extraits Geofabrik
# adjacents) fait planter l'import GraphHopper 12 — objets en versions
# différentes aux frontières entre extraits coupés sur des snapshots
# différents (résultat « undefined » selon man osmium-merge). Ce script ne
# fonctionne donc qu'avec UN seul extrait (TRIPTIC_PBF_URLS=une URL, état
# actuel : alsace). Pour étendre la couverture, utiliser
# deploy/graphhopper-extend.sh (découpe bbox depuis une source unique) —
# procédure : deploy/RUNBOOK-routing-extension.md.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

DATA_DIR=/opt/graphhopper/data
REPO_DIR="${TRIPTIC_DIR:-/opt/triptic}"
COMPOSE_FILE="$REPO_DIR/deploy/graphhopper/docker-compose.graphhopper.yml"

DEFAULT_URLS="
https://download.geofabrik.de/europe/france/alsace-latest.osm.pbf
https://download.geofabrik.de/europe/france/lorraine-latest.osm.pbf
https://download.geofabrik.de/europe/france/franche-comte-latest.osm.pbf
https://download.geofabrik.de/europe/france/rhone-alpes-latest.osm.pbf
https://download.geofabrik.de/europe/france/provence-alpes-cote-d-azur-latest.osm.pbf
https://download.geofabrik.de/europe/switzerland-latest.osm.pbf
https://download.geofabrik.de/europe/italy/nord-ovest-latest.osm.pbf
https://download.geofabrik.de/europe/italy/nord-est-latest.osm.pbf
"
URLS="${TRIPTIC_PBF_URLS:-$DEFAULT_URLS}"

echo "=== 1. Prérequis (osmium pour fusionner les extraits) ==="
command -v docker >/dev/null || { echo "Docker requis (déjà sur le VPS normalement)"; exit 1; }
command -v osmium >/dev/null || { apt-get update -qq && apt-get install -y osmium-tool; }

mkdir -p "$DATA_DIR/custom_models" "$DATA_DIR/pbf"

echo "=== 2. Téléchargement des extraits Geofabrik (© OpenStreetMap contributors, ODbL) ==="
cd "$DATA_DIR/pbf"
for url in $URLS; do
  f=$(basename "$url")
  if [[ ! -f "$f" || "${FORCE_REBUILD:-0}" == "1" ]]; then
    echo "  → $f"
    curl -fL --retry 3 -o "$f.tmp" "$url" && mv "$f.tmp" "$f"
  else
    echo "  ✓ $f (déjà présent)"
  fi
done

echo "=== 3. Fusion → triptic.osm.pbf ==="
if [[ ! -f "$DATA_DIR/triptic.osm.pbf" || "${FORCE_REBUILD:-0}" == "1" ]]; then
  osmium merge ./*.osm.pbf -O -o "$DATA_DIR/triptic.osm.pbf"
  # Le graphe doit être réimporté après un nouveau PBF
  rm -rf "$DATA_DIR/graph-cache"
else
  echo "  ✓ triptic.osm.pbf (déjà présent — FORCE_REBUILD=1 pour refusionner)"
fi

echo "=== 4. Config + custom model scenic ==="
cp "$REPO_DIR/deploy/graphhopper/config.yml" "$DATA_DIR/config.yml"
cp "$REPO_DIR/deploy/graphhopper/custom_models/car_scenic.json" "$DATA_DIR/custom_models/car_scenic.json"

echo "=== 5. Lancement (l'import du graphe démarre au premier boot : 30-90 min) ==="
docker compose -f "$COMPOSE_FILE" up -d

echo "=== 6. Attente du service (long au premier import — Ctrl-C sans risque, ça continue en fond) ==="
for i in $(seq 1 360); do
  if curl -fsS http://localhost:8989/health >/dev/null 2>&1; then
    echo " ✓ GraphHopper OK — test :"
    echo '   curl "http://localhost:8989/route?point=48.0631,7.0209&point=47.9014,7.0994&profile=car_scenic"'
    exit 0
  fi
  sleep 15
done
echo "✗ Toujours pas prêt après 90 min — voir : docker logs -f triptic-graphhopper"
exit 1
