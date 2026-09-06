#!/bin/bash
# Run on the Pi: pulls main and rebuilds the container.
set -euo pipefail
cd /var/www/steamgram.app
git pull --ff-only
docker compose up -d --build
docker image prune -f >/dev/null
docker compose ps
