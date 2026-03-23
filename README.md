# OpenClaw on Amazon Bedrock (DigitalOcean)

Self-hosted AI assistant powered by Anthropic Claude via Amazon Bedrock, running on DigitalOcean.

## Architecture

```
┌──────────────┐     ┌────────────────────┐     ┌──────────────────┐
│   Channels   │────▶│   DigitalOcean     │────▶│  Amazon Bedrock  │
│  (WhatsApp,  │     │   Droplet          │     │  (Claude Sonnet  │
│  Telegram,   │◀────│   OpenClaw :3100   │◀────│   4.6)           │
│  Discord...) │     └────────────────────┘     └──────────────────┘
```

## Setup

### 1. Enable Claude in Bedrock

AWS Console → Amazon Bedrock → Model access → Enable Anthropic Claude models.

### 2. Deploy

```bash
ssh root@<your-droplet-ip>
cd /opt/openclaw
cp .env.example .env
# Edit .env with your AWS credentials
docker-compose up -d
```

### 3. Access

OpenClaw web UI at `http://<droplet-ip>:3100`

## Configuration

See `.env.example` for all environment variables.
See `config/bedrock.json5` for model configuration.

## IAM Policy

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream",
        "bedrock:ListFoundationModels"
      ],
      "Resource": "*"
    }
  ]
}
```

## Testing

```bash
./scripts/test-bedrock.sh
```
