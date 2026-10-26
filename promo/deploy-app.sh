#!/usr/bin/env bash
# Publishes the playable web build of the app at https://app.docketapp.tech.
# On desktop the build's index.html sends visitors to demo.html, which shows the app inside an iPhone
# frame; on a phone it runs full-screen. It is served from the root of its own subdomain, so it needs
# no base-path setting. Touches only /var/www/docket-app and the app.docketapp.tech block in Caddy;
# the API is not restarted.
# Needs: an A record for the app host pointing at the VM, and the host in Firebase's authorized domains.
# Usage: promo/deploy-app.sh [ip] [app-host]
set -euo pipefail

IP=${1:-144.202.75.20}
APP=${2:-app.docketapp.tech}
KEY=${DOCKET_SSH_KEY:-$HOME/.ssh/docket_vultr}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
SSH=(ssh -i "$KEY" -o IdentitiesOnly=yes -o BatchMode=yes "root@$IP")

# Caddy fetches an HTTPS certificate on reload, which fails until DNS points here.
resolved=$(dig +short "$APP" @1.1.1.1 | tail -n1)  # public DNS; the local cache can hold an old "no such host"
if [ "$resolved" != "$IP" ]; then
  echo "$APP resolves to '${resolved:-nothing}', not $IP. Add an A record for it first." >&2
  exit 1
fi

OUT=$(mktemp -d)
trap 'rm -rf "$OUT"' EXIT
(cd "$ROOT" && npx expo export -p web --output-dir "$OUT" >/dev/null)
test -f "$OUT/index.html" && test -f "$OUT/demo.html"

"${SSH[@]}" mkdir -p /var/www/docket-app
rsync -az --delete --no-owner --no-group -e "ssh -i $KEY -o IdentitiesOnly=yes -o BatchMode=yes" \
  "$OUT/" "root@$IP:/var/www/docket-app/"

"${SSH[@]}" bash -s -- "$APP" <<'REMOTE'
set -euo pipefail
APP=$1
F=/etc/caddy/Caddyfile
cp "$F" "$F.bak"
python3 - "$F" "$APP" <<'PY'
import re, sys
path, host = sys.argv[1], sys.argv[2]
text = open(path).read()
block = f"""{host} {{
	root * /var/www/docket-app
	encode gzip
	@hashed path /_expo/* /assets/*
	header @hashed Cache-Control "public, max-age=31536000, immutable"
	header /index.html Cache-Control "no-cache"
	try_files {{path}} /index.html
	file_server
}}
"""
pattern = re.compile(r"^" + re.escape(host) + r" \{\n.*?^\}\n?", re.M | re.S)
text = pattern.sub(block, text) if pattern.search(text) else text.rstrip() + "\n\n" + block
open(path, "w").write(text)
PY
if caddy validate --config "$F" --adapter caddyfile >/dev/null 2>&1; then
  systemctl reload caddy
else
  cp "$F.bak" "$F"
  echo "Caddyfile did not validate; restored the previous one" >&2
  exit 1
fi
REMOTE

# Checks: the app shell, the desktop frame page, and a deep link that falls back to the app shell.
for i in $(seq 1 20); do curl -fsS "https://$APP/" >/dev/null 2>&1 && break; sleep 3; done
curl -fsS "https://$APP/" | grep 'id="root"' >/dev/null && echo "app: serves the web build"
curl -fsS "https://$APP/demo.html" | grep 'id="device"' >/dev/null && echo "desktop: iPhone frame page"
curl -fsS "https://$APP/friends" | grep 'id="root"' >/dev/null && echo "deep links: fall back to the app"
