#!/bin/bash
# Run on the server: syncs the checkout to origin/main and rebuilds the container.
# Local edits in /var/www/steamgram.app are discarded; the repo is the source of truth.
set -euo pipefail
cd /var/www/steamgram.app
git fetch origin
git reset --hard origin/main
docker compose up -d --build
docker image prune -f >/dev/null
# nginx caches static files (see deploy/nginx.*.conf); drop them so the new build shows at once.
if [ -d /var/cache/nginx/steamgram ]; then sudo find /var/cache/nginx/steamgram -type f -delete; fi
docker compose ps
