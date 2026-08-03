#!/bin/bash
# TRIPTIC — extension du routing en une nuit, SANS SURVEILLANCE.
#
# Usage (VPS, root, depuis /opt/triptic) :
#   nohup bash deploy/graphhopper-overnight.sh > /var/log/triptic-gh-nuit.log 2>&1 &
#
# Enchaîne deux paliers, du plus sûr au plus ambitieux :
#   1. nordest — Alsace + Lorraine        (~1-2 h)  → acquis tôt dans la nuit
#   2. intl    — + Jura, Alpes FR/CH/IT   (4-12 h)  → tenté ensuite
# Si le palier 2 échoue ou n'a pas le temps de finir, le palier 1 reste en
# place : on ne se réveille jamais avec MOINS de couverture qu'au coucher.
#
# PRINCIPE DE SÛRETÉ — le graphe en service n'est JAMAIS supprimé :
# le nouveau se construit dans un conteneur séparé (port 8990) sur son propre
# répertoire, et ne remplace l'ancien qu'une fois qu'il répond /health.
# Conséquence : le routing reste disponible pendant toute la construction.
#
# Source unique europe-latest (~30 Go) découpée par bbox : aucun `osmium
# merge`, donc aucun nœud dupliqué (gotcha GraphHopper 12 — cf. runbook).
set -uo pipefail

DATA_DIR=/opt/graphhopper/data
REPO_DIR="${TRIPTIC_DIR:-/opt/triptic}"
COMPOSE_FILE="$REPO_DIR/deploy/graphhopper/docker-compose.graphhopper.yml"
SRC_PBF="$DATA_DIR/pbf/europe-latest.osm.pbf"
SRC_URL="https://download.geofabrik.de/europe-latest.osm.pbf"
STATUS_FILE=/opt/graphhopper/DERNIERE-NUIT.txt
BUILD_PORT=8990
IMAGE=israelhikingmap/graphhopper:latest

# lon_min,lat_min,lon_max,lat_max — zones CONTIGUËS (un graphe en îlots ne
# sait pas router d'un îlot à l'autre)
BBOX_NORDEST="4.7,47.2,8.35,49.7"
BBOX_INTL="4.5,43.4,11.6,49.8"   # + Jura, Alpes FR, Suisse, Italie du NO

log() { echo "[$(date '+%F %T')] $*"; }

status() { # $1 = état, $2 = détail
  {
    echo "état      : $1"
    echo "détail    : $2"
    echo "horodatage: $(date '+%F %T %Z')"
    echo "couverture: $(cat /opt/graphhopper/COUVERTURE.txt 2>/dev/null || echo 'Alsace (inchangée)')"
  } > "$STATUS_FILE"
}

trap 'log "✗ INTERROMPU"; status ECHEC "script interrompu (signal)"; exit 1' INT TERM

status EN_COURS "démarrage"

# ---------------------------------------------------------------- prérequis
log "=== Prérequis ==="
command -v docker >/dev/null || { log "✗ Docker absent"; status ECHEC "docker absent"; exit 1; }
command -v osmium >/dev/null || { apt-get update -qq && apt-get install -y osmium-tool >/dev/null 2>&1; }
mkdir -p "$DATA_DIR/pbf" "$DATA_DIR/custom_models"

# europe-latest 30 Go + extrait ~4 Go + graphe ~15 Go + marge
avail_gb=$(( $(df --output=avail -k /opt | tail -1 | tr -d ' ') / 1024 / 1024 ))
log "Espace libre sur /opt : ${avail_gb} Go"
if (( avail_gb < 60 )); then
  log "✗ Moins de 60 Go libres — la nuit s'arrêterait en plein import."
  log "  Piste : rm -f $DATA_DIR/pbf/france-latest.osm.pbf (libère ~4,7 Go)"
  status ECHEC "disque insuffisant (${avail_gb} Go < 60 Go)"
  exit 1
fi

free_g=$(free -g | awk '/^Mem:/{print $2}')
swap_g=$(free -g | awk '/^Swap:/{print $2}')
log "RAM ${free_g} Go, swap ${swap_g} Go"
if (( swap_g < 4 )); then
  log "Création d'un swap de 8 Go (filet anti-OOM pendant la préparation CH)"
  fallocate -l 8G /swapfile-gh && chmod 600 /swapfile-gh && mkswap /swapfile-gh >/dev/null && swapon /swapfile-gh \
    || log "  (swap non créé — on continue quand même)"
fi

# ------------------------------------------------------------ téléchargement
log "=== Téléchargement europe-latest (~30 Go, © OpenStreetMap, ODbL) ==="
if [[ -f "$SRC_PBF" ]]; then
  log "  déjà présent ($(du -h "$SRC_PBF" | cut -f1))"
else
  # -C - reprend un transfert interrompu ; --retry couvre les coupures réseau
  if ! curl -fL --retry 10 --retry-delay 15 -C - -o "$SRC_PBF.part" "$SRC_URL"; then
    log "✗ Téléchargement échoué"
    status ECHEC "téléchargement europe-latest"
    exit 1
  fi
  mv "$SRC_PBF.part" "$SRC_PBF"
  log "  téléchargé ($(du -h "$SRC_PBF" | cut -f1))"
fi

