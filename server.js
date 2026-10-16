import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws/translate' });

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    hasKey: Boolean(GEMINI_API_KEY),
    model: 'gemini-3.5-live-translate-preview'
  });
});

// Autonomous AI Learning Analyzer (Background Knowledge & Glossary Extractor)
app.post('/api/learn-auto', async (req, res) => {
  try {
    const { history, currentRules, apiKey } = req.body;
    const key = apiKey || GEMINI_API_KEY;

    if (!key) {
      return res.status(400).json({ error: 'API key required' });
    }

    if (!history || history.length === 0) {
      return res.json({ newRules: [], summary: '' });
    }

    const prompt = `You are an Autonomous AI Linguist & Memory Engine.
Analyze the following bilingual conversation transcript between two users:
${JSON.stringify(history, null, 2)}

Already known memory rules:
${JSON.stringify(currentRules || [])}

Tasks:
1. Identify any key proper nouns, brand names, technical/specialized terms, jargon, slang, or recurring phrases that need consistent, accurate future translation.
2. Summarize the ongoing context / domain of the conversation in 1 concise sentence (e.g. "Real estate contract negotiation with a US client").
3. Output ONLY a valid JSON object matching this schema:
{
  "contextSummary": "1 sentence domain/context summary",
  "extractedRules": [
    { "src": "original phrase/term", "tgt": "ideal translation", "reason": "why this should be remembered" }
  ]
}
Do not include markdown code block quotes. Output pure JSON only.`;

    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' }
      })
    });

    const data = await geminiRes.json();
    console.log('[AutoLearn Response]', JSON.stringify(data));
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    let parsed = {};
    try {
      parsed = JSON.parse(rawText);
    } catch (e) {
      console.error('[AutoLearn] JSON parse error:', e, rawText);
    }

    res.json(parsed);
  } catch (err) {
    console.error('[AutoLearn] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

const GEMINI_WS_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${GEMINI_API_KEY}`;

wss.on('connection', (clientWs, req) => {
  console.log(`[Client] Connected`);
  let geminiWs = null;
  let isGeminiReady = false;
  let chunkCount = 0;

  const sendToClient = (data) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify(data));
    }
  };

  const connectToGemini = (config) => {
    if (geminiWs) {
      try { geminiWs.close(); } catch (e) {}
    }

    const apiKey = config?.apiKey || GEMINI_API_KEY;
    const targetLang = config?.targetLanguageCode || 'en';
    const echoTarget = config?.echoTargetLanguage ?? true;

    if (!apiKey) {
      console.error('[Gemini] No API key available');
      sendToClient({ type: 'error', error: 'API 키가 필요합니다.' });
      return;
    }

    const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;

    console.log(`[Gemini] Connecting... TargetLang: ${targetLang}, Echo: ${echoTarget}`);

    try {
      geminiWs = new WebSocket(geminiUrl);

      geminiWs.on('open', () => {
        console.log('[Gemini] Connected! Sending setup...');

        const setupMessage = {
          setup: {
            model: 'models/gemini-3.5-live-translate-preview',
            generation_config: {
              response_modalities: ['AUDIO', 'TEXT'],
              translation_config: {
                target_language_code: targetLang,
                echo_target_language: echoTarget
              }
            }
          }
        };

        geminiWs.send(JSON.stringify(setupMessage));
      });

      geminiWs.on('message', (data) => {
        try {
          const raw = JSON.parse(data.toString());

          if (raw.setupComplete || raw.setup_complete) {
            isGeminiReady = true;
            console.log('✅ [Gemini] Setup Complete!');
            sendToClient({ type: 'status', status: 'ready' });
            return;
          }

          // Forward all Gemini events directly
          sendToClient(raw);
        } catch (err) {
          console.error('[Gemini] Parse error:', err);
        }
      });

      geminiWs.on('close', (code, reason) => {
        console.log(`[Gemini] Closed (${code}): ${reason.toString()}`);
        isGeminiReady = false;
        sendToClient({ type: 'status', status: 'closed', code });
      });

      geminiWs.on('error', (err) => {
        console.error('[Gemini] Error:', err.message);
        sendToClient({ type: 'error', error: err.message });
      });
    } catch (err) {
      console.error('[Gemini] Setup error:', err);
    }
  };

  clientWs.on('message', (message) => {
    try {
      const parsed = JSON.parse(message.toString());

      if (parsed.type === 'start') {
        connectToGemini(parsed.config);
      } else if (parsed.type === 'audio_chunk') {
        chunkCount++;
        if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
          const payload = {
            realtime_input: {
              media_chunks: [
                {
                  mime_type: 'audio/pcm;rate=16000',
                  data: parsed.data
                }
              ]
            }
          };
          geminiWs.send(JSON.stringify(payload));
        }
      } else if (parsed.type === 'update_config') {
        connectToGemini(parsed.config);
      } else if (parsed.type === 'stop') {
        if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
          geminiWs.close();
        }
      }
    } catch (err) {
      console.error('[Client] Message error:', err);
    }
  });

  clientWs.on('close', () => {
    console.log('[Client] Disconnected');
    if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
      geminiWs.close();
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Live Translation Server running at http://localhost:${PORT}`);
});
