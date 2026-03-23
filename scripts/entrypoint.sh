#!/bin/bash
set -e

echo "=== OpenClaw Bedrock Setup ==="

# Install system dependencies
apt-get update -qq && apt-get install -y -qq git curl lsof procps > /dev/null 2>&1

# Install openclaw if not already installed
if ! command -v openclaw &> /dev/null; then
  echo "Installing OpenClaw..."
  npm install -g openclaw@latest
fi

echo "OpenClaw version: $(openclaw --version 2>/dev/null || echo 'installed')"

# Apply Bedrock configuration
if [ -f /app/config/bedrock.json5 ]; then
  echo "Applying Bedrock configuration..."
  mkdir -p ~/.openclaw
  cp /app/config/bedrock.json5 ~/.openclaw/config.json5
fi

# Unset AWS_PROFILE to avoid conflict with access keys
unset AWS_PROFILE

# Use persistent volume for state
export OPENCLAW_STATE_DIR=/app/data

echo ""
echo "=== Configuration ==="
echo "Region: ${AWS_REGION:-us-east-1}"
echo "Model: ${BEDROCK_MODEL_ID:-us.anthropic.claude-sonnet-4-6-v1:0}"
echo "Port: 3000"
echo ""

# Configure gateway mode if first time
if [ ! -f /app/data/.configured ]; then
  echo "Running initial configuration..."
  # Set gateway to local mode and configure Bedrock
  openclaw config set gateway.mode local 2>&1 || true
  openclaw config set models.bedrockDiscovery.enabled true 2>&1 || true
  openclaw config set models.bedrockDiscovery.region "${AWS_REGION:-us-east-1}" 2>&1 || true
  openclaw config set agents.defaults.model.primary "amazon-bedrock/${BEDROCK_MODEL_ID:-us.anthropic.claude-sonnet-4-6}" 2>&1 || true
  touch /app/data/.configured
  echo "Configuration complete."
fi

# Start OpenClaw gateway
echo "Starting OpenClaw Gateway..."
exec openclaw gateway --port ${OPENCLAW_PORT:-3000} 2>&1
