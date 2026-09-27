/**
 * Gemini Live Translate Frontend Application
 * Supports both Backend Relay & Direct Client WebSocket for GitHub Pages
 */

const DEFAULT_API_KEY = "";

const SUPPORTED_LANGUAGES = [
  { code: 'ko', name: '한국어 (Korean)', flag: '🇰🇷' },
  { code: 'en', name: '영어 (English)', flag: '🇺🇸' },
  { code: 'ja', name: '일본어 (Japanese)', flag: '🇯🇵' },
  { code: 'zh-Hans', name: '중국어 간체 (Chinese Simplified)', flag: '🇨🇳' },
  { code: 'zh-Hant', name: '중국어 번체 (Chinese Traditional)', flag: '🇹🇼' },
  { code: 'es', name: '스페인어 (Spanish)', flag: '🇪🇸' },
  { code: 'fr', name: '프랑스어 (French)', flag: '🇫🇷' },
  { code: 'de', name: '독일어 (German)', flag: '🇩🇪' },
  { code: 'vi', name: '베트남어 (Vietnamese)', flag: '🇻🇳' },
  { code: 'th', name: '태국어 (Thai)', flag: '🇹🇭' },
  { code: 'id', name: '인도네시아어 (Indonesian)', flag: '🇮🇩' },
  { code: 'ru', name: '러시아어 (Russian)', flag: '🇷🇺' },
  { code: 'it', name: '이탈리아어 (Italian)', flag: '🇮🇹' },
  { code: 'pt-BR', name: '포르투갈어 - 브라질 (Portuguese)', flag: '🇧🇷' },
  { code: 'ar', name: '아랍어 (Arabic)', flag: '🇸🇦' },
  { code: 'hi', name: '힌디어 (Hindi)', flag: '🇮🇳' },
  { code: 'tr', name: '튀르키예어 (Turkish)', flag: '🇹🇷' },
  { code: 'nl', name: '네덜란드어 (Dutch)', flag: '🇳🇱' },
  { code: 'pl', name: '폴란드어 (Polish)', flag: '🇵🇱' },
  { code: 'fil', name: '필리핀어 (Filipino)', flag: '🇵🇭' },
  { code: 'sv', name: '스웨덴어 (Swedish)', flag: '🇸🇪' },
  { code: 'uk', name: '우크라이나어 (Ukrainian)', flag: '🇺🇦' },
  { code: 'ms', name: '말레이어 (Malay)', flag: '🇲🇾' },
  { code: 'mn', name: '몽골어 (Mongolian)', flag: '🇲🇳' },
  { code: 'cs', name: '체코어 (Czech)', flag: '🇨🇿' },
  { code: 'da', name: '덴마크어 (Danish)', flag: '🇩🇰' },
  { code: 'fi', name: '핀란드어 (Finnish)', flag: '🇫🇮' },
  { code: 'el', name: '그리스어 (Greek)', flag: '🇬🇷' },
  { code: 'he', name: '히브리어 (Hebrew)', flag: '🇮🇱' },
  { code: 'hu', name: '헝가리어 (Hungarian)', flag: '헝가리' },
  { code: 'no', name: '노르웨이어 (Norwegian)', flag: '🇳🇴' },
  { code: 'ro', name: '루마니아어 (Romanian)', flag: '🇷🇴' },
  { code: 'sk', name: '슬로바키아어 (Slovak)', flag: '🇸🇰' }
];

class LiveTranslatorApp {
  constructor() {
    this.ws = null;
    this.isStreaming = false;
    this.currentMode = 'split'; // 'split' | 'solo'
    this.isDirectGemini = false; // true when using GitHub Pages without backend
    
    // User & Partner Target Language
    this.userLang = 'ko';
    this.partnerLang = 'en';

    // Settings & API Key
    this.apiKey = localStorage.getItem('gemini_api_key') || DEFAULT_API_KEY;
    this.settings = {
      echoTargetLanguage: false,
      audioOutputEnabled: true,
      echoCancellation: true
    };

    // Conversation History
    this.history = [];
    this.currentInputText = '';
    this.currentOutputText = '';

    this.audioStreamer = new AudioStreamer({
      onAudioChunk: (chunk) => this.sendAudioChunk(chunk),
      onInputVolume: (vol) => this.drawWaveform('user-wave', vol, '#00e5ff'),
      onOutputVolume: (vol) => this.drawWaveform('partner-wave', vol, '#8b5cf6')
    });

    this.initElements();
    this.populateLanguageOptions();
    this.bindEvents();
    this.checkEnvironment();
  }

