/**
 * Gemini Live Translate Frontend Application
 * Handles both Text, Blob & ArrayBuffer WebSocket data safely
 */

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
  { code: 'hu', name: '헝가리어 (Hungarian)', flag: '🇭🇺' },
  { code: 'no', name: '노르웨이어 (Norwegian)', flag: '🇳🇴' },
  { code: 'ro', name: '루마니아어 (Romanian)', flag: '🇷🇴' },
  { code: 'sk', name: '슬로바키아어 (Slovak)', flag: '🇸🇰' }
];

class LiveTranslatorApp {
  constructor() {
    this.ws = null;
    this.isStreaming = false;
    this.currentMode = 'split';
    
    this.userLang = 'ko';
    this.partnerLang = 'en';

    this.chunksSent = 0;
    this.chunksReceived = 0;

    this.apiKey = localStorage.getItem('gemini_api_key') || "";
    this.settings = {
      echoTargetLanguage: false,
      audioOutputEnabled: true,
      echoCancellation: true
    };

    this.history = [];
    this.currentInputText = '';
    this.currentOutputText = '';

    this.audioStreamer = new AudioStreamer({
      onAudioChunk: (chunk) => this.sendAudioChunk(chunk),
      onInputVolume: (vol) => {
        this.drawWaveform('user-wave', vol, '#00e5ff');
        this.updateVolumeBar(vol);
      },
      onOutputVolume: (vol) => this.drawWaveform('partner-wave', vol, '#8b5cf6'),
      onDebugLog: (msg) => this.addDebugLog(msg)
    });

    this.learnedRules = JSON.parse(localStorage.getItem('gemini_learned_rules') || '[]');
    this.conversationContextSummary = localStorage.getItem('gemini_context_summary') || '';
    this.autoLearnDebounceTimer = null;
    
    this.initElements();
    this.populateLanguageOptions();
    this.renderLearnedRules();
    this.updateAiLearnBadge('idle');
    this.bindEvents();
    this.checkApiKey();
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
    this.aiLearnIndicator = document.getElementById('ai-learn-indicator');
    this.aiLearnCount = document.getElementById('ai-learn-count');

    this.dictSourceInput = document.getElementById('dict-source-word');
    this.dictTargetInput = document.getElementById('dict-target-word');
    this.btnAddDictRule = document.getElementById('btn-add-dict-rule');
    this.dictRulesList = document.getElementById('dict-rules-list');

    this.inputApiKey = document.getElementById('input-api-key');
    if (this.inputApiKey) {
      this.inputApiKey.value = this.apiKey;
    }

    this.settingEchoToggle = document.getElementById('setting-echo-toggle');
    if (this.settingEchoToggle) {
      this.settingEchoToggle.checked = this.settings.echoTargetLanguage;
    }
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

    this.aiLearnIndicator?.addEventListener('click', () => {
      this.settingsModal.classList.remove('hidden');
    });

    if (this.inputApiKey) {
      this.inputApiKey.addEventListener('input', (e) => {
        this.apiKey = e.target.value.trim();
        localStorage.setItem('gemini_api_key', this.apiKey);
        if (this.apiKey) {
          this.setStatusPill('준비 완료 (마이크 터치)', '#10b981');
        }
      });
    }

    this.settingEchoToggle.addEventListener('change', (e) => {
      this.settings.echoTargetLanguage = e.target.checked;
      this.onLanguageChange();
    });

    this.settingAudioOut.addEventListener('change', (e) => {
      this.settings.audioOutputEnabled = e.target.checked;
    });

    this.btnAddDictRule?.addEventListener('click', () => this.addDictionaryRule());
    this.dictTargetInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.addDictionaryRule();
    });
  }

  addDictionaryRule(sourceVal = null, targetVal = null) {
    const src = (sourceVal || this.dictSourceInput?.value || '').trim();
    const tgt = (targetVal || this.dictTargetInput?.value || '').trim();

    if (!src || !tgt) {
      alert('원문 단어와 맞춤 번역어를 모두 입력해주세요.');
      return;
    }

    // Remove duplicates
    this.learnedRules = this.learnedRules.filter(r => r.src.toLowerCase() !== src.toLowerCase());
    this.learnedRules.unshift({ src, tgt, timestamp: Date.now() });
    localStorage.setItem('gemini_learned_rules', JSON.stringify(this.learnedRules));

    if (this.dictSourceInput) this.dictSourceInput.value = '';
    if (this.dictTargetInput) this.dictTargetInput.value = '';

    this.renderLearnedRules();
    this.addDebugLog(`[AI Memory] New rule learned: "${src}" -> "${tgt}"`);
  }

  deleteDictionaryRule(src) {
    this.learnedRules = this.learnedRules.filter(r => r.src !== src);
    localStorage.setItem('gemini_learned_rules', JSON.stringify(this.learnedRules));
    this.renderLearnedRules();
  }

  renderLearnedRules() {
    if (!this.dictRulesList) return;
    if (this.learnedRules.length === 0) {
      this.dictRulesList.innerHTML = '<span style="font-size: 0.8rem; color: #64748b;">아직 등록된 맞춤 학습 단어가 없습니다.</span>';
      return;
    }

    this.dictRulesList.innerHTML = '';
    this.learnedRules.forEach(rule => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding: 5px 10px; border-radius: 6px; font-size: 0.82rem;';
      row.innerHTML = `
        <span><strong style="color:#00e5ff;">${rule.src}</strong> ➔ <span style="color:#a78bfa;">${rule.tgt}</span></span>
        <button class="rule-del-btn" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:0.9rem;">✕</button>
      `;
      row.querySelector('.rule-del-btn').addEventListener('click', () => this.deleteDictionaryRule(rule.src));
      this.dictRulesList.appendChild(row);
    });
  }

  getSystemInstructionText() {
    let customGlossary = '';
    if (this.learnedRules && this.learnedRules.length > 0) {
      const topRules = this.learnedRules.slice(0, 8);
      customGlossary = ` Key Terms: ` + topRules.map(r => `"${r.src}"->"${r.tgt}"`).join(', ');
    }

    return `Realtime simultaneous interpreter. Translate directly to ${this.partnerLang}. No intro/chitchat.${customGlossary}`;
  }

  updateAiLearnBadge(status = 'idle', count = null) {
    if (!this.aiLearnIndicator) return;
    const ruleCount = count ?? this.learnedRules.length;
    if (this.aiLearnCount) this.aiLearnCount.textContent = ruleCount;

    const textEl = this.aiLearnIndicator.querySelector('.ai-learn-text');

    if (status === 'learning') {
      this.aiLearnIndicator.className = 'ai-learning-pill learning';
      if (textEl) textEl.textContent = 'AI 학습중';
    } else if (status === 'success') {
      this.aiLearnIndicator.className = 'ai-learning-pill success';
      if (textEl) textEl.textContent = '학습 완료';
      setTimeout(() => {
        this.updateAiLearnBadge('idle');
      }, 3000);
    } else {
      this.aiLearnIndicator.className = 'ai-learning-pill idle';
      if (textEl) textEl.textContent = 'AI 기억 ' + ruleCount;
    }
  }

  async triggerAutoLearn() {
    if (this.history.length === 0) return;

    this.updateAiLearnBadge('learning');

    try {
      this.addDebugLog('[Auto AI] Background learning analyzing conversation...');
      const recentTurns = this.history.slice(-10);

      const prompt = `You are an Autonomous AI Linguist & Memory Engine.
Analyze the following bilingual conversation transcript between two users:
${JSON.stringify(recentTurns, null, 2)}

Already known memory rules:
${JSON.stringify(this.learnedRules || [])}

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

      const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' }
        })
      });

      if (!geminiRes.ok) {
        this.updateAiLearnBadge('idle');
        return;
      }
      const rawData = await geminiRes.json();
      const rawText = rawData?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      let data = {};
      try {
        data = JSON.parse(rawText);
      } catch (e) {
        data = {};
      }

      let newlyAdded = 0;
      if (data.contextSummary) {
        this.conversationContextSummary = data.contextSummary;
        localStorage.setItem('gemini_context_summary', this.conversationContextSummary);
      }

      if (Array.isArray(data.extractedRules)) {
        data.extractedRules.forEach(rule => {
          if (!rule.src || !rule.tgt) return;
          const exists = this.learnedRules.some(r => r.src.toLowerCase() === rule.src.toLowerCase());
          if (!exists) {
            this.learnedRules.unshift({
              src: rule.src,
              tgt: rule.tgt,
              reason: rule.reason || '대화에서 AI가 자율 학습함',
              autoLearned: true,
              timestamp: Date.now()
            });
            newlyAdded++;
          }
        });
      }

      if (newlyAdded > 0) {
        localStorage.setItem('gemini_learned_rules', JSON.stringify(this.learnedRules));
        this.renderLearnedRules();
        this.addDebugLog(`✨ [자율 학습 완료] AI가 새로운 용어/규칙 ${newlyAdded}개를 자동 습득했습니다!`);
        this.showAutoLearnToast(`🧠 AI가 새로운 단어 ${newlyAdded}개를 자동 학습했습니다!`);
        this.updateAiLearnBadge('success');
      } else {
        this.updateAiLearnBadge('idle');
      }
    } catch (e) {
      console.warn('[AutoLearn] Background analysis error:', e);
      this.updateAiLearnBadge('idle');
    }
  }

  showAutoLearnToast(msg) {
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed; bottom:20px; right:20px; background:linear-gradient(135deg, #00e5ff, #8b5cf6); color:#000; font-weight:700; padding:10px 18px; border-radius:30px; box-shadow:0 8px 24px rgba(0,0,0,0.5); z-index:9999; font-size:0.85rem; animation:fadeIn 0.3s ease-in-out;';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.5s ease';
      setTimeout(() => toast.remove(), 500);
    }, 3500);
  }

  checkApiKey() {
    if (!this.apiKey) {
      setTimeout(() => {
        this.settingsModal.classList.remove('hidden');
        this.setStatusPill('API 키 입력 필요', '#f59e0b');
      }, 400);
    } else {
      this.setStatusPill('준비 완료 (마이크 터치)', '#10b981');
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
      this.addDebugLog(`[Lang] Switching target to: ${this.partnerLang}`);
      this.stopStreaming();
      setTimeout(() => this.startStreaming(), 250);
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
      this.apiKey = (this.inputApiKey?.value || this.apiKey || localStorage.getItem('gemini_api_key') || "").trim();

      if (!this.apiKey) {
        alert('Gemini API 키가 입력되지 않았습니다. 설정창에서 API 키를 입력해 주세요.');
        this.settingsModal.classList.remove('hidden');
        if (this.inputApiKey) this.inputApiKey.focus();
        return;
      }

      this.chunksSent = 0;
      this.chunksReceived = 0;
      this.updateStatusUI(true);

      // [CRITICAL] 1. Start microphone immediately inside user click gesture
      // This prevents browsers (iOS Safari / Chrome) from blocking mic or AudioContext
      this.setStatusPill('마이크 장치 확인 중...', '#00e5ff');
      this.addDebugLog('[Mic] 마이크 장치 및 권한 요청 중...');

      try {
        await this.audioStreamer.startRecording({
          echoCancellation: this.settings.echoCancellation
        });
        this.isStreaming = true;
      } catch (micErr) {
        this.addDebugLog(`[Mic Error] ${micErr.message}`);
        this.updateStatusUI(false);
        this.setStatusPill('마이크 오류', '#f43f5e');
        alert(micErr.message);
        this.stopStreaming();
        return;
      }

      // 2. Connect to Gemini Live Translate WebSocket
      this.setStatusPill('Gemini 통역 서버 연결 중...', 'orange');
      this.streamStatusLabel.textContent = '마이크 정상 감지 중 🎙️ | Gemini 연결 중...';
      this.addDebugLog(`[Gemini] Connecting directly to Live Translate (${this.partnerLang})...`);

      const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;
      this.ws = new WebSocket(geminiUrl);

      this.ws.onopen = async () => {
        this.addDebugLog('[WebSocket] Connected directly to Gemini! Sending setup...');
        this.setStatusPill('세션 구성 중...', 'cyan');

        const srcLangObj = SUPPORTED_LANGUAGES.find(l => l.code === this.userLang);
        const tgtLangObj = SUPPORTED_LANGUAGES.find(l => l.code === this.partnerLang);
        const srcName = srcLangObj ? srcLangObj.name : this.userLang;
        const tgtName = tgtLangObj ? tgtLangObj.name : this.partnerLang;

        const systemPrompt = `You are an elite simultaneous interpreter providing live translation.
Source Language: ${srcName} (${this.userLang})
Target Language: ${tgtName} (${this.partnerLang})

CRITICAL MANDATES:
1. Translate everything you hear in ${srcName} into fluent, natural ${tgtName} immediately.
2. Output BOTH realtime translated text and realtime spoken audio in ${tgtName}.
3. STRICT PROHIBITION: NEVER chat, never say greetings, never explain, never summarize, never ask questions, and never say filler like "Here is the translation:".
4. Output EXCLUSIVELY the translated content. If the speaker says something, translate it verbatim into ${tgtName}.`;

        const setupMessage = {
          setup: {
            model: 'models/gemini-3.5-live-translate-preview',
            generation_config: {
              response_modalities: ['AUDIO', 'TEXT'],
              translation_config: {
                target_language_code: this.partnerLang,
                echo_target_language: this.settings.echoTargetLanguage
              }
            }
          }
        };

        this.ws.send(JSON.stringify(setupMessage));
        this.addDebugLog(`[Setup Sent] ${this.userLang} -> ${this.partnerLang} (Interpreter Mode)`);
        this.setStatusPill('통역 중 (듣는 중)', '#10b981');
        this.streamStatusLabel.textContent = '음성을 듣고 실시간 통역 중입니다... (말씀하세요)';
      };

      this.ws.onmessage = async (event) => {
        try {
          let text = '';
          if (typeof event.data === 'string') {
            text = event.data;
          } else if (event.data instanceof Blob) {
            text = await event.data.text();
          } else if (event.data instanceof ArrayBuffer) {
            text = new TextDecoder().decode(event.data);
          }
          const raw = JSON.parse(text);
          this.handleServerMessage(raw);
        } catch (e) {
          console.error('Parse error:', e, event.data);
          this.addDebugLog(`[Message Parse Error] ${e.message}`);
        }
      };

      this.ws.onclose = (ev) => {
        const reason = ev.reason || '';
        this.addDebugLog(`[WebSocket Closed] Code: ${ev.code}, Reason: ${reason || 'None'}`);
        
        let alertMessage = null;
        if (ev.code === 1011 || reason.includes('prepayment credits are depleted') || reason.includes('credits')) {
          this.setStatusPill('API 크레딧 소진', '#f43f5e');
          alertMessage = '⚠️ 구글 Gemini API 키의 크레딧/한도가 소진되었습니다.\n\n새로운 Gemini API 키를 발급받으신 후 상단 설정(⚙️) 아이콘을 눌러 새 키를 입력해 주세요.';
        } else if (ev.code === 1006 || ev.code === 1007 || ev.code === 1008) {
          this.setStatusPill('API 인증 실패', '#f43f5e');
          alertMessage = `⚠️ Gemini API 연결 실패 (코드 ${ev.code})\n\nAPI 키가 올바른지 확인하거나 새로운 키로 변경해 주세요.\n사유: ${reason || '인증/네트워크 오류'}`;
        } else if (ev.code !== 1000) {
          this.setStatusPill('연결 종료', '#94a3b8');
        } else {
          this.setStatusPill('대기 중', '#94a3b8');
        }

        this.stopStreaming();

        if (alertMessage) {
          setTimeout(() => alert(alertMessage), 100);
        }
      };

      this.ws.onerror = (err) => {
        this.addDebugLog(`[WebSocket Error] Connection failed. Check API Key/Network.`);
        this.setStatusPill('통신 오류 (API 키 확인)', '#f43f5e');
        this.stopStreaming();
      };

    } catch (err) {
      this.addDebugLog(`[Start Error] ${err.message}`);
      alert('스트리밍을 시작할 수 없습니다: ' + err.message);
      this.stopStreaming();
    }
  }

  stopStreaming() {
    this.isStreaming = false;
    this.audioStreamer.stopRecording();

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.close();
      } catch (e) {}
    }
    this.ws = null;

    this.updateStatusUI(false);
    this.flushCurrentTurnToHistory();

    // Trigger AI Learning analysis immediately on stop
    console.log('[AutoLearn Trigger] History length:', this.history.length);
    if (this.history.length > 0) {
      this.triggerAutoLearn();
    } else {
      // If no speech history was recorded yet, briefly show idle
      this.updateAiLearnBadge('idle');
    }
  }

  sendAudioChunk(base64Data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.chunksSent++;
      const payload = {
        realtime_input: {
          media_chunks: [
            {
              mime_type: 'audio/pcm;rate=16000',
              data: base64Data
            }
          ]
        }
      };
      this.ws.send(JSON.stringify(payload));
      if (this.chunksSent % 5 === 0) {
        this.updateStatsBar();
      }
    }
  }

  handleServerMessage(data) {
    if (data.setupComplete || data.setup_complete) {
      this.addDebugLog('[Gemini] Setup Complete! Ready for speech.');
      this.setStatusPill('통역 준비 완료 (말씀하세요)', '#10b981');
      return;
    }

    const serverContent = data.serverContent || data.server_content || data.payload?.serverContent;
    if (!serverContent) return;

    // 1. Input Transcript (User STT)
    const inTrans = serverContent.inputTranscription || serverContent.input_transcription;
    if (inTrans && inTrans.text) {
      this.currentInputText += inTrans.text;
      this.addDebugLog(`[STT 원문] ${inTrans.text}`);
      this.renderLiveTranscript();
    }

    // 2. Output Transcript (Model Translation STT or Model Turn Text)
    const outTrans = serverContent.outputTranscription || serverContent.output_transcription;
    if (outTrans && outTrans.text) {
      this.currentOutputText += outTrans.text;
      this.addDebugLog(`[번역문] ${outTrans.text}`);
      this.renderLiveTranscript();
    }

    // 3. Model Turn (Audio output & direct text translation)
    const modelTurn = serverContent.modelTurn || serverContent.model_turn;
    if (modelTurn && modelTurn.parts) {
      for (const part of modelTurn.parts) {
        if (part.text) {
          this.currentOutputText += part.text;
          this.addDebugLog(`[번역문] ${part.text}`);
          this.renderLiveTranscript();
        }
        const inlineData = part.inlineData || part.inline_data;
        if (inlineData && inlineData.data) {
          this.chunksReceived++;
          this.updateStatsBar();
          this.addDebugLog(`[오디오 수신] chunk #${this.chunksReceived}`);
          if (this.settings.audioOutputEnabled) {
            this.audioStreamer.playChunk(inlineData.data);
          }
        }
      }
    }

    if (serverContent.turnComplete || serverContent.turn_complete) {
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
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div class="speaker">${h.time} [${h.fromLang} ➔ ${h.toLang}]</div>
          <button class="learn-btn" style="background:rgba(0,229,255,0.15); border:1px solid #00e5ff; color:#00e5ff; padding:2px 8px; border-radius:4px; font-size:0.75rem; cursor:pointer;" title="이 대화를 맞춤 번역 규칙으로 AI에 학습">🧠 AI 학습</button>
        </div>
        <div class="text-main">${h.translated || '...'}</div>
        <div class="text-sub">원문: ${h.original || '...'}</div>
      `;

      el.querySelector('.learn-btn').addEventListener('click', () => {
        const correctTarget = prompt(`"${h.original}"에 대해 AI가 기억해야 할 올바른 번역을 입력해주세요:`, h.translated);
        if (correctTarget && correctTarget.trim()) {
          this.addDictionaryRule(h.original, correctTarget.trim());
          alert(`✅ AI 학습 완료!\n"${h.original}" ➔ "${correctTarget.trim()}" 규칙이 저장되었습니다. 다음 통역부터 즉시 적용됩니다.`);
        }
      });

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

  updateVolumeBar(volume) {
    if (this.isStreaming) {
      const pct = Math.min(100, Math.round(volume * 400));
      this.streamStatusLabel.textContent = `🎙️ 마이크 감지 중 (레벨: ${pct}%) | 송신: ${this.chunksSent} / 수신: ${this.chunksReceived}`;
    }
  }

  updateStatsBar() {
    if (this.isStreaming) {
      this.streamStatusLabel.textContent = `🎙️ 실시간 통역 중... [송신: ${this.chunksSent} | 수신: ${this.chunksReceived} 오디오]`;
    }
  }

  addDebugLog(msg) {
    console.log('[Live]', msg);
    const logEl = document.getElementById('debug-log-text');
    if (logEl) {
      logEl.textContent = msg;
    }
  }

  updateStatusUI(streaming) {
    if (streaming) {
      this.btnToggleStream.className = 'mic-button streaming';
      this.btnSoloMic.className = 'mic-button-floating streaming';
      this.micIcon.classList.add('hidden');
      this.stopIcon.classList.remove('hidden');
      this.streamStatusLabel.textContent = '실시간 통역 중... (터치하여 중지)';
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
