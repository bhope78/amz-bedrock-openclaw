#!/bin/bash
set -euo pipefail

# Deploy OpenClaw + Career Feedback API to Digital Ocean
# Usage: bash scripts/deploy.sh

DO_HOST="do-server"
REMOTE_DIR="/opt/openclaw"

echo "=== Deploying to Digital Ocean ==="

# Push latest code to GitHub first
echo "[1/4] Pushing to GitHub..."
git add -A && git commit -m "Deploy: update feedback-api and docker-compose" 2>/dev/null || echo "  Nothing to commit"
git push origin main 2>/dev/null || git push origin master 2>/dev/null

# Sync files to DO server
echo "[2/4] Syncing files to DO server..."
ssh "$DO_HOST" "mkdir -p $REMOTE_DIR/feedback-api"
rsync -avz --delete \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.env' \
  ./ "$DO_HOST:$REMOTE_DIR/"

# Build and restart containers
echo "[3/4] Building and restarting containers..."
ssh "$DO_HOST" "cd $REMOTE_DIR && docker-compose build career-api && docker-compose up -d"

# Verify
echo "[4/4] Verifying..."
sleep 5
ssh "$DO_HOST" "curl -s http://localhost:3456/ | python3 -m json.tool 2>/dev/null || echo 'API not ready yet — check docker logs career-api'"

echo ""
echo "=== Deploy complete ==="
echo "Career API: http://165.227.3.113:3456"
echo "OpenClaw:   http://165.227.3.113:3100"
