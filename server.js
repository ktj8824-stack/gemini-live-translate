import express from 'express';
import http from 'http';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;
// Gemini API 키는 오직 서버(.env)에만 둡니다. 클라이언트에는 절대 전달하지 않습니다.
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const LIVE_MODEL = 'models/gemini-3.5-live-translate-preview';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// 허용할 웹 출처 (쉼표 구분). iOS 앱(WKWebView, file://)은 Origin이 "null"로 옵니다.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
const ALLOW_FILE_ORIGIN = process.env.ALLOW_FILE_ORIGIN !== 'false';

if (!GEMINI_API_KEY) {
  console.warn('⚠️  GEMINI_API_KEY가 .env에 설정되지 않았습니다. 통역 토큰 발급이 실패합니다.');
}

// ---------------------------------------------------------------------------
// CORS (iOS 앱/다른 도메인에서 /api 호출 허용)
// ---------------------------------------------------------------------------
app.use('/api', (req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    const allowed =
      ALLOWED_ORIGINS.includes(origin) ||
      (origin === 'null' && ALLOW_FILE_ORIGIN);
    if (allowed) {
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Vary', 'Origin');
      res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type');
    }
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ---------------------------------------------------------------------------
// 간단한 IP별 요청 제한 (토큰 남발로 인한 요금 폭탄 방지)
// ---------------------------------------------------------------------------
function rateLimit({ windowMs, max }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of hits) {
      if (now - entry.start > windowMs) hits.delete(ip);
    }
  }, windowMs).unref();

  return (req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    let entry = hits.get(ip);
    if (!entry || now - entry.start > windowMs) {
      entry = { start: now, count: 0 };
      hits.set(ip, entry);
    }
    entry.count++;
    if (entry.count > max) {
      return res.status(429).json({ error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' });
    }
    next();
  };
}

if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY);

app.use(express.static(path.join(__dirname, 'public'), {
  etag: false,
  maxAge: 0,
  setHeaders: (res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
}));
app.use(express.json({ limit: '200kb' }));

app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    hasKey: Boolean(GEMINI_API_KEY),
    model: LIVE_MODEL
  });
});

// ---------------------------------------------------------------------------
// 실시간 통역용 임시 토큰 발급 (Ephemeral Token)
// - 1회용, 새 세션은 1분 안에 시작해야 하며, 세션은 최대 30분 유효
// - 모델은 서버에서 고정(fieldMask: model) → 토큰을 탈취해도 다른 모델 사용 불가
// ---------------------------------------------------------------------------
app.post('/api/live-token', rateLimit({ windowMs: 60_000, max: 20 }), async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: '서버에 Gemini API 키가 설정되지 않았습니다.' });
  }

  try {
    const now = Date.now();
    const body = {
      expireTime: new Date(now + 30 * 60_000).toISOString(),
      newSessionExpireTime: new Date(now + 60_000).toISOString(),
      bidiGenerateContentSetup: { model: LIVE_MODEL },
      fieldMask: 'model'
    };

    const geminiRes = await fetch(`${GEMINI_BASE}/auth_tokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY
      },
      body: JSON.stringify(body)
    });

    const data = await geminiRes.json().catch(() => ({}));
    if (!geminiRes.ok || !data.name) {
      console.error('[LiveToken] 발급 실패:', geminiRes.status, JSON.stringify(data));
      return res.status(502).json({ error: '통역 토큰 발급에 실패했습니다.', status: geminiRes.status });
    }

    res.json({ token: data.name, model: LIVE_MODEL, expireTime: body.expireTime });
  } catch (err) {
    console.error('[LiveToken] Error:', err);
    res.status(500).json({ error: '통역 토큰 발급 중 오류가 발생했습니다.' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Live Translation Server running at http://localhost:${PORT}`);
});