  initElements() {
    this.btnModeSplit = document.getElementById('btn-mode-split');
    this.btnModeSolo = document.getElementById('btn-mode-solo');
    this.btnToggleStream = document.getElementById('btn-toggle-stream');
    this.btnSoloMic = document.getElementById('btn-solo-mic');
    this.btnSwapLang = document.getElementById('btn-swap-languages');
    this.btnSoloSwap = document.getElementById('btn-solo-swap');
    this.btnHistoryToggle = document.getElementById('btn-history-toggle');
    this.btnCloseHistory = document.getElementById('btn-close-history');
    this.btnSettingsToggle = document.getElementById('btn-settings-toggle');
    this.btnCloseSettings = document.getElementById('btn-close-settings');
    this.btnCopyHistory = document.getElementById('btn-copy-history');
    this.btnDownloadHistory = document.getElementById('btn-download-history');

    this.splitView = document.getElementById('split-view');
    this.soloView = document.getElementById('solo-view');
    this.historyDrawer = document.getElementById('history-drawer');
    this.settingsModal = document.getElementById('settings-modal');

    this.userLangSelect = document.getElementById('user-lang-select');
    this.partnerLangSelect = document.getElementById('partner-lang-select');
    this.soloUserLang = document.getElementById('solo-user-lang');
    this.soloTargetLang = document.getElementById('solo-target-lang');

    this.userInputText = document.getElementById('user-input-text');
    this.userOutputText = document.getElementById('user-output-text');
    this.partnerInputText = document.getElementById('partner-input-text');
    this.partnerOutputText = document.getElementById('partner-output-text');
    this.conversationFeed = document.getElementById('conversation-feed');
    this.historyList = document.getElementById('history-list');

    this.streamStatusLabel = document.getElementById('stream-status-label');
    this.soloMicText = document.getElementById('solo-mic-text');
    this.micIcon = document.getElementById('mic-icon');
    this.stopIcon = document.getElementById('stop-icon');
    this.statusPill = document.getElementById('connection-status-pill');

    this.inputApiKey = document.getElementById('input-api-key');
    if (this.inputApiKey) {
      this.inputApiKey.value = this.apiKey;
    }

    this.settingEchoToggle = document.getElementById('setting-echo-toggle');
    this.settingAudioOut = document.getElementById('setting-audio-out');
    this.settingEchoCancellation = document.getElementById('setting-echo-cancellation');
  }

  populateLanguageOptions() {
    const selects = [this.userLangSelect, this.partnerLangSelect, this.soloUserLang, this.soloTargetLang];
    
    selects.forEach((sel) => {
      sel.innerHTML = '';
      SUPPORTED_LANGUAGES.forEach((lang) => {
        const opt = document.createElement('option');
        opt.value = lang.code;
        opt.textContent = `${lang.flag} ${lang.name}`;
        sel.appendChild(opt);
      });
    });

    this.userLangSelect.value = this.userLang;
    this.partnerLangSelect.value = this.partnerLang;
    this.soloUserLang.value = this.userLang;
    this.soloTargetLang.value = this.partnerLang;
  }

