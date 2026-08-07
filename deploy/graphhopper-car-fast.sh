#!/bin/bash
# TRIPTIC — ajout du profil témoin « car_fast » (comparaison scenic vs rapide).
#
# Usage (VPS, root, depuis /opt/triptic, après git pull) :
#   nohup bash deploy/graphhopper-car-fast.sh > /var/log/triptic-gh-carfast.log 2>&1 &
#
# POURQUOI : car_scenic est le SEUL profil voiture déployé — comparer contre
# lui-même (ex. custom_model neutre inline sur un profil CH) retombe
# silencieusement sur le calcul CH pré-compilé et donne un résultat identique
# (constaté le 2026-08-06 sur Strasbourg→Colmar). Pour une comparaison juste,
# il faut un DEUXIÈME profil réel dans le graphe : car_fast, même base
# car.json que car_scenic (mêmes vitesses/accès), sans overlay scenic. Reste
# un profil DIAGNOSTIC — l'app ne l'utilise jamais (RoutingService ne connaît
# que car_scenic pour les roadtrips).
#
# Comme pour foot_scenic (leçon du 06/08) : GraphHopper 12 fige les profils à
# l'import → reconstruction du graphe obligatoire, mais SANS couper le
# service (build à côté sur port 8990, bascule seulement après validation).
set -uo pipefail

DATA_DIR=/opt/graphhopper/data
REPO_DIR="${TRIPTIC_DIR:-/opt/triptic}"
COMPOSE_FILE="$REPO_DIR/deploy/graphhopper/docker-compose.graphhopper.yml"
SRC_PBF="$DATA_DIR/triptic.osm.pbf"       # couverture actuelle, inchangée
NEWGRAPH="$DATA_DIR/graph-cache-carfast"
BUILD_CFG="$DATA_DIR/config-carfast.yml"
STATUS_FILE=/opt/graphhopper/DERNIER-CARFAST.txt
BUILD_PORT=8990
IMAGE=israelhikingmap/graphhopper:latest
# Strasbourg -> Colmar (lon lat) : corridor avec une vraie alternative
# autoroute (A35) à côté de la route des vins — bon témoin de comparaison.
WITNESS='{"points":[[7.7521,48.5734],[7.3585,48.0777]],"profile":"car_fast","points_encoded":false,"instructions":false}'
WITNESS_SCENIC='{"points":[[7.7521,48.5734],[7.3585,48.0777]],"profile":"car_scenic","points_encoded":false,"instructions":false}'

log() { echo "[$(date '+%F %T')] $*"; }
status() { { echo "état   : $1"; echo "détail : $2"; echo "quand  : $(date '+%F %T %Z')"; } > "$STATUS_FILE"; }
trap 'log "✗ INTERROMPU"; status ECHEC "signal reçu"; exit 1' INT TERM

status EN_COURS "démarrage"

# ---------------------------------------------------------------- prérequis
log "=== Prérequis ==="
command -v docker >/dev/null || { log "✗ Docker absent"; status ECHEC "docker absent"; exit 1; }
[[ -f "$SRC_PBF" ]] || { log "✗ $SRC_PBF absent — rien à reconstruire"; status ECHEC "pbf absent"; exit 1; }
grep -q 'name: car_fast' "$REPO_DIR/deploy/graphhopper/config.yml" \
  || { log "✗ car_fast absent de config.yml — git pull d'abord"; status ECHEC "config source absente"; exit 1; }

avail_gb=$(( $(df --output=avail -k /opt | tail -1 | tr -d ' ') / 1024 / 1024 ))
log "Espace libre /opt : ${avail_gb} Go"
if (( avail_gb < 8 )); then
  log "✗ Moins de 8 Go libres — libérer avant de relancer (df -h /opt)"
  status ECHEC "disque insuffisant (${avail_gb} Go)"
  exit 1
fi

# ------------------------------------------------------------------ config
# Config stagée à part : la config LIVE n'est touchée qu'au moment du swap
# (sinon un redémarrage pendant le build ferait planter le conteneur en
# service — « cannot add new profiles to the loaded graph »).
log "=== Config de build (car_fast inclus) — config live intacte ==="
cp "$REPO_DIR/deploy/graphhopper/config.yml" "$BUILD_CFG"
cp "$REPO_DIR/deploy/graphhopper/custom_models/"*.json "$DATA_DIR/custom_models/" 2>/dev/null || true

