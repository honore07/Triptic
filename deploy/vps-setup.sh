#!/bin/bash
# TRIPTIC — installation/mise à jour sur le VPS Hostinger (Ubuntu 24.04)
# Usage : bash <(curl -fsSL https://raw.githubusercontent.com/honore07/Triptic/main/deploy/vps-setup.sh) [branche]
# Idempotent : relançable sans risque. Ne touche pas à Nginx si un site écoute déjà sur 80
# (TRIPTIC est alors exposé sur le port 8088).
set -euo pipefail

# apt ne doit jamais ouvrir de dialogue interactif (needrestart "Pending kernel
# upgrade" a gelé le terminal navigateur Hostinger le 2026-07-17)
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_SUSPEND=1

# Le script se met à jour lui-même via git pull : bash lisant le fichier au fil
# de l'eau, on s'exécute depuis une copie pour ne pas mélanger ancienne et
# nouvelle version en pleine course.
if [[ "${TRIPTIC_SETUP_COPY:-}" != "1" && -f "${BASH_SOURCE[0]:-}" ]]; then
  TMP_COPY=$(mktemp /tmp/triptic-vps-setup.XXXXXX.sh)
  cp "${BASH_SOURCE[0]}" "$TMP_COPY"
  TRIPTIC_SETUP_COPY=1 exec bash "$TMP_COPY" "$@"
fi

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

echo "=== 4. Base de données (PostgreSQL 16 + PostGIS) ==="
# Installation si absent (Ubuntu 24.04 : postgresql = 16)
if ! command -v psql >/dev/null; then
  apt-get update -qq
  apt-get install -y postgresql postgresql-16-postgis-3
fi
systemctl enable --now postgresql

# Rôle applicatif + DATABASE_URL dans .env (mot de passe via TRIPTIC_DB_PASSWORD,
# sinon généré). Si .env a déjà un DATABASE_URL réel (pas le placeholder), on ne touche à rien.
if grep -qE '^DATABASE_URL=postgresql://' .env && ! grep -q 'triptic_user:password@' .env; then
  echo "DATABASE_URL déjà configuré dans .env"
else
  DB_PASS="${TRIPTIC_DB_PASSWORD:-$(openssl rand -hex 16)}"
  if sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='triptic_user'" | grep -q 1; then
    sudo -u postgres psql -c "ALTER ROLE triptic_user LOGIN PASSWORD '${DB_PASS}'"
  else
    sudo -u postgres psql -c "CREATE ROLE triptic_user LOGIN PASSWORD '${DB_PASS}'"
  fi
  sed -i '/^DATABASE_URL=/d' .env
  echo "DATABASE_URL=postgresql://triptic_user:${DB_PASS}@localhost:5432/triptic_db" >> .env
  echo "DATABASE_URL écrit dans .env"
fi

# Base + migration (idempotente) + droits applicatifs
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='triptic_db'" | grep -q 1 \
  || sudo -u postgres createdb triptic_db
sudo -u postgres psql -d triptic_db -f server/src/db/migrations/0000_init.sql
sudo -u postgres psql -d triptic_db -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO triptic_user;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO triptic_user;"

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
# tsx met plusieurs secondes à booter : on retente jusqu'à 30 s
for i in $(seq 1 15); do
  if curl -fsS http://localhost:3001/health 2>/dev/null; then
    echo " ✓ API OK"
    exit 0
  fi
  sleep 2
done
echo "✗ L'API ne répond pas après 30 s — voir : pm2 logs triptic-api --lines 30 --nostream"
exit 1
