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

    const targetLang = config?.targetLanguageCode || 'en';
    const echoTarget = config?.echoTargetLanguage ?? true;

    console.log(`[Gemini] Connecting... TargetLang: ${targetLang}, Echo: ${echoTarget}`);

    try {
      geminiWs = new WebSocket(GEMINI_WS_URL);

      geminiWs.on('open', () => {
        console.log('[Gemini] Connected! Sending setup...');

        const setupMessage = {
          setup: {
            model: 'models/gemini-3.5-live-translate-preview',
            generation_config: {
              response_modalities: ['AUDIO'],
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