# -------------------------------------------------------- build hors ligne
log "=== Construction hors ligne (le routing actuel reste UP) ==="
rm -rf "$NEWGRAPH"
docker rm -f triptic-gh-carfast >/dev/null 2>&1 || true
docker run -d --name triptic-gh-carfast \
  -e JAVA_OPTS="-Xmx4g -Xms1g" \
  -v /opt/graphhopper/data:/data \
  -p "127.0.0.1:$BUILD_PORT:8989" \
  "$IMAGE" \
  --input "/data/triptic.osm.pbf" -c "/data/config-carfast.yml" \
  -o "/data/graph-cache-carfast" --host 0.0.0.0 >/dev/null

build_ok() {
  curl -fsS -m 15 -X POST "http://localhost:$BUILD_PORT/route" \
    -H 'Content-Type: application/json' -d "$WITNESS" 2>/dev/null | grep -q '"paths"' \
  && curl -fsS -m 15 -X POST "http://localhost:$BUILD_PORT/route" \
    -H 'Content-Type: application/json' -d "$WITNESS_SCENIC" 2>/dev/null | grep -q '"paths"'
}

deadline=$(( $(date +%s) + 6 * 3600 ))
while (( $(date +%s) < deadline )); do
  if curl -fsS "http://localhost:$BUILD_PORT/health" >/dev/null 2>&1; then
    if ! build_ok; then
      log "✗ Graphe « sain » mais car_fast et/ou car_scenic ne routent pas"
      docker logs --tail 30 triptic-gh-carfast 2>&1 | sed 's/^/    /' || true
      docker rm -f triptic-gh-carfast >/dev/null 2>&1 || true
      status ECHEC "témoin(s) non routable(s)"
      exit 1
    fi
    log "  ✓ graphe reconstruit, sain, car_fast ET car_scenic routent"
    docker rm -f triptic-gh-carfast >/dev/null 2>&1 || true
    break
  fi
  if ! docker ps --format '{{.Names}}' | grep -q triptic-gh-carfast; then
    log "✗ Conteneur de build arrêté — logs :"
    docker logs --tail 30 triptic-gh-carfast 2>&1 | sed 's/^/    /' || true
    docker rm -f triptic-gh-carfast >/dev/null 2>&1 || true
    status ECHEC "build interrompu (voir log)"
    exit 1
  fi
  sleep 30
done

if [[ ! -d "$NEWGRAPH" ]]; then
  log "✗ Aucun graphe reconstruit dans le délai imparti"
  docker rm -f triptic-gh-carfast >/dev/null 2>&1 || true
  status ECHEC "délai dépassé sans graphe"
  exit 1
fi

# ---------------------------------------------------------------- bascule
log "=== Bascule (graphe + config car_fast) ==="
cp -f "$DATA_DIR/config.yml" "$DATA_DIR/config.yml.bak-precarfast"
cp -f "$BUILD_CFG" "$DATA_DIR/config.yml"
rm -rf "$DATA_DIR/graph-cache.old"
[[ -d "$DATA_DIR/graph-cache" ]] && mv "$DATA_DIR/graph-cache" "$DATA_DIR/graph-cache.old"
mv "$NEWGRAPH" "$DATA_DIR/graph-cache"
docker compose -f "$COMPOSE_FILE" up -d --force-recreate >/dev/null

service_ok() {
  curl -fsS -m 15 -X POST "http://localhost:8989/route" \
    -H 'Content-Type: application/json' -d "$WITNESS" 2>/dev/null | grep -q '"paths"' \
  && curl -fsS -m 15 -X POST "http://localhost:8989/route" \
    -H 'Content-Type: application/json' -d "$WITNESS_SCENIC" 2>/dev/null | grep -q '"paths"'
}
for _ in $(seq 1 120); do
  if curl -fsS http://localhost:8989/health >/dev/null 2>&1 && service_ok; then
    rm -rf "$DATA_DIR/graph-cache.old"
    log "=== ✓ EN SERVICE : car_fast + car_scenic routables sur le port public ==="
    status SUCCES "car_fast en service (diagnostic) — car_scenic inchangé pour l'app"
    exit 0
  fi
  sleep 15
done

log "✗ Le service ne repart pas — restauration graphe + config précédents"
cp -f "$DATA_DIR/config.yml.bak-precarfast" "$DATA_DIR/config.yml"
rm -rf "$DATA_DIR/graph-cache"
[[ -d "$DATA_DIR/graph-cache.old" ]] && mv "$DATA_DIR/graph-cache.old" "$DATA_DIR/graph-cache"
docker compose -f "$COMPOSE_FILE" up -d --force-recreate >/dev/null
status ECHEC "service non reparti — graphe + config restaurés"
exit 1
