#!/bin/bash
# TRIPTIC — installation OpenTopoData sur le VPS (roadmap 5.3)
# Usage : bash deploy/opentopodata-setup.sh          (depuis /opt/triptic)
# Idempotent. Télécharge les tuiles Copernicus DEM GLO-30 du périmètre pilote
# (lat 43-50°N, lon 4-14°E ≈ 70 tuiles ≈ 3 Go) depuis l'AWS Open Data bucket.
# Attribution obligatoire : « © Union européenne, Copernicus DEM GLO-30 ».
set -euo pipefail

DATA_DIR=/opt/opentopodata
REPO_DIR="${TRIPTIC_DIR:-/opt/triptic}"
COMPOSE_FILE="$REPO_DIR/deploy/opentopodata/docker-compose.opentopodata.yml"
BUCKET="https://copernicus-dem-30m.s3.amazonaws.com"

mkdir -p "$DATA_DIR/data/cop30"
cp "$REPO_DIR/deploy/opentopodata/config.yaml" "$DATA_DIR/config.yaml"

echo "=== 1. Téléchargement des tuiles Copernicus GLO-30 (périmètre pilote) ==="
for lat in $(seq 43 49); do
  for lon in $(seq 4 13); do
    lon_pad=$(printf "%03d" "$lon")
    name="Copernicus_DSM_COG_10_N${lat}_00_E${lon_pad}_00_DEM"
    target="$DATA_DIR/data/cop30/${name}.tif"
    if [[ -f "$target" ]]; then continue; fi
    url="$BUCKET/${name}/${name}.tif"
    echo "  → N${lat} E${lon_pad}"
    curl -fsSL -o "$target.tmp" "$url" && mv "$target.tmp" "$target" || {
      rm -f "$target.tmp"
      echo "    (absente — tuile mer/hors couverture, ok)"
    }
  done
done

echo "=== 2. Renommage attendu par OpenTopoData (NxxEyyy.tif) ==="
# OpenTopoData (filename_epsg 4326) attend des noms de type N48E007.tif
cd "$DATA_DIR/data/cop30"
for f in Copernicus_DSM_COG_10_N*_00_E*_00_DEM.tif; do
  [[ -e "$f" ]] || continue
  lat=$(echo "$f" | sed -E 's/.*N([0-9]+)_00_E.*/\1/')
  lon=$(echo "$f" | sed -E 's/.*_E([0-9]+)_00_DEM.*/\1/')
  mv "$f" "N${lat}E${lon}.tif"
done

echo "=== 3. Lancement ==="
docker compose -f "$COMPOSE_FILE" up -d

echo "=== 4. Vérification ==="
sleep 5
curl -fsS "http://localhost:5000/v1/cop30?locations=48.04,7.01" && echo " ✓ OpenTopoData OK"
echo "Ajouter OPENTOPODATA_URL=http://localhost:5000 dans /opt/triptic/.env puis pm2 reload triptic-api"
