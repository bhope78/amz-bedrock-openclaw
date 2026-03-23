#!/bin/bash
# Test Bedrock connectivity with Claude

echo "Testing Amazon Bedrock connectivity..."
echo ""

# Check AWS credentials
echo "1. Checking AWS credentials..."
aws sts get-caller-identity --region ${AWS_REGION:-us-east-1} 2>&1
if [ $? -ne 0 ]; then
  echo "❌ AWS credentials not valid"
  exit 1
fi
echo "✅ AWS credentials OK"
echo ""

# Check Bedrock model access
echo "2. Checking Bedrock model access..."
MODEL_ID="${BEDROCK_MODEL_ID:-us.anthropic.claude-sonnet-4-6-v1:0}"
echo "   Model: $MODEL_ID"

aws bedrock-runtime invoke-model \
  --region ${AWS_REGION:-us-east-1} \
  --model-id "$MODEL_ID" \
  --content-type "application/json" \
  --accept "application/json" \
  --body '{"anthropic_version":"bedrock-2023-05-31","max_tokens":100,"messages":[{"role":"user","content":"Say hello in one sentence."}]}' \
  /tmp/bedrock-test-response.json 2>&1

if [ $? -eq 0 ]; then
  echo "✅ Bedrock response received:"
  cat /tmp/bedrock-test-response.json | python3 -m json.tool 2>/dev/null || cat /tmp/bedrock-test-response.json
  rm -f /tmp/bedrock-test-response.json
else
  echo "❌ Bedrock invocation failed"
  echo "   Make sure the model is enabled in AWS Console → Bedrock → Model access"
  exit 1
fi

echo ""
echo "✅ All checks passed — Bedrock is ready for OpenClaw"
