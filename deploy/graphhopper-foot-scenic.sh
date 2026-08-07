#!/bin/bash
# TRIPTIC — ajout du profil de rando « scenic » (foot_scenic) au graphe VPS.
#
# Usage (VPS, root, depuis /opt/triptic, après git pull) :
#   nohup bash deploy/graphhopper-foot-scenic.sh > /var/log/triptic-gh-scenic.log 2>&1 &
#
# CE QUE FAIT LE SCRIPT
# Ajouter le profil foot_scenic + l'encoded value foot_network exige une
# RECONSTRUCTION du graphe (les encoded values sont figées à l'import). On
# garde la MÊME couverture : on réutilise le triptic.osm.pbf déjà en service,
# aucun téléchargement, aucune ré-extraction osmium.
#
# PRINCIPE DE SÛRETÉ (identique à graphhopper-overnight.sh) : le graphe en
# service n'est JAMAIS supprimé. Le nouveau se construit dans un conteneur
# séparé (port 8990) sur son propre répertoire, et ne remplace l'ancien
# qu'après avoir prouvé que foot_scenic route réellement. Le routing reste
# disponible pendant toute la construction. En cas d'échec : rien ne bouge.
set -uo pipefail

DATA_DIR=/opt/graphhopper/data
REPO_DIR="${TRIPTIC_DIR:-/opt/triptic}"
COMPOSE_FILE="$REPO_DIR/deploy/graphhopper/docker-compose.graphhopper.yml"
SRC_PBF="$DATA_DIR/triptic.osm.pbf"       # couverture actuelle, inchangée
NEWGRAPH="$DATA_DIR/graph-cache-scenic"
STATUS_FILE=/opt/graphhopper/DERNIER-SCENIC.txt
BUILD_PORT=8990
IMAGE=israelhikingmap/graphhopper:latest
# Point-témoin de validation foot_scenic (lon lat) : un sentier des Vosges
# (La Bresse / Rainkopf) où le profil doit renvoyer un tracé non vide.
WITNESS='{"points":[[6.8720,47.9950],[6.9250,47.9600]],"profile":"foot_scenic","points_encoded":false,"instructions":false}'

log() { echo "[$(date '+%F %T')] $*"; }
status() { { echo "état   : $1"; echo "détail : $2"; echo "quand  : $(date '+%F %T %Z')"; } > "$STATUS_FILE"; }
trap 'log "✗ INTERROMPU"; status ECHEC "signal reçu"; exit 1' INT TERM

status EN_COURS "démarrage"

# ---------------------------------------------------------------- prérequis
log "=== Prérequis ==="
command -v docker >/dev/null || { log "✗ Docker absent"; status ECHEC "docker absent"; exit 1; }
[[ -f "$SRC_PBF" ]] || { log "✗ $SRC_PBF absent — rien à reconstruire"; status ECHEC "pbf absent"; exit 1; }
[[ -f "$REPO_DIR/deploy/graphhopper/custom_models/foot_scenic.json" ]] \
  || { log "✗ foot_scenic.json absent — git pull d'abord"; status ECHEC "custom model absent"; exit 1; }

avail_gb=$(( $(df --output=avail -k /opt | tail -1 | tr -d ' ') / 1024 / 1024 ))
log "Espace libre /opt : ${avail_gb} Go (un 2e graphe temporaire ~ taille du graphe actuel)"
if (( avail_gb < 8 )); then
  log "✗ Moins de 8 Go libres — libérer avant de relancer (df -h /opt)"
  status ECHEC "disque insuffisant (${avail_gb} Go)"
  exit 1
fi

# ------------------------------------------------------------------ config
# On stage la config foot_scenic dans un fichier SÉPARÉ (config-scenic.yml) :
# la config LIVE (config.yml) n'est PAS touchée tant que le nouveau graphe
# n'est pas validé. Sinon, un redémarrage du conteneur en service pendant le
# build (20 min) le ferait crasher (« cannot add new profiles to the loaded
# graph » — GraphHopper 12 fige les profils à l'import).
BUILD_CFG="$DATA_DIR/config-scenic.yml"
log "=== Config de build (foot_scenic) — config live intacte ==="
cp "$REPO_DIR/deploy/graphhopper/config.yml" "$BUILD_CFG"
cp "$REPO_DIR/deploy/graphhopper/custom_models/"*.json "$DATA_DIR/custom_models/"

# -------------------------------------------------------- build hors ligne
log "=== Construction hors ligne (le routing actuel reste UP) ==="
rm -rf "$NEWGRAPH"
docker rm -f triptic-gh-scenic >/dev/null 2>&1 || true
# -o explicite : sinon l'entrypoint impose graph.location=default-gh et
# recharge l'ancien graphe au lieu de reconstruire (gotcha du 03/08).
docker run -d --name triptic-gh-scenic \
  -e JAVA_OPTS="-Xmx4g -Xms1g" \
  -v /opt/graphhopper/data:/data \
  -p "127.0.0.1:$BUILD_PORT:8989" \
  "$IMAGE" \
  --input "/data/triptic.osm.pbf" -c "/data/config-scenic.yml" \
  -o "/data/graph-cache-scenic" --host 0.0.0.0 >/dev/null

