#!/usr/bin/env bash
# Publishes the HackTX launch page (promo/site) as the docketapp.tech homepage.
# Touches only the static site: /var/www/docket and the docketapp.tech block in Caddy. The API is not
# restarted. Share links (/invite/*, /group/*) keep opening open.html, which server/deploy ships.
# Usage: promo/deploy-site.sh [ip] [site-host]
set -euo pipefail

IP=${1:-144.202.75.20}
SITE=${2:-docketapp.tech}
KEY=${DOCKET_SSH_KEY:-$HOME/.ssh/docket_vultr}
HERE=$(cd "$(dirname "$0")" && pwd)
SSH=(ssh -i "$KEY" -o IdentitiesOnly=yes -o BatchMode=yes "root@$IP")

# No --delete: open.html, shipped by server/deploy/deploy.sh, lives in the same folder.
rsync -az --no-owner --no-group -e "ssh -i $KEY -o IdentitiesOnly=yes -o BatchMode=yes" \
  "$HERE/site/" "root@$IP:/var/www/docket/"

"${SSH[@]}" bash -s -- "$SITE" <<'REMOTE'
set -euo pipefail
SITE=$1
F=/etc/caddy/Caddyfile
cp "$F" "$F.bak"
# Replace only the site block; the API block is kept as it is.
python3 - "$F" "$SITE" <<'PY'
import re, sys
path, site = sys.argv[1], sys.argv[2]
text = open(path).read()
block = f"""{site} {{
	root * /var/www/docket
	encode gzip
	@share path /invite/* /group/*
	rewrite @share /open.html
	header /media/* Cache-Control "public, max-age=86400"
	file_server
}}
"""
pattern = re.compile(r"^" + re.escape(site) + r" \{\n.*?^\}\n?", re.M | re.S)
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

# Checks: the homepage, a seekable video, and a share link that still opens the app page.
curl -fsS "https://$SITE/" | grep -q "Do you know how" && echo "homepage: launch page"
curl -fsSI "https://$SITE/media/docket-demo.mp4" | grep -qi "accept-ranges: bytes" && echo "video: served, seekable"
curl -fsS "https://$SITE/invite/abc123" | grep -q "Open this in Docket" && echo "share links: still open.html"