# ------------------------------------------------------------------ palier
# Construit un graphe dans un conteneur séparé et ne bascule qu'en cas de
# succès. Renvoie 0 si la nouvelle couverture est en service.
run_stage() { # $1 = nom, $2 = bbox, $3 = heures max
  local name="$1" bbox="$2" max_h="$3"
  local pbf="$DATA_DIR/triptic-$name.osm.pbf"
  local newgraph="$DATA_DIR/graph-cache-$name"
  local cfg="$DATA_DIR/config-$name.yml"

  log "=== Palier $name — découpe osmium (bbox $bbox) ==="
  if ! osmium extract --bbox "$bbox" --set-bounds --strategy complete_ways \
        --overwrite -o "$pbf.tmp" "$SRC_PBF"; then
    log "✗ osmium extract a échoué ($name)"
    return 1
  fi
  mv -f "$pbf.tmp" "$pbf"
  log "  extrait : $(du -h "$pbf" | cut -f1)"

  # Config de build : même profils, mais graphe et source dédiés
  cp "$REPO_DIR/deploy/graphhopper/config.yml" "$cfg"
  cp "$REPO_DIR/deploy/graphhopper/custom_models/"*.json "$DATA_DIR/custom_models/" 2>/dev/null || true
  sed -i "s#^  graph.location:.*#  graph.location: /data/graph-cache-$name#" "$cfg"
  sed -i "s#^  datareader.file:.*#  datareader.file: /data/triptic-$name.osm.pbf#" "$cfg"

  log "=== Palier $name — construction hors ligne (le routing actuel reste UP) ==="
  rm -rf "$newgraph"
  docker rm -f triptic-gh-build >/dev/null 2>&1 || true
  docker run -d --name triptic-gh-build \
    -e JAVA_OPTS="-Xmx4g -Xms1g" \
    -v /opt/graphhopper/data:/data \
    -p "127.0.0.1:$BUILD_PORT:8989" \
    "$IMAGE" \
    --input "/data/triptic-$name.osm.pbf" -c "/data/config-$name.yml" --host 0.0.0.0 >/dev/null

  local deadline=$(( $(date +%s) + max_h * 3600 ))
  while (( $(date +%s) < deadline )); do
    if curl -fsS "http://localhost:$BUILD_PORT/health" >/dev/null 2>&1; then
      log "  ✓ graphe $name construit et sain"
      docker rm -f triptic-gh-build >/dev/null 2>&1 || true

      log "=== Palier $name — bascule ==="
      cp -f "$pbf" "$DATA_DIR/triptic.osm.pbf"
      rm -rf "$DATA_DIR/graph-cache.old"
      [[ -d "$DATA_DIR/graph-cache" ]] && mv "$DATA_DIR/graph-cache" "$DATA_DIR/graph-cache.old"
      mv "$newgraph" "$DATA_DIR/graph-cache"
      docker compose -f "$COMPOSE_FILE" up -d --force-recreate >/dev/null

      for _ in $(seq 1 120); do   # 30 min : rechargement d'un graphe déjà bâti
        if curl -fsS http://localhost:8989/health >/dev/null 2>&1; then
          echo "$name" > /opt/graphhopper/COUVERTURE.txt
          rm -rf "$DATA_DIR/graph-cache.old"
          log "  ✓ EN SERVICE : couverture $name"
          return 0
        fi
        sleep 15
      done

      # Le nouveau graphe ne redémarre pas → on remet l'ancien
      log "✗ Le service ne repart pas — restauration du graphe précédent"
      rm -rf "$DATA_DIR/graph-cache"
      [[ -d "$DATA_DIR/graph-cache.old" ]] && mv "$DATA_DIR/graph-cache.old" "$DATA_DIR/graph-cache"
      docker compose -f "$COMPOSE_FILE" up -d --force-recreate >/dev/null
      return 1
    fi
    # Le conteneur de build est mort (OOM, données corrompues…)
    if ! docker ps --format '{{.Names}}' | grep -q triptic-gh-build; then
      log "✗ Conteneur de build arrêté — extrait des logs :"
      docker logs --tail 30 triptic-gh-build 2>&1 | sed 's/^/    /' || true
      docker rm -f triptic-gh-build >/dev/null 2>&1 || true
      return 1
    fi
    sleep 30
  done

  log "✗ Palier $name non terminé dans les ${max_h} h imparties"
  docker rm -f triptic-gh-build >/dev/null 2>&1 || true
  return 1
}

# ------------------------------------------------------------------- nuit
ACQUIS="Alsace (inchangée)"

if run_stage nordest "$BBOX_NORDEST" 3; then
  ACQUIS="Alsace + Lorraine"
  status EN_COURS "palier 1 acquis ($ACQUIS) — palier Alpes en cours"
else
  log "⚠ Palier Lorraine non abouti — on tente quand même les Alpes"
  status EN_COURS "palier 1 échoué — palier Alpes en cours"
fi

if run_stage intl "$BBOX_INTL" 12; then
  ACQUIS="Alsace + Lorraine + Jura + Alpes FR/CH/IT"
  log "=== ✓ NUIT RÉUSSIE : $ACQUIS ==="
  status SUCCES "$ACQUIS"
  exit 0
fi

log "=== Palier Alpes non abouti — couverture conservée : $ACQUIS ==="
if [[ "$ACQUIS" == "Alsace (inchangée)" ]]; then
  status ECHEC "aucun palier abouti — voir /var/log/triptic-gh-nuit.log"
  exit 1
fi
status PARTIEL "$ACQUIS (Alpes non abouties)"
exit 0