  bindEvents() {
    this.btnModeSplit.addEventListener('click', () => this.setMode('split'));
    this.btnModeSolo.addEventListener('click', () => this.setMode('solo'));

    this.btnToggleStream.addEventListener('click', () => this.toggleStreaming());
    this.btnSoloMic.addEventListener('click', () => this.toggleStreaming());

    this.btnSwapLang.addEventListener('click', () => this.swapLanguages());
    this.btnSoloSwap.addEventListener('click', () => this.swapLanguages());

    this.userLangSelect.addEventListener('change', (e) => {
      this.userLang = e.target.value;
      this.soloUserLang.value = this.userLang;
      this.onLanguageChange();
    });

    this.partnerLangSelect.addEventListener('change', (e) => {
      this.partnerLang = e.target.value;
      this.soloTargetLang.value = this.partnerLang;
      this.onLanguageChange();
    });

    this.soloUserLang.addEventListener('change', (e) => {
      this.userLang = e.target.value;
      this.userLangSelect.value = this.userLang;
      this.onLanguageChange();
    });

    this.soloTargetLang.addEventListener('change', (e) => {
      this.partnerLang = e.target.value;
      this.partnerLangSelect.value = this.partnerLang;
      this.onLanguageChange();
    });

    this.btnHistoryToggle.addEventListener('click', () => this.historyDrawer.classList.toggle('open'));
    this.btnCloseHistory.addEventListener('click', () => this.historyDrawer.classList.remove('open'));
    this.btnCopyHistory.addEventListener('click', () => this.copyHistory());
    this.btnDownloadHistory.addEventListener('click', () => this.downloadHistory());

    this.btnSettingsToggle.addEventListener('click', () => this.settingsModal.classList.remove('hidden'));
    this.btnCloseSettings.addEventListener('click', () => this.settingsModal.classList.add('hidden'));

    if (this.inputApiKey) {
      this.inputApiKey.addEventListener('change', (e) => {
        this.apiKey = e.target.value.trim();
        localStorage.setItem('gemini_api_key', this.apiKey);
        alert('API 키가 저장되었습니다.');
      });
    }

    this.settingEchoToggle.addEventListener('change', (e) => {
      this.settings.echoTargetLanguage = e.target.checked;
      this.onLanguageChange();
    });

    this.settingAudioOut.addEventListener('change', (e) => {
      this.settings.audioOutputEnabled = e.target.checked;
    });

    this.settingEchoCancellation.addEventListener('change', (e) => {
      this.settings.echoCancellation = e.target.checked;
    });
  }

