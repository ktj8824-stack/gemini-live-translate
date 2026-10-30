"""
번역톡 시뮬레이션 테스트
- public/ 정적 서빙 + 가짜 /api/live-token
- 페이지 안에 가짜 Gemini Live WebSocket 서버를 심어 응답
- 크로미움 가짜 마이크(삐 소리)로 실제 오디오 파이프라인 구동

실행: pip install playwright && playwright install chromium
      python3 tests/sim_test.py public
"""
import os, base64, json, math, struct, sys, threading, time
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from playwright.sync_api import sync_playwright

PUBLIC = sys.argv[1]
PORT = 3456
token_calls = {"n": 0, "fail_next": 0}


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_POST(self):
        if self.path == "/api/live-token":
            token_calls["n"] += 1
            if token_calls["fail_next"] > 0:
                token_calls["fail_next"] -= 1
                body, code = b'{"error":"rate"}', 429
            else:
                body, code = json.dumps({"token": f"auth_tokens/fake{token_calls['n']}"}).encode(), 200
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(body)
        elif self.path == "/api/learn-auto":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"contextSummary":"","extractedRules":[]}')
        else:
            self.send_response(404)
            self.end_headers()


httpd = ThreadingHTTPServer(("127.0.0.1", PORT), partial(Handler, directory=PUBLIC))
threading.Thread(target=httpd.serve_forever, daemon=True).start()


MOCK_JS = r"""
(() => {
  const RealWS = window.WebSocket;
  const pcm = new Int16Array(2400);
  for (let i = 0; i < pcm.length; i++) pcm[i] = Math.round(8000 * Math.sin(2 * Math.PI * 440 * i / 24000));
  let bin = ''; new Uint8Array(pcm.buffer).forEach(b => bin += String.fromCharCode(b));
  const AUDIO = btoa(bin);
  const mock = window.__mock = { setupDelay: 150, conns: [] };

  class FakeWS {
    constructor(url) {
      if (!url.startsWith('wss://generativelanguage')) return new RealWS(url);
      this.url = url; this.readyState = 0;
      this.rec = { url, setups: [], audio: 0, end: 0, closedByClient: false, target: null, ws: this };
      mock.conns.push(this.rec);
      setTimeout(() => { this.readyState = 1; this.onopen && this.onopen({}); }, 30);
    }
    _emit(obj) { setTimeout(() => { if (this.readyState === 1 && this.onmessage) this.onmessage({ data: JSON.stringify(obj) }); }, 40); }
    send(str) {
      const d = JSON.parse(str), r = this.rec;
      if (d.setup) {
        r.setups.push(d.setup); r.target = d.setup.generationConfig.translationConfig.targetLanguageCode;
        setTimeout(() => this._emit({ setupComplete: {} }), mock.setupDelay); return;
      }
      const ri = d.realtimeInput || {};
      if (ri.audio) {
        r.audio++;
        if (r.audio % 10 === 0) {
          this._emit({ serverContent: { inputTranscription: { text: '안녕 ' } } });
          this._emit({ serverContent: { outputTranscription: { text: 'hello ' }, modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: AUDIO } }] } } });
        }
      }
      if (ri.audioStreamEnd) {
        r.end++;
        this._emit({ serverContent: { outputTranscription: { text: 'done.' }, modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: AUDIO } }] } } });
        this._emit({ serverContent: { turnComplete: true } });
      }
    }
    close() { if (this.readyState === 3) return; this.rec.closedByClient = true; this._serverClose(1000, 'client close'); }
    _serverClose(code, reason) {
      if (this.readyState === 3) return;
      this.readyState = 3;
      setTimeout(() => this.onclose && this.onclose({ code, reason }), 10);
    }
  }
  FakeWS.CONNECTING = 0; FakeWS.OPEN = 1; FakeWS.CLOSING = 2; FakeWS.CLOSED = 3;
  window.WebSocket = FakeWS;
})();
"""


def nconns():
    return page.evaluate("window.__mock.conns.length")


