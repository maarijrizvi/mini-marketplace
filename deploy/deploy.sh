#!/usr/bin/env bash
# Deploy Mini Marketplace to a fresh Ubuntu droplet over SSH.
#
#   deploy/deploy.sh root@203.0.113.10
#
# First run: installs Docker, copies the code, writes a .env with generated secrets (kept on the server),
# then builds and starts everything. Later runs: copy the code and rebuild. Data lives in Docker volumes, so it
# survives redeploys.
set -euo pipefail

TARGET="${1:?usage: deploy/deploy.sh user@host}"
HOST="${TARGET#*@}"
APP_DIR="/opt/mini-marketplace"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "→ Preparing $TARGET"
ssh "$TARGET" bash -s <<'REMOTE'
set -euo pipefail
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
mkdir -p /opt/mini-marketplace
if command -v ufw >/dev/null; then
  ufw allow OpenSSH >/dev/null; ufw allow 80/tcp >/dev/null; ufw --force enable >/dev/null
fi
REMOTE

echo "→ Copying code"
rsync -az --delete \
  --exclude '.git' --exclude '.env' --exclude 'node_modules' --exclude '.next' --exclude '.venv' \
  --exclude '__pycache__' --exclude 'media' --exclude '.pytest_cache' --exclude '.ruff_cache' \
  "$ROOT/" "$TARGET:$APP_DIR/"

echo "→ Configuring and starting"
ssh "$TARGET" APP_DIR="$APP_DIR" HOST="$HOST" bash -s <<'REMOTE'
set -euo pipefail
cd "$APP_DIR"
if [ ! -f .env ]; then
  secret() { openssl rand -hex 32; }
  admin_pw="$(openssl rand -base64 12 | tr -d '/+=')A1"
  mail_pw="$(openssl rand -base64 9 | tr -d '/+=')"
  cat > .env <<EOF
PUBLIC_URL=http://$HOST
HTTP_PORT=80
POSTGRES_PASSWORD=$(secret)
JWT_SECRET=$(secret)
PAYMENT_WEBHOOK_SECRET=$(secret)
LEOPARDS_WEBHOOK_SECRET=$(secret)
COOKIE_SECURE=false
SANDBOX_ENABLED=true
MAILPIT_UI_AUTH=mail:$mail_pw
SEED_ADMIN_EMAIL=admin@mini-marketplace.local
SEED_ADMIN_PASSWORD=$admin_pw
SEED_DEMO=true
SEED_DEMO_PASSWORD=Demo1234
EOF
  chmod 600 .env
  echo "Generated .env (secrets stay on the server):"
  echo "  admin login:  admin@mini-marketplace.local / $admin_pw"
  echo "  mailpit:      mail / $mail_pw"
fi
docker compose up -d --build --remove-orphans
docker image prune -f >/dev/null
docker compose ps
REMOTE

echo "→ Done: http://$HOST  (API docs: http://$HOST/api/docs, inbox: http://$HOST/mailpit/)"