  async checkEnvironment() {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        this.isDirectGemini = false;
        console.log('[Env] Connected via backend relay');
      } else {
        this.isDirectGemini = true;
      }
    } catch (e) {
      // Running on GitHub Pages or static host
      this.isDirectGemini = true;
      console.log('[Env] Static hosting detected, using direct Gemini WebSocket');
    }
  }

  setMode(mode) {
    this.currentMode = mode;
    if (mode === 'split') {
      this.btnModeSplit.classList.add('active');
      this.btnModeSolo.classList.remove('active');
      this.splitView.classList.add('active');
      this.soloView.classList.remove('active');
      document.body.className = 'mode-split';
    } else {
      this.btnModeSolo.classList.add('active');
      this.btnModeSplit.classList.remove('active');
      this.soloView.classList.add('active');
      this.splitView.classList.remove('active');
      document.body.className = 'mode-solo';
    }
  }

  swapLanguages() {
    const temp = this.userLang;
    this.userLang = this.partnerLang;
    this.partnerLang = temp;

    this.userLangSelect.value = this.userLang;
    this.partnerLangSelect.value = this.partnerLang;
    this.soloUserLang.value = this.userLang;
    this.soloTargetLang.value = this.partnerLang;

    this.onLanguageChange();
  }

  onLanguageChange() {
    if (this.isStreaming) {
      this.stopStreaming();
      setTimeout(() => this.startStreaming(), 200);
    }
  }

  async toggleStreaming() {
    if (this.isStreaming) {
      this.stopStreaming();
    } else {
      await this.startStreaming();
    }
  }

  async startStreaming() {
    try {
      const apiKey = this.apiKey || DEFAULT_API_KEY;
      
      if (!apiKey && (this.isDirectGemini || location.hostname.includes('github.io'))) {
        alert('Gemini API 키를 먼저 입력해 주세요. (우측 상단 ⚙️ 설정에서 입력 가능합니다)');
        this.settingsModal.classList.remove('hidden');
        if (this.inputApiKey) this.inputApiKey.focus();
        return;
      }

      this.updateStatusUI(true);
      this.setStatusPill('연결 중...', 'orange');
      
      let wsUrl = '';
      if (this.isDirectGemini || location.hostname.includes('github.io') || location.hostname.includes('vercel.app')) {
        wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;
      } else {
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = `${protocol}//${location.host}/ws/translate`;
      }

      console.log('[App] Connecting WebSocket to:', wsUrl.replace(/key=([^&]+)/, 'key=HIDDEN'));
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = async () => {
        console.log('[WebSocket] Connected');
        this.setStatusPill('세션 구성 중...', 'cyan');

        if (this.isDirectGemini || location.hostname.includes('github.io')) {
          // Direct setup message
          const setupMessage = {
            setup: {
              model: 'models/gemini-3.5-live-translate-preview',
              generationConfig: {
                responseModalities: ['AUDIO'],
                inputAudioTranscription: {},
                outputAudioTranscription: {},
                translationConfig: {
                  targetLanguageCode: this.partnerLang,
                  echoTargetLanguage: this.settings.echoTargetLanguage
                }
              }
            }
          };
          this.ws.send(JSON.stringify(setupMessage));
        } else {
          // Backend relay start
          this.ws.send(JSON.stringify({
            type: 'start',
            config: {
              targetLanguageCode: this.partnerLang,
              echoTargetLanguage: this.settings.echoTargetLanguage
            }
          }));
        }

        // Start mic recording
        try {
          await this.audioStreamer.startRecording({
            echoCancellation: this.settings.echoCancellation
          });
          this.isStreaming = true;
          this.setStatusPill('통역 준비 완료 (듣는 중)', '#10b981');
        } catch (micErr) {
          console.error('[Mic Error]', micErr);
          alert('마이크 접근 권한이 필요합니다. 브라우저 설정에서 마이크를 허용해 주세요: ' + micErr.message);
          this.stopStreaming();
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const raw = JSON.parse(event.data);
          
          // If direct response from Gemini
          if (raw.serverContent) {
            this.handleServerMessage({ payload: raw });
          } else if (raw.type === 'gemini_response') {
            this.handleServerMessage(raw);
          } else if (raw.type === 'log') {
            this.streamStatusLabel.textContent = msg.message;
          }
        } catch (e) {
          console.error('Parse error:', e);
        }
      };

      this.ws.onclose = (ev) => {
        console.log('[WebSocket] Closed:', ev);
        this.setStatusPill('연결 대기', '#94a3b8');
        this.stopStreaming();
      };

      this.ws.onerror = (err) => {
        console.error('[WebSocket] Error:', err);
        this.setStatusPill('통신 오류', '#f43f5e');
        this.stopStreaming();
      };

    } catch (err) {
      console.error('[App] Failed to start stream:', err);
      alert('스트리밍을 시작할 수 없습니다: ' + err.message);
      this.stopStreaming();
    }
  }

  stopStreaming() {
    this.isStreaming = false;
    this.audioStreamer.stopRecording();

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: 'stop' }));
        this.ws.close();
      } catch (e) {}
    }
    this.ws = null;

    this.updateStatusUI(false);
    this.flushCurrentTurnToHistory();
  }

  sendAudioChunk(base64Data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      if (this.isDirectGemini || location.hostname.includes('github.io')) {
        const payload = {
          realtimeInput: {
            mediaChunks: [
              {
                mimeType: 'audio/pcm;rate=16000',
                data: base64Data
              }
            ]
          }
        };
        this.ws.send(JSON.stringify(payload));
      } else {
        this.ws.send(JSON.stringify({
          type: 'audio_chunk',
          data: base64Data
        }));
      }
    }
  }

  handleServerMessage(msg) {
    const serverContent = msg.payload?.serverContent || msg.serverContent;
    if (!serverContent) return;

    // 1. Input Transcript
    if (serverContent.inputTranscription && serverContent.inputTranscription.text) {
      const text = serverContent.inputTranscription.text;
      this.currentInputText += text;
      this.renderLiveTranscript();
    }

    // 2. Output Transcript
    if (serverContent.outputTranscription && serverContent.outputTranscription.text) {
      const text = serverContent.outputTranscription.text;
      this.currentOutputText += text;
      this.renderLiveTranscript();
    }

    // 3. Audio Playback
    if (serverContent.modelTurn && serverContent.modelTurn.parts) {
      for (const part of serverContent.modelTurn.parts) {
        if (part.inlineData && part.inlineData.data) {
          if (this.settings.audioOutputEnabled) {
            this.audioStreamer.playChunk(part.inlineData.data);
          }
        }
      }
    }

    // Turn complete
    if (serverContent.turnComplete) {
      this.flushCurrentTurnToHistory();
    }
  }

  renderLiveTranscript() {
    if (this.currentInputText) {
      this.userInputText.textContent = this.currentInputText;
      this.partnerInputText.textContent = this.currentInputText;
    }
    if (this.currentOutputText) {
      this.userOutputText.textContent = this.currentOutputText;
      this.partnerOutputText.textContent = this.currentOutputText;
    }
  }

  flushCurrentTurnToHistory() {
    if (!this.currentInputText && !this.currentOutputText) return;

    const item = {
      id: Date.now(),
      time: new Date().toLocaleTimeString(),
      original: this.currentInputText.trim(),
      translated: this.currentOutputText.trim(),
      fromLang: this.userLang,
      toLang: this.partnerLang
    };

    if (item.original || item.translated) {
      this.history.push(item);
      this.renderHistory();
      this.appendFeedBubble(item);
    }

    this.currentInputText = '';
    this.currentOutputText = '';
  }

  appendFeedBubble(item) {
    const placeholder = this.conversationFeed.querySelector('.feed-placeholder');
    if (placeholder) {
      placeholder.remove();
    }

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble mine';
    bubble.innerHTML = `
      <strong>${item.translated || item.original}</strong>
      <span class="sub-text">${item.original} (${item.time})</span>
    `;
    this.conversationFeed.appendChild(bubble);
    this.conversationFeed.scrollTop = this.conversationFeed.scrollHeight;
  }

  renderHistory() {
    if (this.history.length === 0) {
      this.historyList.innerHTML = '<p class="empty-history">아직 기록된 대화가 없습니다.</p>';
      return;
    }

    this.historyList.innerHTML = '';
    this.history.forEach((h) => {
      const el = document.createElement('div');
      el.className = 'history-item';
      el.innerHTML = `
        <div class="speaker">${h.time} [${h.fromLang} ➔ ${h.toLang}]</div>
        <div class="text-main">${h.translated || '...'}</div>
        <div class="text-sub">원문: ${h.original || '...'}</div>
      `;
      this.historyList.appendChild(el);
    });
    this.historyList.scrollTop = this.historyList.scrollHeight;
  }

  copyHistory() {
    if (this.history.length === 0) return alert('복사할 대화 기록이 없습니다.');
    const text = this.history.map(h => `[${h.time}] 원문: ${h.original}\n번역: ${h.translated}\n`).join('\n');
    navigator.clipboard.writeText(text).then(() => alert('대화 기록이 클립보드에 복사되었습니다.'));
  }

  downloadHistory() {
    if (this.history.length === 0) return alert('저장할 대화 기록이 없습니다.');
    const text = this.history.map(h => `[${h.time}] [${h.fromLang}->${h.toLang}]\n원문: ${h.original}\n번역: ${h.translated}\n`).join('\n---\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gemini-translation-${new Date().toISOString().slice(0,10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  drawWaveform(canvasId, volume, color = '#00e5ff') {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    const bars = 24;
    const barWidth = 4;
    const gap = (w - (bars * barWidth)) / (bars - 1);
    const centerY = h / 2;

    for (let i = 0; i < bars; i++) {
      const heightFactor = Math.sin((i / bars) * Math.PI) * (volume * 150 + 2);
      const barHeight = Math.min(h - 4, Math.max(3, heightFactor));
      const x = i * (barWidth + gap);
      const y = centerY - barHeight / 2;

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, 2);
      ctx.fill();
    }
  }

  updateStatusUI(streaming) {
    if (streaming) {
      this.btnToggleStream.className = 'mic-button streaming';
      this.btnSoloMic.className = 'mic-button-floating streaming';
      this.micIcon.classList.add('hidden');
      this.stopIcon.classList.remove('hidden');
      this.streamStatusLabel.textContent = '실시간 동시통역 중... (터치하여 중지)';
      this.soloMicText.textContent = '통역 중지';
    } else {
      this.btnToggleStream.className = 'mic-button idle';
      this.btnSoloMic.className = 'mic-button-floating idle';
      this.micIcon.classList.remove('hidden');
      this.stopIcon.classList.add('hidden');
      this.streamStatusLabel.textContent = '터치하여 동시통역 시작';
      this.soloMicText.textContent = '통역 시작';
    }
  }

  setStatusPill(text, color = '#00e5ff') {
    if (this.statusPill) {
      this.statusPill.textContent = text;
      this.statusPill.style.color = color;
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.app = new LiveTranslatorApp();
});
