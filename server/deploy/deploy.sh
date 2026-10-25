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
  --exclude node_modules --exclude .env --exclude deploy \
  "$ROOT/server/" "root@$IP:/opt/docket/server/"
rsync -az --delete -e "ssh -i $KEY -o IdentitiesOnly=yes -o BatchMode=yes" \
  "$ROOT/src/data/" "root@$IP:/opt/docket/src/data/"
rsync -az -e "ssh -i $KEY -o IdentitiesOnly=yes -o BatchMode=yes" \
  "$ROOT/src/lib/day.ts" "$ROOT/src/lib/rules.ts" "root@$IP:/opt/docket/src/lib/"

rsync -az --delete --no-owner --no-group -e "ssh -i $KEY -o IdentitiesOnly=yes -o BatchMode=yes" \
  "$ROOT/server/deploy/site/" "root@$IP:/var/www/docket/"

# Secrets go straight from server/.env to a root-owned file only the service can read.
grep -E '^(DATABASE_URL|FIREBASE_PROJECT_ID)=' "$ROOT/server/.env" | "${SSH[@]}" \
  "install -m 600 -o docket -g docket /dev/stdin /opt/docket/server/.env && echo 'PORT=8787' >> /opt/docket/server/.env"

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
	rewrite * /open.html
	file_server
}
CADDY
fi

systemctl daemon-reload
systemctl enable --now docket-api >/dev/null
systemctl restart docket-api
systemctl reload caddy || systemctl restart caddy
sleep 3
curl -fsS http://127.0.0.1:8787/health && echo
REMOTE
