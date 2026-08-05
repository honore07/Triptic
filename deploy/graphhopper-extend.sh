#!/bin/bash
# TRIPTIC — extension de la couverture routing : Alsace → +Lorraine → +Alpes FR
# Usage (depuis /opt/triptic, en root, de préférence sous nohup — voir
# deploy/RUNBOOK-routing-extension.md) :
#   STAGE=nordest bash deploy/graphhopper-extend.sh   # Alsace + Lorraine (~300 Mo)
#   STAGE=est     bash deploy/graphhopper-extend.sh   # + Franche-Comté + Alpes FR (~1,5 Go)
#
# Stratégie « source unique » : france-latest.osm.pbf (4,7 Go) téléchargé UNE
# fois, puis osmium extract --bbox découpe la zone voulue. Un seul fichier
# source ⇒ aucun nœud dupliqué aux frontières.
#
# ⛔ GOTCHA confirmé (07/2026) : `osmium merge` d'extraits Geofabrik adjacents
# (ex. alsace + lorraine) fait planter l'import GraphHopper 12. osmium merge
# dédoublonne bien les objets identiques, MAIS des extraits coupés sur des
# snapshots différents contiennent le même objet en versions différentes →
# résultat documenté comme « undefined » (man osmium-merge). Ne PAS y revenir.
#
# Suisse / Italie : PAS couvertes par ce script — voir la section dédiée du
# runbook (RUNBOOK-routing-extension.md) pour les options et leurs limites.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

STAGE="${STAGE:?Définir STAGE=nordest ou STAGE=est}"
case "$STAGE" in
  # lon_min,lat_min,lon_max,lat_max — zones CONTIGUËS (un graphe en îlots
  # déconnectés ne sait pas router entre les îlots)
  nordest) BBOX="4.7,47.2,8.35,49.7"  ;;  # Alsace + Lorraine
  est)     BBOX="4.5,43.0,8.35,49.7"  ;;  # + Franche-Comté + Jura + Alpes FR (Corse exclue)
  *) echo "STAGE invalide : $STAGE (attendu nordest|est)"; exit 1 ;;
esac

DATA_DIR=/opt/graphhopper/data
REPO_DIR="${TRIPTIC_DIR:-/opt/triptic}"
COMPOSE_FILE="$REPO_DIR/deploy/graphhopper/docker-compose.graphhopper.yml"
FRANCE_PBF="$DATA_DIR/pbf/france-latest.osm.pbf"
FRANCE_URL="https://download.geofabrik.de/europe/france-latest.osm.pbf"

echo "=== 1. Prérequis ==="
command -v docker >/dev/null || { echo "Docker requis (déjà sur le VPS normalement)"; exit 1; }
command -v osmium >/dev/null || { apt-get update -qq && apt-get install -y osmium-tool; }
mkdir -p "$DATA_DIR/pbf" "$DATA_DIR/custom_models"

echo "=== 2. Garde-fou disque (≥ 20 Go libres sur /opt) ==="
avail_kb=$(df --output=avail -k /opt | tail -1 | tr -d ' ')
if (( avail_kb < 20 * 1024 * 1024 )); then
  echo "✗ Moins de 20 Go libres sur /opt — libérer de l'espace (df -h /opt) avant de relancer"
  exit 1
fi

echo "=== 3. Téléchargement france-latest (4,7 Go — © OpenStreetMap contributors, ODbL) ==="
if [[ ! -f "$FRANCE_PBF" || "${FORCE_DOWNLOAD:-0}" == "1" ]]; then
  # -C - : reprend un téléchargement interrompu (fichier .part conservé)
  curl -fL --retry 5 -C - -o "$FRANCE_PBF.part" "$FRANCE_URL"
  mv "$FRANCE_PBF.part" "$FRANCE_PBF"
else
  echo "  ✓ déjà présent ($(du -h "$FRANCE_PBF" | cut -f1)) — FORCE_DOWNLOAD=1 pour re-télécharger"
fi

echo "=== 4. Découpe osmium (bbox $BBOX — source unique, zéro doublon) ==="
osmium extract --bbox "$BBOX" --set-bounds --strategy complete_ways \
  --overwrite --output-format pbf -o "$DATA_DIR/triptic.osm.pbf.new" "$FRANCE_PBF"
mv -f "$DATA_DIR/triptic.osm.pbf.new" "$DATA_DIR/triptic.osm.pbf"
echo "  → triptic.osm.pbf : $(du -h "$DATA_DIR/triptic.osm.pbf" | cut -f1)"

echo "=== 5. Config + custom model scenic (idempotent) ==="
cp "$REPO_DIR/deploy/graphhopper/config.yml" "$DATA_DIR/config.yml"
cp "$REPO_DIR/deploy/graphhopper/custom_models/car_scenic.json" "$DATA_DIR/custom_models/car_scenic.json"

echo "=== 6. Réimport du graphe (routing indisponible pendant l'import ;"
echo "       l'API TRIPTIC bascule sur les estimations LLM en attendant) ==="
rm -rf "$DATA_DIR/graph-cache"
docker compose -f "$COMPOSE_FILE" up -d --force-recreate

echo "=== 7. Attente du service (nordest : ~1-2 h ; est : jusqu'à une nuit) ==="
for i in $(seq 1 2880); do   # 12 h max (2880 × 15 s)
  if curl -fsS http://localhost:8989/health >/dev/null 2>&1; then
    echo " ✓ GraphHopper OK sur la nouvelle couverture ($STAGE) — tests dans le runbook"
    exit 0
  fi
  sleep 15
done
echo "✗ Pas prêt après 12 h — voir : docker logs --tail 100 triptic-graphhopper"
exit 1
