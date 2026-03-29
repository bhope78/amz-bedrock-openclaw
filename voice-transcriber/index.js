/**
 * Voice Transcription API
 *
 * Simple HTTP API that accepts a Telegram file_id,
 * downloads the audio, transcribes it with Groq Whisper,
 * and returns the text. OpenClaw calls this as a tool.
 *
 * POST /transcribe { "file_id": "..." }
 * Returns { "text": "transcribed text" }
 *
 * GET /health
 * Returns { "status": "ok" }
 */

const http = require('http');

const PORT = process.env.VOICE_TRANSCRIBER_PORT || 3458;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

async function downloadTelegramFile(fileId) {
  const resp = await fetch(`${TELEGRAM_API}/getFile?file_id=${fileId}`);
  const data = await resp.json();
  if (!data.ok) throw new Error(`getFile failed: ${data.description}`);

  const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${data.result.file_path}`;
  const fileResp = await fetch(fileUrl);
  if (!fileResp.ok) throw new Error(`Download failed: ${fileResp.status}`);

  return {
    buffer: Buffer.from(await fileResp.arrayBuffer()),
    path: data.result.file_path,
  };
}

async function transcribeWithGroq(audioBuffer, filename) {
  const formData = new FormData();
  formData.append('file', new Blob([audioBuffer]), filename || 'voice.ogg');
  formData.append('model', 'whisper-large-v3-turbo');
  formData.append('language', 'en');

  const resp = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
    body: formData,
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Groq ${resp.status}: ${err}`);
  }

  return (await resp.json()).text;
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ service: 'voice-transcriber', status: 'ok' }));
    return;
  }

  if (req.method === 'POST' && req.url === '/transcribe') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', async () => {
      try {
        const { file_id } = JSON.parse(body);
        if (!file_id) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'file_id required' }));
          return;
        }

        console.log(`Transcribing file_id: ${file_id}`);
        const { buffer, path } = await downloadTelegramFile(file_id);
        console.log(`  Downloaded ${(buffer.length / 1024).toFixed(0)}KB`);

        const ext = path.split('.').pop() || 'ogg';
        const text = await transcribeWithGroq(buffer, `voice.${ext}`);
        console.log(`  Transcribed: "${text.slice(0, 80)}${text.length > 80 ? '...' : ''}"`);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ text }));
      } catch (err) {
        console.error(`  Error: ${err.message}`);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  console.log(`Voice Transcriber API running on port ${PORT}`);
  console.log(`  POST /transcribe { "file_id": "..." }`);
  console.log(`  Groq model: whisper-large-v3-turbo`);
});
