#!/usr/bin/env bash
# deploy.sh — pull latest code and rebuild the frontend
#
# Usage:
#   bash deploy.sh dev    → deploy to dev server   (default)
#   bash deploy.sh prod   → deploy to prod server
#
set -euo pipefail

# ── Config ─────────────────────────────────────────────────────────────────
DEV_DIR="/var/www/dev-pm.sauramandala.org"
DEV_BRANCH="master"

PROD_DIR="/var/www/project.sauramandala.org"
PROD_BRANCH="master"
# ───────────────────────────────────────────────────────────────────────────

ENV="${1:-dev}"

case "$ENV" in
  dev)
    APP_DIR="$DEV_DIR"
    BRANCH="$DEV_BRANCH"
    ;;
  prod)
    APP_DIR="$PROD_DIR"
    BRANCH="$PROD_BRANCH"
    ;;
  *)
    echo "Usage: bash deploy.sh [dev|prod]"
    exit 1
    ;;
esac

log() { echo "[$(date '+%H:%M:%S')] $*"; }

log "=== Deploy [$ENV] started ==="
log "Dir: $APP_DIR  Branch: $BRANCH"

cd "$APP_DIR"

# ── 1. Pull latest ─────────────────────────────────────────────────────────
log "Git pull origin/$BRANCH…"
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"

# ── 2. Install deps (skips if nothing changed in package-lock.json) ────────
log "npm ci…"
npm ci --prefer-offline

# ── 3. Bump service-worker cache version so browsers pick up new assets ────
BUILD_ID="erpnext-pm-$(git rev-parse --short HEAD)"
sed -i "s/const CACHE_NAME = '[^']*'/const CACHE_NAME = '$BUILD_ID'/" public/sw.js
log "SW cache version: $BUILD_ID"

# ── 4. Build ───────────────────────────────────────────────────────────────
log "Building…"
npm run build:prod

# ── 5. Reload nginx ────────────────────────────────────────────────────────
log "Reloading nginx…"
sudo systemctl reload nginx

log "=== Deploy [$ENV] done ==="
