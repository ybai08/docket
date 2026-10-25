#!/usr/bin/env bash
# Ships the API to the VM and (re)starts it behind Caddy with HTTPS.
# Usage: server/deploy/deploy.sh <ip> <api-host> [site-host]
#   e.g. server/deploy/deploy.sh 144.202.75.20 api.docketapp.tech docketapp.tech
# The optional site host serves the page that share links open (/invite/<token>, /group/<code>).
# Needs: the VM provisioned with provision.sh, and server/.env holding the production DATABASE_URL.
set -euo pipefail

IP=${1:?usage: deploy.sh <ip> <api-host> [site-host]}
HOST=${2:?usage: deploy.sh <ip> <api-host> [site-host]}
SITE=${3:-}
KEY=${DOCKET_SSH_KEY:-$HOME/.ssh/docket_vultr}
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
SSH=(ssh -i "$KEY" -o IdentitiesOnly=yes -o BatchMode=yes "root@$IP")

"${SSH[@]}" mkdir -p /opt/docket/server /opt/docket/src/data /opt/docket/src/lib /var/www/docket

# The server imports shared content and rules from the app's src/, so ship that slice too.
rsync -az --delete -e "ssh -i $KEY -o IdentitiesOnly=yes -o BatchMode=yes" \
  --exclude node_modules --exclude .env --exclude deploy --exclude __pycache__ \
  "$ROOT/server/" "root@$IP:/opt/docket/server/"
rsync -az --delete -e "ssh -i $KEY -o IdentitiesOnly=yes -o BatchMode=yes" \
  "$ROOT/src/data/" "root@$IP:/opt/docket/src/data/"
rsync -az -e "ssh -i $KEY -o IdentitiesOnly=yes -o BatchMode=yes" \
  "$ROOT/src/lib/day.ts" "$ROOT/src/lib/rules.ts" "root@$IP:/opt/docket/src/lib/"

# The site: the hand-off page for share links, plus the launch page at / (promo/site). No --delete, so
# neither copy removes the other's files.
rsync -az --no-owner --no-group -e "ssh -i $KEY -o IdentitiesOnly=yes -o BatchMode=yes" \
  "$ROOT/server/deploy/site/" "root@$IP:/var/www/docket/"
if [ -d "$ROOT/promo/site" ]; then
  rsync -az --no-owner --no-group -e "ssh -i $KEY -o IdentitiesOnly=yes -o BatchMode=yes" \
    "$ROOT/promo/site/" "root@$IP:/var/www/docket/"
fi

# Secrets go straight from server/.env to a root-owned file only the service can read.
grep -E '^(DATABASE_URL|FIREBASE_PROJECT_ID)=' "$ROOT/server/.env" | "${SSH[@]}" \
  "install -m 600 -o docket -g docket /dev/stdin /opt/docket/server/.env && printf 'PORT=8787\nPUBLIC_URL=https://%s\n' '$HOST' >> /opt/docket/server/.env"

"${SSH[@]}" bash -s -- "$HOST" "$SITE" <<'REMOTE'
set -euo pipefail
HOST=$1
SITE=${2:-}
chown -R docket:docket /opt/docket
cd /opt/docket/server
sudo -u docket -H npm ci --no-audit --no-fund --loglevel=error

cat > /etc/systemd/system/docket-api.service <<UNIT
[Unit]
Description=Docket API
After=network-online.target
Wants=network-online.target

[Service]
User=docket
WorkingDirectory=/opt/docket/server
ExecStart=/opt/docket/server/node_modules/.bin/tsx --env-file=.env src/index.ts
Environment=NODE_ENV=production LOG_LEVEL=warn
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

cat > /etc/caddy/Caddyfile <<CADDY
$HOST {
	encode gzip
	reverse_proxy 127.0.0.1:8787
}
CADDY
if [ -n "$SITE" ]; then
cat >> /etc/caddy/Caddyfile <<CADDY

$SITE {
	root * /var/www/docket
	encode gzip
	@share path /invite/* /group/*
	rewrite @share /open.html
	header /media/* Cache-Control "public, max-age=86400"
	file_server
}
CADDY
fi

systemctl daemon-reload
systemctl enable --now docket-api >/dev/null
systemctl restart docket-api
systemctl reload caddy || systemctl restart caddy
# tsx compiles on start, which can take several seconds on the smallest VM.
for i in $(seq 1 30); do curl -fsS http://127.0.0.1:8787/health && echo && exit 0; sleep 1; done
echo "API did not answer on :8787 within 30s" >&2; exit 1
REMOTE