def conn(i):
    return page.evaluate(f"(() => {{ const c = window.__mock.conns.at({i}); return c && {{audio: c.audio, end: c.end, setups: c.setups.length, closed: c.closedByClient, target: c.target, setup: c.setups[0]}}; }})()")


def all_conns():
    return page.evaluate("window.__mock.conns.map(c => ({audio: c.audio, end: c.end, setups: c.setups.length, target: c.target}))")


def server_close(i, code, reason=""):
    page.evaluate(f"window.__mock.conns.at({i}).ws._serverClose({code}, {json.dumps(reason)})")


def ready_count():
    return page.evaluate("[...window.app.sessions.values()].filter(s => s.ready).length")


results = []


def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("✅" if cond else "❌"), name, detail)


def wait_until(fn, timeout=8.0):
    t = time.time()
    while time.time() - t < timeout:
        if fn():
            return True
        time.sleep(0.05)
    return False


with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path=os.environ.get("CHROME_PATH") or None,
        args=["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
              "--autoplay-policy=no-user-gesture-required"])
    ctx = browser.new_context(permissions=["microphone"])
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.add_init_script(MOCK_JS)
    page.goto(f"http://127.0.0.1:{PORT}/index.html")
    page.wait_for_function("window.app && window.app.audioStreamer")
    page.evaluate("""() => {
        const a = window.app;
        window.__played = 0;
        const orig = a.audioStreamer.playChunk.bind(a.audioStreamer);
        a.audioStreamer.playChunk = (c) => { window.__played++; return orig(c); };
        window.alert = (m) => { window.__alerts = (window.__alerts||[]).concat(m); };
        window.confirm = () => true;
    }""")

    # ---------------- A. 자동 감지 모드: 즉시 재생 ----------------
    page.evaluate("() => { window.app.setSpeechMode('handsfree'); return window.app.startStreaming(); }")
    check("A1 세션 1개 연결 + 준비", wait_until(lambda: nconns() == 1 and ready_count() == 1))
    c0 = conn(0)
    check("A2 setup은 세션당 1회만", c0["setups"] == 1)
    check("A3 setup 형식 (AUDIO + 자막)", c0["setup"]["generationConfig"]["responseModalities"] == ["AUDIO"]
          and "inputAudioTranscription" in c0["setup"]["generationConfig"])
    check("A4 마이크 음성 전송됨", wait_until(lambda: conn(0)["audio"] > 20), f"audio={conn(0)['audio']}")
    check("A5 번역 음성이 오는 즉시 재생 (보류 안 함)", wait_until(lambda: page.evaluate("window.__played") >= 2),
          f"played={page.evaluate('window.__played')}, pending={page.evaluate('window.app.pendingAudioQueue.length')}")
    check("A6 스마트 보호 기본 OFF", page.evaluate("window.app.smartGuard") is False)

    # ---------------- B. 서버 오류로 끊김 → 자동 재연결 ----------------
    before = nconns()
    server_close(-1, 1011, "Internal error")
    check("B1 끊긴 뒤 자동 재연결", wait_until(lambda: nconns() == before + 1 and ready_count() == 1))
    check("B2 재연결 후 음성 계속 전송", wait_until(lambda: conn(-1)["audio"] > 5), f"audio={conn(-1)['audio']}")
    check("B3 스트리밍 유지", page.evaluate("window.app.isStreaming") is True)

    # ---------------- C. GoAway → 무중단 교체 ----------------
    before = nconns()
    old_idx = before - 1
    page.evaluate(f"window.__mock.conns.at({old_idx}).ws._emit({{goAway: {{timeLeft: '5s'}}}})")
    check("C1 GoAway 받으면 새 세션 미리 연결 후 전환", wait_until(lambda: nconns() == before + 1 and conn(-1)["audio"] > 3),
          f"new audio={conn(-1)['audio'] if nconns() > before else 0}")
    check("C2 이전 세션은 앱이 정리", wait_until(lambda: conn(old_idx)["closed"], 4))
    check("C3 활성 세션 1개 유지", page.evaluate("window.app.sessions.size") == 1)

    # ---------------- D. 준비 지연 중 음성 보관 → 준비 후 전송 ----------------
    page.evaluate("window.__mock.setupDelay = 1500")
    before = nconns()
    server_close(-1, 1006)
    wait_until(lambda: nconns() == before + 1)
    time.sleep(0.6)
    check("D1 준비 전에는 음성 미전송", conn(-1)["audio"] == 0, f"audio={conn(-1)['audio']}")
    check("D2 준비 후 보관 음성 한꺼번에 전송", wait_until(lambda: conn(-1)["audio"] >= 10, 4), f"audio={conn(-1)['audio']}")
    page.evaluate("window.__mock.setupDelay = 150")

    # ---------------- E. 토큰 발급 실패(429) → 재시도 ----------------
    token_calls["fail_next"] = 1
    before = nconns()
    server_close(-1, 1006)
    check("E1 토큰 실패 후 재시도로 복구", wait_until(lambda: nconns() == before + 1 and ready_count() == 1, 10))
    page.evaluate("() => window.app.stopStreaming()")
    time.sleep(0.3)
    check("E2 중지 시 모든 세션 종료", page.evaluate("window.app.sessions.size") == 0)

    # ---------------- F. 누르고 말하기: 양방향 세션 + 입력 끝 신호 ----------------
    n0 = nconns()
    page.evaluate("() => window.app.setSpeechMode('ptt')")
    page.evaluate("() => window.app.handlePttDown(null, 'user')")
    check("F1 양방향 세션 2개 미리 연결", wait_until(lambda: nconns() == n0 + 2 and ready_count() == 2))
    time.sleep(1.2)
    page.evaluate("() => window.app.handlePttUp(null)")
    time.sleep(0.4)
    t = {c["target"]: c for c in all_conns()[n0:]}
    en, ko = t.get("en", {}), t.get("ko", {})
    check("F2 '나' 음성은 영어 세션으로", en.get("audio", 0) > 0 and ko.get("audio", 0) == 0, f"en={en.get('audio')} ko={ko.get('audio')}")
    check("F3 버튼 떼면 '입력 끝' 신호 전송", en.get("end") == 1)
    page.evaluate("() => window.app.handlePttDown(null, 'partner')")
    time.sleep(1.0)
    page.evaluate("() => window.app.handlePttUp(null)")
    time.sleep(0.4)
    t = {c["target"]: c for c in all_conns()[n0:]}
    ko = t.get("ko", {})
    check("F4 상대방 음성은 한국어 세션으로 (재연결 없이)", ko.get("audio", 0) > 0 and nconns() == n0 + 2, f"ko={ko.get('audio')}, 새 연결={nconns() - n0}")
    check("F5 발화자 바뀌어도 setup 재전송 없음", all(c["setups"] == 1 for c in all_conns()))
    check("F6 지연 측정 배지 표시", wait_until(lambda: page.evaluate("() => !!document.getElementById('latency-badge')"), 3),
          page.evaluate("() => document.getElementById('latency-badge')?.textContent || ''"))

    # ---------------- G. 마이크 끊김 → 자동 재연결 ----------------
    page.evaluate("() => window.app.audioStreamer.mediaStream.getAudioTracks()[0].dispatchEvent(new Event('ended'))")
    check("G1 마이크 끊김 감지 후 재연결", wait_until(lambda: page.evaluate("() => window.app.audioStreamer.isRecording && !window.app.isRecoveringMic && window.app.talkLog !== null && (window.talkLog||[]).some(l => l.includes('마이크 재연결 완료'))"), 4))

    page.evaluate("() => window.app.stopStreaming()")
    check("Z 페이지 JS 오류 없음", not errors, "; ".join(errors[:3]))
    check("Z 경고창 없음", not page.evaluate("window.__alerts || []"), str(page.evaluate("window.__alerts || []")))
    browser.close()

httpd.shutdown()
failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} 통과")
sys.exit(1 if failed else 0)
