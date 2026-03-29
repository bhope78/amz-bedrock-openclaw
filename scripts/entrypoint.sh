#!/bin/bash
set -e

echo "=== OpenClaw Setup ==="

# Install system dependencies
apt-get update -qq && apt-get install -y -qq git curl lsof procps > /dev/null 2>&1

# Install openclaw if not already installed
if ! command -v openclaw &> /dev/null; then
  echo "Installing OpenClaw..."
  npm install -g openclaw@latest
fi

echo "OpenClaw version: $(openclaw --version 2>/dev/null || echo 'installed')"

# Use persistent volume for state
export OPENCLAW_STATE_DIR=/app/data

echo ""
echo "=== Configuration ==="
echo "Port: 3000"
echo ""

# Load Atlas soul and heartbeat into OpenClaw state directory
echo "Loading Atlas agent files..."
if [ -f /app/data/SOUL.md ]; then
  echo "  SOUL.md loaded (Atlas personality + preferences)"
fi
if [ -f /app/data/HEARTBEAT.md ]; then
  echo "  HEARTBEAT.md loaded (autonomous job search loop)"
fi

# Initialize presented-jobs tracking if it doesn't exist
if [ ! -f /app/data/presented-jobs.json ]; then
  echo '{"calcareers":{},"governmentjobs":{}}' > /app/data/presented-jobs.json
  echo "  Initialized presented-jobs.json"
fi

# Initialize active-drafts tracking if it doesn't exist
if [ ! -f /app/data/active-drafts.json ]; then
  echo '{}' > /app/data/active-drafts.json
  echo "  Initialized active-drafts.json"
fi

# Configure gateway mode if first time
if [ ! -f /app/data/.configured ]; then
  echo "Running initial configuration..."
  openclaw config set gateway.mode local 2>&1 || true
  openclaw config set models.bedrockDiscovery.enabled false 2>&1 || true
  touch /app/data/.configured
  echo "Configuration complete."
fi

# Register cron jobs for Atlas proactive loop
echo ""
echo "=== Atlas Cron Jobs ==="

openclaw cron add \
  --name "calcareers-scan" \
  --cron "0 8 * * *" \
  --tz "America/Los_Angeles" \
  --session isolated \
  --message "Run the CalCareers scan loop from HEARTBEAT.md. Search for new jobs matching my preferences in SOUL.md, apply exclusions, score and rank matches, and present any new matches to Bryan on Telegram. If no new matches, stay silent." \
  2>&1 || echo "  calcareers-scan already registered or failed"

openclaw cron add \
  --name "governmentjobs-scan" \
  --cron "30 8 * * *" \
  --tz "America/Los_Angeles" \
  --session isolated \
  --message "Run the GovernmentJobs.com scan loop from HEARTBEAT.md. Search for new IT, procurement, and facilities jobs matching my preferences in SOUL.md, apply exclusions, and present any new matches to Bryan on Telegram. If no new matches, stay silent." \
  2>&1 || echo "  governmentjobs-scan already registered or failed"

openclaw cron add \
  --name "deadline-alerts" \
  --cron "0 7 * * *" \
  --tz "America/Los_Angeles" \
  --session isolated \
  --message "Check Bryan apply list for filing deadlines within the next 3 days. Send Telegram alerts for any upcoming or same-day deadlines. If nothing is due soon, stay silent." \
  2>&1 || echo "  deadline-alerts already registered or failed"

openclaw cron add \
  --name "weekly-digest" \
  --cron "0 9 * * 0" \
  --tz "America/Los_Angeles" \
  --session isolated \
  --message "Generate the weekly job report digest from HEARTBEAT.md. Summarize new matches, pending applications, upcoming deadlines, feedback stats, and top skip reasons. Send to Bryan on Telegram." \
  2>&1 || echo "  weekly-digest already registered or failed"

echo ""
openclaw cron list 2>&1 || echo "  (cron list unavailable)"
echo ""

# Start OpenClaw gateway
echo "Starting OpenClaw Gateway..."
exec openclaw gateway --port ${OPENCLAW_PORT:-3000} 2>&1
