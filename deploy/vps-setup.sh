#!/bin/bash
# TRIPTIC — installation/mise à jour sur le VPS Hostinger (Ubuntu 24.04)
# Usage : bash <(curl -fsSL https://raw.githubusercontent.com/honore07/Triptic/main/deploy/vps-setup.sh) [branche]
# Idempotent : relançable sans risque. Ne touche pas à Nginx si un site écoute déjà sur 80
# (TRIPTIC est alors exposé sur le port 8088).
set -euo pipefail

BRANCH="${1:-main}"
DIR=/opt/triptic

echo "=== 1. Prérequis (Node 22, pnpm, PM2) ==="
if ! command -v node >/dev/null || [[ "$(node -v | cut -c2-3)" -lt 22 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
command -v pnpm >/dev/null || npm install -g pnpm
command -v pm2 >/dev/null || npm install -g pm2

echo "=== 2. Code ==="
if [[ -d $DIR/.git ]]; then
  git -C $DIR fetch origin && git -C $DIR checkout "$BRANCH" && git -C $DIR pull origin "$BRANCH"
else
  git clone --branch "$BRANCH" https://github.com/honore07/Triptic.git $DIR
fi
cd $DIR

echo "=== 3. Environnement ==="
if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "⚠️  Renseigner les clés dans $DIR/.env (DEEPSEEK_API_KEY ou ANTHROPIC_API_KEY) puis relancer."
  exit 1
fi

echo "=== 4. Base de données (PostGIS si PostgreSQL présent) ==="
if command -v psql >/dev/null && sudo -u postgres psql -c '\q' 2>/dev/null; then
  sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='triptic_db'" | grep -q 1 \
    || sudo -u postgres createdb triptic_db
  sudo -u postgres psql -d triptic_db -f server/src/db/migrations/0000_init.sql
else
  echo "PostgreSQL absent → l'API utilisera le store in-memory (DATABASE_URL vide dans .env)."
fi

echo "=== 5. Build ==="
pnpm install --frozen-lockfile
pnpm build

echo "=== 6. PM2 ==="
pm2 startOrReload ecosystem.config.cjs --env production
pm2 save

echo "=== 7. Nginx ==="
if command -v nginx >/dev/null; then
  LISTEN_PORT=80
  # Un site écoute déjà sur 80 ? On n'y touche pas : TRIPTIC prend le 8088.
  if ss -tln | grep -q ':80 '; then LISTEN_PORT=8088; fi
  sed "s/listen 80;/listen ${LISTEN_PORT};/; s/server_name .*/server_name _;/; s#root .*#root ${DIR}/apps/web/dist;#" \
    deploy/nginx-triptic.conf > /etc/nginx/sites-available/triptic
  ln -sf /etc/nginx/sites-available/triptic /etc/nginx/sites-enabled/triptic
  nginx -t && systemctl reload nginx
  echo "TRIPTIC servi sur le port ${LISTEN_PORT}"
fi

echo "=== 8. Health check ==="
sleep 2
curl -fsS http://localhost:3001/health && echo " ✓ API OK"