# foot_scenic route-t-il vraiment sur le point-témoin ? (un /health « sain »
# ne prouve rien — cf. leçon du 03/08).
scenic_routes() {
  curl -fsS -m 15 -X POST "http://localhost:$BUILD_PORT/route" \
    -H 'Content-Type: application/json' -d "$WITNESS" 2>/dev/null \
    | grep -q '"paths"'
}

deadline=$(( $(date +%s) + 6 * 3600 ))   # 6 h large (import intl ~20 min en pratique)
while (( $(date +%s) < deadline )); do
  if curl -fsS "http://localhost:$BUILD_PORT/health" >/dev/null 2>&1; then
    if ! scenic_routes; then
      log "✗ Graphe « sain » mais foot_scenic ne route pas — profil absent ?"
      docker logs --tail 30 triptic-gh-scenic 2>&1 | sed 's/^/    /' || true
      docker rm -f triptic-gh-scenic >/dev/null 2>&1 || true
      status ECHEC "foot_scenic ne route pas sur le témoin"
      exit 1
    fi
    log "  ✓ graphe reconstruit, sain, foot_scenic route sur le témoin"
    docker rm -f triptic-gh-scenic >/dev/null 2>&1 || true
    break
  fi
  # conteneur de build mort (OOM, données corrompues…)
  if ! docker ps --format '{{.Names}}' | grep -q triptic-gh-scenic; then
    log "✗ Conteneur de build arrêté — logs :"
    docker logs --tail 30 triptic-gh-scenic 2>&1 | sed 's/^/    /' || true
    docker rm -f triptic-gh-scenic >/dev/null 2>&1 || true
    status ECHEC "build interrompu (voir log)"
    exit 1
  fi
  sleep 30
done

# À ce stade : soit le build a réussi (on est sorti du while par `break`),
# soit le deadline de 6 h a expiré sans graphe prêt.
if [[ ! -d "$NEWGRAPH" ]]; then
  log "✗ Aucun graphe reconstruit dans le délai imparti"
  docker rm -f triptic-gh-scenic >/dev/null 2>&1 || true
  status ECHEC "délai dépassé sans graphe"
  exit 1
fi

# ---------------------------------------------------------------- bascule
# Graphe ET config basculent ENSEMBLE : le graphe reconstruit contient le
# profil foot_scenic, la config live doit le déclarer (sinon incohérence).
log "=== Bascule (graphe + config foot_scenic) ==="
cp -f "$DATA_DIR/config.yml" "$DATA_DIR/config.yml.bak-prescenic"
cp -f "$BUILD_CFG" "$DATA_DIR/config.yml"
rm -rf "$DATA_DIR/graph-cache.old"
[[ -d "$DATA_DIR/graph-cache" ]] && mv "$DATA_DIR/graph-cache" "$DATA_DIR/graph-cache.old"
mv "$NEWGRAPH" "$DATA_DIR/graph-cache"
docker compose -f "$COMPOSE_FILE" up -d --force-recreate >/dev/null

# le service public doit repartir ET router foot_scenic
scenic_routes_public() {
  curl -fsS -m 15 -X POST "http://localhost:8989/route" \
    -H 'Content-Type: application/json' -d "$WITNESS" 2>/dev/null | grep -q '"paths"'
}
for _ in $(seq 1 120); do   # 30 min : rechargement d'un graphe déjà bâti
  if curl -fsS http://localhost:8989/health >/dev/null 2>&1 && scenic_routes_public; then
    rm -rf "$DATA_DIR/graph-cache.old"
    log "=== ✓ EN SERVICE : foot_scenic routable sur le port public ==="
    log "    Étape finale (manuelle) : ajouter GRAPHHOPPER_FOOT_PROFILE=foot_scenic"
    log "    au .env de /opt/triptic puis  pm2 reload triptic-api"
    status SUCCES "foot_scenic en service — reste à activer GRAPHHOPPER_FOOT_PROFILE"
    exit 0
  fi
  sleep 15
done

# le nouveau graphe ne repart pas → restauration graphe ET config d'origine
# (config foot_scenic + ancien graphe = crash « cannot add new profiles »).
log "✗ Le service ne repart pas — restauration graphe + config précédents"
cp -f "$DATA_DIR/config.yml.bak-prescenic" "$DATA_DIR/config.yml"
rm -rf "$DATA_DIR/graph-cache"
[[ -d "$DATA_DIR/graph-cache.old" ]] && mv "$DATA_DIR/graph-cache.old" "$DATA_DIR/graph-cache"
docker compose -f "$COMPOSE_FILE" up -d --force-recreate >/dev/null
status ECHEC "service non reparti — graphe + config restaurés"
exit 1
