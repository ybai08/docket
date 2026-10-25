#!/usr/bin/env bash
# One-time setup for a fresh Ubuntu 24.04 VM: Node 22, Caddy (HTTPS), firewall, swap, service user.
# Run as root: ssh root@<ip> 'bash -s' < server/deploy/provision.sh
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

NODE_VERSION=v22.20.0

apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https ufw rsync

# 1 GB swap so npm installs don't run out of memory on the smallest plan.
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Node from nodejs.org, checked against the published SHA-256 list.
if ! node --version 2>/dev/null | grep -q "^${NODE_VERSION}$"; then
  cd /tmp
  curl -fsSLO "https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-linux-x64.tar.xz"
  curl -fsSLO "https://nodejs.org/dist/${NODE_VERSION}/SHASUMS256.txt"
  grep " node-${NODE_VERSION}-linux-x64.tar.xz\$" SHASUMS256.txt | sha256sum -c -
  tar -xJf "node-${NODE_VERSION}-linux-x64.tar.xz" -C /usr/local --strip-components=1
  rm -f "node-${NODE_VERSION}-linux-x64.tar.xz" SHASUMS256.txt
fi

# Caddy from its official apt repository (https://caddyserver.com/docs/install#debian-ubuntu-raspbian).
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy
fi

# Only SSH and the web ports are open; the API itself listens on localhost:8787 behind Caddy.
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

id docket >/dev/null 2>&1 || useradd --system --create-home --home-dir /opt/docket --shell /usr/sbin/nologin docket

node --version
caddy version
ufw status | head -5
