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

console.log('[Init] GEMINI_API_KEY present:', Boolean(GEMINI_API_KEY), 'Length:', GEMINI_API_KEY ? GEMINI_API_KEY.length : 0);

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
  const clientIp = req.socket.remoteAddress;
  console.log(`[Client] Connected from ${clientIp}`);

  let geminiWs = null;
  let isGeminiReady = false;
  let audioChunkCount = 0;

  const sendToClient = (type, data) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({ type, ...data }));
    }
  };

  const connectToGemini = (config) => {
    if (geminiWs) {
      try { geminiWs.close(); } catch (e) {}
    }

    const targetLang = config?.targetLanguageCode || 'en';
    const echoTarget = config?.echoTargetLanguage ?? false;

    console.log(`[Gemini] Connecting... Target: ${targetLang}, Echo: ${echoTarget}`);
    sendToClient('log', { message: `[1/3] Gemini Live Translate (${targetLang}) 서버에 연결 중...` });

    try {
      geminiWs = new WebSocket(GEMINI_WS_URL);

      geminiWs.on('open', () => {
        console.log('[Gemini] WebSocket Opened. Sending setup message...');
        sendToClient('log', { message: `[2/3] 세션 구성(Setup) 전송 중...` });

        const setupMessage = {
          setup: {
            model: 'models/gemini-3.5-live-translate-preview',
            generationConfig: {
              responseModalities: ['AUDIO'],
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              translationConfig: {
                targetLanguageCode: targetLang,
                echoTargetLanguage: echoTarget
              }
            }
          }
        };

        geminiWs.send(JSON.stringify(setupMessage));
      });

      geminiWs.on('message', (data) => {
        try {
          const text = data.toString();
          const response = JSON.parse(text);

          if (!isGeminiReady) {
            isGeminiReady = true;
            console.log('[Gemini] Ready! Setup acknowledged.');
            sendToClient('log', { message: `[3/3] 통역 준비 완료! 마이크로 말씀하세요.` });
            sendToClient('status', { status: 'ready' });
          }

          // Relay response to client
          sendToClient('gemini_response', { payload: response });
        } catch (err) {
          console.error('[Gemini] Parse error:', err);
        }
      });

      geminiWs.on('close', (code, reason) => {
        const reasonStr = reason ? reason.toString() : 'No reason provided';
        console.log(`[Gemini] Closed. Code: ${code}, Reason: ${reasonStr}`);
        isGeminiReady = false;
        sendToClient('status', { status: 'closed', code, reason: reasonStr });
        sendToClient('log', { message: `Gemini 연결 종료 (${code}: ${reasonStr})` });
      });

      geminiWs.on('error', (err) => {
        console.error('[Gemini] Error:', err.message);
        sendToClient('error', { error: err.message });
        sendToClient('log', { message: `Gemini 통신 오류: ${err.message}` });
      });
    } catch (err) {
      console.error('[Gemini] Connection setup exception:', err);
      sendToClient('error', { error: err.message });
    }
  };

  clientWs.on('message', (message) => {
    try {
      const parsed = JSON.parse(message.toString());

      if (parsed.type === 'start') {
        connectToGemini(parsed.config);
      } else if (parsed.type === 'audio_chunk') {
        audioChunkCount++;
        if (audioChunkCount % 20 === 0) {
          console.log(`[Audio] Streaming PCM chunks... Total sent: ${audioChunkCount}`);
        }
        if (geminiWs && geminiWs.readyState === WebSocket.OPEN) {
          const realtimePayload = {
            realtimeInput: {
              mediaChunks: [
                {
                  mimeType: 'audio/pcm;rate=16000',
                  data: parsed.data
                }
              ]
            }
          };
          geminiWs.send(JSON.stringify(realtimePayload));
        }
      } else if (parsed.type === 'update_config') {
        connectToGemini(parsed.config);
      } else if (parsed.type === 'stop') {
        console.log('[Client] Stop streaming requested');
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
  console.log(`=================================================`);
  console.log(`🚀 Live Translation Server running at:`);
  console.log(`   👉 Local:   http://localhost:${PORT}`);
  console.log(`   👉 Network: http://192.168.219.102:${PORT}`);
  console.log(`=================================================`);
});
