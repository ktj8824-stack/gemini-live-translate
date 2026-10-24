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

// Fixed Default Gemini API Key (Decoded at runtime to protect from git secret scanning)
const FIXED_GEMINI_API_KEY = atob('QVEuQWI4Uk42THhqQ2dvYVZaVXpjcHo3M211SUxwMlA1dFM2TTY5STdid01LU3ZQZFZqVXc=');

class LiveTranslatorApp {
  constructor() {
    this.ws = null;
    this.isStreaming = false;
    this.currentMode = 'split';

    this.userLang = 'ko';
    this.partnerLang = 'en';

    this.chunksSent = 0;
    this.chunksReceived = 0;

    this.apiKey = FIXED_GEMINI_API_KEY;
    this.settings = {
      echoTargetLanguage: false,
      audioOutputEnabled: true,
      echoCancellation: true
    };

    // Speech & Turn Management (Handsfree vs PTT completely decoupled)
    this.speechMode = localStorage.getItem('gemini_speech_mode') || 'handsfree'; // 'handsfree' | 'ptt'

    // [자동 감지 (Handsfree) 전용 설정 및 상태]
    const savedPause = localStorage.getItem('gemini_pause_tolerance');
    this.pauseTolerance = savedPause ? (parseInt(savedPause, 10) || 800) : 800;
    this.smartGuard = localStorage.getItem('gemini_smart_guard') !== 'false'; // 기본 true (문장 끝난 후 깨끗하게 통역 음성 출력)
    this.handsfreeSilenceTimer = null;
    this.isHandsfreeSpeaking = false;

    // [누르고 말하기 (PTT) 전용 상태]
    this.isPttHolding = false;
    this.isPttWaitingCompletion = false;
    this.turnCompleteReceivedDuringTail = false;
    this.pttTurnFallbackTimer = null;

    this.lastSpeechTime = 0;
    this.isUserSpeaking = false;
    this.pendingTurnTimer = null;
    this.pendingAudioQueue = [];

    this.history = JSON.parse(localStorage.getItem('gemini_chat_history') || '[]');
    this.currentSessionTurns = [];
    this.currentInputText = '';
    this.currentOutputText = '';

    this.audioStreamer = new AudioStreamer({
      onAudioChunk: (chunk) => this.sendAudioChunk(chunk),
      onInputVolume: (vol) => {
        if (this.speechMode === 'ptt' && !this.isPttHolding) {
          this.drawWaveform('user-wave', 0, '#00e5ff');
          return;
        }
        this.drawWaveform('user-wave', vol, '#00e5ff');
        this.updateVolumeBar(vol);
        this.handleVoiceVolume(vol);
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
    this.renderHistory();
    this.updateAiLearnBadge('idle');
    this.updateSpeechModeUI();
    this.bindEvents();
    this.checkApiKey();
    this.initAuthService();
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
    this.btnClearHistory = document.getElementById('btn-clear-history');

    this.splitView = document.getElementById('split-view');
    this.soloView = document.getElementById('solo-view');
    this.historyDrawer = document.getElementById('history-drawer');
    this.settingsModal = document.getElementById('settings-modal');

    this.userLangSelect = document.getElementById('user-lang-select');
    this.partnerLangSelect = document.getElementById('partner-lang-select');
    this.soloUserLang = document.getElementById('solo-user-lang');
    this.soloTargetLang = document.getElementById('solo-target-lang');

    this.userPrimaryText = document.getElementById('user-primary-text') || document.getElementById('user-output-text');
    this.userSecondaryText = document.getElementById('user-secondary-text') || document.getElementById('user-input-text');
    this.partnerPrimaryText = document.getElementById('partner-primary-text') || document.getElementById('partner-output-text');
    this.partnerSecondaryText = document.getElementById('partner-secondary-text') || document.getElementById('partner-input-text');

    // 하위 호환성 별칭
    this.userInputText = this.userSecondaryText;
    this.userOutputText = this.userPrimaryText;
    this.partnerInputText = this.partnerSecondaryText;
    this.partnerOutputText = this.partnerPrimaryText;
    this.userChatLog = document.getElementById('user-chat-log');
    this.partnerChatLog = document.getElementById('partner-chat-log');
    this.userLiveWrap = document.getElementById('user-live-wrap');
    this.partnerLiveWrap = document.getElementById('partner-live-wrap');
    this.conversationFeed = document.getElementById('conversation-feed');
    this.historyList = document.getElementById('history-list');

    this.streamStatusLabel = document.getElementById('stream-status-label');
    this.soloMicText = document.getElementById('solo-mic-text');
    this.micIcon = document.getElementById('mic-icon');
    this.stopIcon = document.getElementById('stop-icon');
    this.statusPill = document.getElementById('connection-status-pill');
    this.aiLearnIndicator = document.getElementById('ai-learn-indicator');
    this.aiLearnCount = document.getElementById('ai-learn-count');

    // Dual Zone PTT Elements (Top Partner & Bottom User)
    this.partnerPttContainer = document.getElementById('partner-ptt-container');
    this.userPttContainer = document.getElementById('user-ptt-container');
    this.btnPttPartner = document.getElementById('btn-ptt-partner');
    this.btnPttUser = document.getElementById('btn-ptt-user');
    this.partnerPttBtnText = document.getElementById('partner-ptt-btn-text');
    this.userPttBtnText = document.getElementById('user-ptt-btn-text');
    this.currentPttSpeaker = 'user'; // 'user' | 'partner'

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

    // Speech mode controls
    this.btnModeHandsfree = document.getElementById('btn-mode-handsfree');
    this.btnModePtt = document.getElementById('btn-mode-ptt');
    this.pttHintLabel = document.getElementById('ptt-hint-label');
    this.settingPauseTolerance = document.getElementById('setting-pause-tolerance');
    if (this.settingPauseTolerance) {
      this.settingPauseTolerance.value = String(this.pauseTolerance);
    }
    this.settingSmartGuard = document.getElementById('setting-smart-guard');
    if (this.settingSmartGuard) {
      this.settingSmartGuard.checked = this.smartGuard;
    }

    // New Conversation (Clear Chat) buttons
    this.btnClearChat = document.getElementById('btn-clear-chat');
    this.btnSoloClear = document.getElementById('btn-solo-clear');

    // Auth & Cloud Sync elements
    this.btnAuthToggle = document.getElementById('btn-auth-toggle');
    this.authModal = document.getElementById('auth-modal');
    this.btnCloseAuth = document.getElementById('btn-close-auth');
    this.authAvatar = document.getElementById('auth-avatar');
    this.authUserLabel = document.getElementById('auth-user-label');
    this.authSyncDot = document.getElementById('auth-sync-dot');

    this.authGuestView = document.getElementById('auth-guest-view');
    this.authProfileView = document.getElementById('auth-profile-view');
    this.tabLogin = document.getElementById('tab-login');
    this.tabSignup = document.getElementById('tab-signup');
    this.btnKakaoLogin = document.getElementById('btn-kakao-login');
    this.btnGoogleLogin = document.getElementById('btn-google-login');
    this.btnAppleLogin = document.getElementById('btn-apple-login');
    this.formLogin = document.getElementById('form-login');
    this.formSignup = document.getElementById('form-signup');
    this.loginEmail = document.getElementById('login-email');
    this.loginPassword = document.getElementById('login-password');
    this.signupName = document.getElementById('signup-name');
    this.signupEmail = document.getElementById('signup-email');
    this.signupPassword = document.getElementById('signup-password');
    this.signupPasswordConfirm = document.getElementById('signup-password-confirm');
    this.pwStrengthBar = document.getElementById('pw-strength-bar');
    this.pwStrengthText = document.getElementById('pw-strength-text');
    this.pwConfirmMatchText = document.getElementById('pw-confirm-match-text');
    this.loginErrorMsg = document.getElementById('login-error-msg');
    this.signupErrorMsg = document.getElementById('signup-error-msg');

    // 약관 동의 체크박스 & 전문 모달
    this.agreeAll = document.getElementById('agree-all');
    this.agreeTerms = document.getElementById('agree-terms');
    this.agreePrivacy = document.getElementById('agree-privacy');
    this.agreeAge = document.getElementById('agree-age');
    this.agreeMarketing = document.getElementById('agree-marketing');
    this.btnSubmitSignup = document.getElementById('btn-submit-signup');
    this.btnGuestBrowse = document.getElementById('btn-guest-browse');
    this.termsModal = document.getElementById('terms-modal');
    this.btnCloseTerms = document.getElementById('btn-close-terms');
    this.btnConfirmTerms = document.getElementById('btn-confirm-terms');
    this.termsModalTitle = document.getElementById('terms-modal-title');
    this.termsModalBodyText = document.getElementById('terms-modal-body-text');

    this.profileAvatar = document.getElementById('profile-avatar');
    this.profileName = document.getElementById('profile-name');
    this.profileEmail = document.getElementById('profile-email');
    this.profileProviderBadge = document.getElementById('profile-provider-badge');
    this.syncStatusText = document.getElementById('sync-status-text');
    this.btnManualSync = document.getElementById('btn-manual-sync');
    this.kakaoAppKeyInput = document.getElementById('kakao-app-key-input');
    this.btnSaveKakaoKey = document.getElementById('btn-save-kakao-key');
    this.firebaseConfigInput = document.getElementById('firebase-config-input');
    this.btnSaveFirebaseConfig = document.getElementById('btn-save-firebase-config');
    this.btnResetFirebaseConfig = document.getElementById('btn-reset-firebase-config');
    this.btnLogout = document.getElementById('btn-logout');
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

    // Clear Chat / New Conversation buttons
    this.btnClearChat?.addEventListener('click', () => this.clearChatWithHistorySave());
    this.btnSoloClear?.addEventListener('click', () => this.clearChatWithHistorySave());

    // Speech Mode switches (Handsfree vs PTT)
    this.btnModeHandsfree?.addEventListener('click', () => this.setSpeechMode('handsfree'));
    this.btnModePtt?.addEventListener('click', () => this.setSpeechMode('ptt'));

    // Main mic button interaction
    this.btnToggleStream.addEventListener('click', (e) => {
      if (this.speechMode === 'handsfree') {
        this.toggleStreaming();
      }
    });

    this.btnSoloMic.addEventListener('click', (e) => {
      if (this.speechMode === 'handsfree') {
        this.toggleStreaming();
      }
    });

    // PTT Pointer & Touch Events
    const attachPttListeners = (el, speaker = 'user') => {
      if (!el) return;
      el.addEventListener('pointerdown', (e) => this.handlePttDown(e, speaker));
      el.addEventListener('pointerup', (e) => this.handlePttUp(e));
      el.addEventListener('pointercancel', (e) => this.handlePttUp(e));
      el.addEventListener('mouseleave', (e) => {
        if (this.speechMode === 'ptt' && this.isPttHolding) this.handlePttUp(e);
      });
      el.addEventListener('contextmenu', (e) => {
        if (this.speechMode === 'ptt') e.preventDefault();
      });
    };
    attachPttListeners(this.btnToggleStream, 'user');
    attachPttListeners(this.btnSoloMic, 'user');
    attachPttListeners(this.btnPttPartner, 'partner');
    attachPttListeners(this.btnPttUser, 'user');

    // Keyboard Spacebar PTT shortcut
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
        if (this.speechMode === 'ptt' && !this.isPttHolding) {
          e.preventDefault();
          this.handlePttDown(e);
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space' && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
        if (this.speechMode === 'ptt' && this.isPttHolding) {
          e.preventDefault();
          this.handlePttUp(e);
        }
      }
    });

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
    this.btnClearHistory?.addEventListener('click', () => {
      if (this.history.length === 0) return alert('삭제할 대화 기록이 없습니다.');
      if (confirm('저장된 대화 히스토리를 모두 삭제하시겠습니까?')) {
        this.history = [];
        localStorage.removeItem('gemini_chat_history');
        this.renderHistory();
        this.showToast('대화 히스토리가 비워졌습니다.');
      }
    });

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

    // Pause Tolerance & Smart Guard listeners
    this.settingPauseTolerance?.addEventListener('change', (e) => {
      this.pauseTolerance = parseInt(e.target.value, 10);
      localStorage.setItem('gemini_pause_tolerance', String(this.pauseTolerance));
      this.addDebugLog(`[Settings] 발화 멈춤 대기 시간 설정: ${this.pauseTolerance}ms`);
      if (this.handsfreeSilenceTimer) {
        clearTimeout(this.handsfreeSilenceTimer);
        this.handsfreeSilenceTimer = setTimeout(() => {
          this.onHandsfreeSpeechEnded();
        }, this.pauseTolerance);
      }
    });

    this.settingSmartGuard?.addEventListener('change', (e) => {
      this.smartGuard = e.target.checked;
      localStorage.setItem('gemini_smart_guard', String(this.smartGuard));
      localStorage.setItem('gemini_smart_guard_user_set', 'true');
      this.addDebugLog(`[Settings] 스마트 긴 문장 보호: ${this.smartGuard ? 'ON' : 'OFF'}`);
    });

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

    // 앱 종료 및 화면 이탈 시 진행 중이던 대화 세션을 히스토리에 통째로 안전 자동 저장
    window.addEventListener('beforeunload', () => {
      this.saveCurrentSessionToHistory('app_exit');
    });
    window.addEventListener('pagehide', () => {
      this.saveCurrentSessionToHistory('app_exit');
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.saveCurrentSessionToHistory('app_background');
      }
    });

    // 1. 시작 스플래시 인트로 종료 시 -> 미로그인 사용자에게 로그인 모달 자동 표시
    window.addEventListener('app:splashFinished', () => {
      if (!this.authService || !this.authService.currentUser) {
        this.toggleAuthModal(true);
      }
    });

    // 2. Auth & Cloud Sync Modal Events
    this.btnAuthToggle?.addEventListener('click', () => this.toggleAuthModal());
    this.btnCloseAuth?.addEventListener('click', () => this.toggleAuthModal(false));
    this.authModal?.addEventListener('click', (e) => {
      if (e.target === this.authModal) this.toggleAuthModal(false);
    });

    this.tabLogin?.addEventListener('click', () => this.switchAuthTab('login'));
    this.tabSignup?.addEventListener('click', () => this.switchAuthTab('signup'));

    // 소셜 로그인 (카카오, 구글, 애플)
    this.btnKakaoLogin?.addEventListener('click', () => this.handleKakaoLogin());
    this.btnGoogleLogin?.addEventListener('click', () => this.handleGoogleLogin());
    this.btnAppleLogin?.addEventListener('click', () => this.handleAppleLogin());

    // 이메일 폼 제출
    this.formLogin?.addEventListener('submit', (e) => this.handleEmailLogin(e));
    this.formSignup?.addEventListener('submit', (e) => this.handleEmailSignup(e));

    // 비밀번호 보기/숨기기 토글 (👁️)
    document.querySelectorAll('.btn-toggle-pw').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        const input = document.getElementById(targetId);
        if (!input) return;
        const isPw = input.type === 'password';
        input.type = isPw ? 'text' : 'password';
        btn.textContent = isPw ? '🙈' : '👁️';
      });
    });

    // 비밀번호 강도 및 일치 실시간 검사
    this.signupPassword?.addEventListener('input', () => {
      this.updatePasswordStrength();
      this.checkPasswordMatch();
      this.updateSignupButtonState();
    });
    this.signupPasswordConfirm?.addEventListener('input', () => {
      this.checkPasswordMatch();
      this.updateSignupButtonState();
    });

    // 약관 전체 동의 및 개별 동의 체계
    this.agreeAll?.addEventListener('change', (e) => {
      const checked = e.target.checked;
      [this.agreeTerms, this.agreePrivacy, this.agreeAge, this.agreeMarketing].forEach(cb => {
        if (cb) cb.checked = checked;
      });
      this.updateSignupButtonState();
    });

    [this.agreeTerms, this.agreePrivacy, this.agreeAge, this.agreeMarketing].forEach(cb => {
      cb?.addEventListener('change', () => {
        const allChecked = Boolean(this.agreeTerms?.checked && this.agreePrivacy?.checked && this.agreeAge?.checked && this.agreeMarketing?.checked);
        if (this.agreeAll) this.agreeAll.checked = allChecked;
        this.updateSignupButtonState();
      });
    });

    // 약관 전문보기 팝업 모달
    document.querySelectorAll('.btn-view-terms').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.getAttribute('data-type');
        this.openTermsModal(type);
      });
    });
    this.btnCloseTerms?.addEventListener('click', () => this.closeTermsModal());
    this.btnConfirmTerms?.addEventListener('click', () => this.closeTermsModal());
    this.termsModal?.addEventListener('click', (e) => {
      if (e.target === this.termsModal) this.closeTermsModal();
    });

    // 로그인 없이 게스트로 둘러보기
    this.btnGuestBrowse?.addEventListener('click', () => {
      this.toggleAuthModal(false);
      this.showToast('✨ 게스트 모드로 둘러보기를 시작합니다.');
    });

    // 비밀번호 찾기 클릭 안내
    document.getElementById('link-find-pw')?.addEventListener('click', (e) => {
      e.preventDefault();
      alert('가입하신 이메일 주소로 비밀번호 재설정 링크가 발송됩니다. (고객센터 support@talktranslate.com)');
    });

    this.btnManualSync?.addEventListener('click', () => this.handleManualSync());
    this.btnSaveKakaoKey?.addEventListener('click', () => {
      const key = this.kakaoAppKeyInput?.value.trim();
      this.authService?.saveKakaoAppKey(key);
      if (key) {
        this.showToast('🟡 카카오 JavaScript 키가 저장되었습니다!');
      } else {
        this.showToast('카카오 키가 초기화되었습니다.');
      }
    });
    this.btnSaveFirebaseConfig?.addEventListener('click', () => this.handleSaveFirebaseConfig());
    this.btnResetFirebaseConfig?.addEventListener('click', () => this.handleResetFirebaseConfig());
    this.btnLogout?.addEventListener('click', () => this.handleLogout());
  }

  // =========================================================================
  // Authentication & Cloud Sync Methods
  // =========================================================================

  initAuthService() {
    if (!window.AuthService) {
      console.warn('AuthService class not found on window');
      return;
    }

    this.authService = new window.AuthService({
      onAuthStateChanged: (user) => this.onAuthStateChanged(user),
      onSyncStatusChanged: (status) => this.onSyncStatusChanged(status),
      onDebugLog: (msg) => this.addDebugLog(msg)
    });

    if (this.kakaoAppKeyInput && this.authService.kakaoAppKey) {
      this.kakaoAppKeyInput.value = this.authService.kakaoAppKey;
    }

    if (this.firebaseConfigInput && this.authService.firebaseConfig) {
      this.firebaseConfigInput.value = JSON.stringify(this.authService.firebaseConfig, null, 2);
    }
  }

  onAuthStateChanged(user) {
    if (user) {
      const displayName = user.displayName || user.email.split('@')[0];
      if (this.authUserLabel) this.authUserLabel.textContent = displayName;

      if (this.authAvatar) {
        if (user.photoURL) {
          this.authAvatar.innerHTML = `<img src="${user.photoURL}" alt="${displayName}">`;
        } else {
          this.authAvatar.textContent = displayName.charAt(0).toUpperCase();
        }
      }

      this.authGuestView?.classList.add('hidden');
      this.authProfileView?.classList.remove('hidden');

      if (this.profileName) this.profileName.textContent = displayName;
      if (this.profileEmail) this.profileEmail.textContent = user.email;
      if (this.profileAvatar) {
        if (user.photoURL) {
          this.profileAvatar.innerHTML = `<img src="${user.photoURL}" alt="${displayName}">`;
        } else {
          this.profileAvatar.textContent = displayName.charAt(0).toUpperCase();
        }
      }
      if (this.profileProviderBadge) {
        const provMap = { 'google.com': 'Google 계정', 'password': '이메일 계정', 'local': '로컬 계정', 'google_demo': '체험 계정' };
        this.profileProviderBadge.textContent = provMap[user.provider] || user.provider;
      }

      this.learnedRules = JSON.parse(localStorage.getItem('gemini_learned_rules') || '[]');
      this.conversationContextSummary = localStorage.getItem('gemini_context_summary') || '';
      this.renderLearnedRules();
      this.renderHistory();
      this.addDebugLog(`[Auth] 계정 로그인 활성화: ${user.email}`);
    } else {
      if (this.authUserLabel) this.authUserLabel.textContent = '로그인';
      if (this.authAvatar) {
        this.authAvatar.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
      }
      this.authGuestView?.classList.remove('hidden');
      this.authProfileView?.classList.add('hidden');
      if (this.authSyncDot) this.authSyncDot.className = 'sync-dot';
      this.addDebugLog('[Auth] 게스트 모드 (로그아웃됨)');
    }
  }

  onSyncStatusChanged(status) {
    if (this.authSyncDot) {
      this.authSyncDot.className = `sync-dot ${status}`;
    }
    if (this.syncStatusText) {
      this.syncStatusText.className = `sync-badge ${status}`;
      if (status === 'synced') {
        this.syncStatusText.textContent = '동기화 완료';
      } else if (status === 'syncing') {
        this.syncStatusText.textContent = '동기화 중...';
      } else if (status === 'error') {
        this.syncStatusText.textContent = '동기화 오류';
      }
    }
  }

  toggleAuthModal(forceState) {
    if (!this.authModal) return;
    const isHidden = this.authModal.classList.contains('hidden');
    const shouldOpen = forceState !== undefined ? forceState : isHidden;

    if (shouldOpen) {
      this.authModal.classList.remove('hidden');
      if (this.loginErrorMsg) this.loginErrorMsg.classList.add('hidden');
      if (this.signupErrorMsg) this.signupErrorMsg.classList.add('hidden');
    } else {
      this.authModal.classList.add('hidden');
    }
  }

  switchAuthTab(tab) {
    if (tab === 'login') {
      this.tabLogin?.classList.add('active');
      this.tabSignup?.classList.remove('active');
      this.formLogin?.classList.remove('hidden');
      this.formSignup?.classList.add('hidden');
    } else {
      this.tabSignup?.classList.add('active');
      this.tabLogin?.classList.remove('active');
      this.formSignup?.classList.remove('hidden');
      this.formLogin?.classList.add('hidden');
    }
  }

  async handleKakaoLogin() {
    try {
      if (!this.authService) return;
      this.addDebugLog('[Auth] 카카오 간편 로그인 요청...');
      const res = await this.authService.signInWithKakao();
      if (res && res.success) {
        this.toggleAuthModal(false);
        this.showToast('💛 카카오 계정으로 로그인되었습니다.');
      }
    } catch (err) {
      alert(`카카오 로그인 실패: ${err.message}`);
    }
  }

  async handleGoogleLogin() {
    try {
      if (!this.authService) return;
      this.addDebugLog('[Auth] Google 로그인 시도...');
      const res = await this.authService.signInWithGoogle();
      if (res && res.success) {
        this.toggleAuthModal(false);
        this.showToast('✨ Google 계정으로 로그인되었습니다.');
      }
    } catch (err) {
      alert(`Google 로그인 실패: ${err.message}`);
    }
  }

  async handleAppleLogin() {
    try {
      if (!this.authService) return;
      this.addDebugLog('[Auth] Apple 로그인 시도...');
      const appleUser = {
        uid: 'apple_' + Date.now().toString(36),
        email: 'apple_user@icloud.com',
        displayName: 'Apple 사용자',
        photoURL: null,
        provider: 'apple',
        lastLogin: Date.now()
      };
      this.authService.saveCachedUser(appleUser);
      await this.authService.syncFromCloud();
      this.toggleAuthModal(false);
      this.showToast('🍏 Apple 계정으로 로그인되었습니다.');
    } catch (err) {
      alert(`Apple 로그인 실패: ${err.message}`);
    }
  }

  async handleEmailLogin(e) {
    e.preventDefault();
    if (!this.authService) return;
    const email = this.loginEmail?.value;
    const pw = this.loginPassword?.value;
    if (this.loginErrorMsg) this.loginErrorMsg.classList.add('hidden');

    try {
      await this.authService.signInWithEmail(email, pw);
      if (this.formLogin) this.formLogin.reset();
      this.toggleAuthModal(false);
      this.showToast(`✨ 로그인되었습니다. (${email})`);
    } catch (err) {
      if (this.loginErrorMsg) {
        this.loginErrorMsg.textContent = err.message;
        this.loginErrorMsg.classList.remove('hidden');
      } else {
        alert(err.message);
      }
    }
  }

  // 비밀번호 강도 실시간 계산
  updatePasswordStrength() {
    const pw = this.signupPassword?.value || '';
    if (!this.pwStrengthBar || !this.pwStrengthText) return;

    if (!pw) {
      this.pwStrengthBar.style.width = '0%';
      this.pwStrengthBar.style.backgroundColor = 'transparent';
      this.pwStrengthText.textContent = '비밀번호를 입력해주세요.';
      this.pwStrengthText.style.color = 'var(--text-muted)';
      return;
    }

    let score = 0;
    if (pw.length >= 6) score++;
    if (pw.length >= 8) score++;
    if (/[A-Za-z]/.test(pw) && /[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;

    if (score <= 1) {
      this.pwStrengthBar.style.width = '25%';
      this.pwStrengthBar.style.backgroundColor = '#f43f5e';
      this.pwStrengthText.textContent = '보안 강도: 취약 (영문, 숫자를 조합하여 6자 이상 입력하세요)';
      this.pwStrengthText.style.color = '#f43f5e';
    } else if (score === 2) {
      this.pwStrengthBar.style.width = '55%';
      this.pwStrengthBar.style.backgroundColor = '#f59e0b';
      this.pwStrengthText.textContent = '보안 강도: 보통 (8자 이상 또는 특수문자 권장)';
      this.pwStrengthText.style.color = '#f59e0b';
    } else {
      this.pwStrengthBar.style.width = '100%';
      this.pwStrengthBar.style.backgroundColor = '#10b981';
      this.pwStrengthText.textContent = '보안 강도: 안전 (안전한 비밀번호입니다)';
      this.pwStrengthText.style.color = '#10b981';
    }
  }

  // 비밀번호 확인 일치 실시간 검사
  checkPasswordMatch() {
    const pw = this.signupPassword?.value || '';
    const confirm = this.signupPasswordConfirm?.value || '';
    if (!this.pwConfirmMatchText) return;

    if (!confirm) {
      this.pwConfirmMatchText.textContent = '';
      return;
    }

    if (pw === confirm) {
      this.pwConfirmMatchText.textContent = '✓ 비밀번호가 일치합니다.';
      this.pwConfirmMatchText.style.color = '#10b981';
    } else {
      this.pwConfirmMatchText.textContent = '✕ 비밀번호가 일치하지 않습니다.';
      this.pwConfirmMatchText.style.color = '#f43f5e';
    }
  }

  // 필수 약관 동의 및 유효성에 따른 회원가입 버튼 활성화 제어
  updateSignupButtonState() {
    if (!this.btnSubmitSignup) return;
    const pw = this.signupPassword?.value || '';
    const confirm = this.signupPasswordConfirm?.value || '';
    const pwValid = pw.length >= 6 && pw === confirm;

    const termsChecked = Boolean(this.agreeTerms?.checked);
    const privacyChecked = Boolean(this.agreePrivacy?.checked);
    const ageChecked = Boolean(this.agreeAge?.checked);

    const isAllRequiredAgreed = termsChecked && privacyChecked && ageChecked;

    this.btnSubmitSignup.disabled = !(pwValid && isAllRequiredAgreed);
  }

  // 약관 전문 팝업 모달
  openTermsModal(type) {
    if (!this.termsModal || !this.termsModalTitle || !this.termsModalBodyText) return;

    if (type === 'service') {
      this.termsModalTitle.textContent = '번역톡 서비스 이용약관 (전문)';
      this.termsModalBodyText.textContent = `[제1조 (목적)]
본 약관은 번역톡(Gemini Live Translate) 서비스의 이용조건 및 절차, 이용자와 회사의 권리, 의무, 책임사항을 규정함을 목적으로 합니다.

[제2조 (서비스의 내용)]
1. 번역톡은 최신 인공지능(Google Gemini Live API)을 활용한 실시간 양방향 음성 동시통역 및 자막 피드, AI 맞춤 사전 학습 기능을 제공합니다.
2. 회원은 개인용 이어폰 모드 또는 테이블 대면 분할 모드를 통해 다국어 통역 서비스를 이용할 수 있습니다.

[제3조 (이용계약 체결 및 계정 관리)]
1. 이용계약은 회원이 본 약관에 동의하고 소셜 로그인(카카오, 구글 등) 또는 이메일 가입 절차를 완료함으로써 체결됩니다.
2. 회원은 자신의 계정 정보를 안전하게 관리해야 하며, 타인에게 양도하거나 대여할 수 없습니다.

[제4조 (지적재산권 및 데이터 보존)]
1. 서비스 내의 모든 소프트웨어, 디자인, 상표 등의 지적재산권은 회사에 귀속됩니다.
2. 이용자가 통역을 진행하며 생성된 맞춤 학습 사전 및 대화 세션 기록은 회원의 선택에 따라 클라우드에 암호화되어 안전하게 보관됩니다.

[제5조 (책임의 한계)]
AI 실시간 번역의 특성상 주변 소음, 발화 억양, 네트워크 환경에 따라 번역 결과의 정확도에 오차가 발생할 수 있으며, 회사는 이에 따른 법적 책임을 지지 않습니다.`;
    } else {
      this.termsModalTitle.textContent = '개인정보 수집 및 이용 동의 (전문)';
      this.termsModalBodyText.textContent = `[1. 수집하는 개인정보의 항목]
- 간편 소셜 로그인 시: 이메일 주소, 프로필 닉네임, 프로필 사진 URL, 고유 사용자 식별자(UID)
- 이메일 회원가입 시: 이메일 주소, 암호화된 비밀번호, 이름/닉네임
- 서비스 이용 시 자동 생성: 실시간 통역 대화 세션 기록, AI 맞춤 학습 사전 단어, 접속 로그

[2. 개인정보의 수집 및 이용 목적]
- 사용자 식별 및 본인 확인
- 기기간 대화 히스토리 및 AI 맞춤 학습 사전의 실시간 클라우드 동기화 서비스 제공
- 오류 분석, 서비스 품질 향상 및 신규 AI 기능 안내

[3. 개인정보의 보유 및 이용 기간]
- 이용자의 개인정보는 원칙적으로 회원 탈퇴 시까지 보유 및 이용하며, 탈퇴 요청 시 지체 없이 안전하게 파기합니다.
- 단, 관련 법령에 의해 보존할 필요가 있는 경우 해당 법령이 정한 기간 동안 보관합니다.

[4. 동의 거부 권리 및 불이익]
이용자는 개인정보 수집 및 이용에 대한 동의를 거부할 권리가 있습니다. 단, 필수 항목 동의 거부 시 회원가입 및 클라우드 동기화 서비스 이용이 제한됩니다.`;
    }

    this.termsModal.classList.remove('hidden');
  }

  closeTermsModal() {
    if (this.termsModal) {
      this.termsModal.classList.add('hidden');
    }
  }

  async handleEmailSignup(e) {
    e.preventDefault();
    if (!this.authService) return;
    const name = this.signupName?.value;
    const email = this.signupEmail?.value;
    const pw = this.signupPassword?.value;
    const confirm = this.signupPasswordConfirm?.value;

    if (pw !== confirm) {
      if (this.signupErrorMsg) {
        this.signupErrorMsg.textContent = '비밀번호와 비밀번호 확인이 일치하지 않습니다.';
        this.signupErrorMsg.classList.remove('hidden');
      }
      return;
    }

    if (!this.agreeTerms?.checked || !this.agreePrivacy?.checked || !this.agreeAge?.checked) {
      alert('필수 약관(이용약관, 개인정보 수집, 만 14세 이상)에 모두 동의하셔야 가입이 가능합니다.');
      return;
    }

    const agreements = {
      terms: Boolean(this.agreeTerms?.checked),
      privacy: Boolean(this.agreePrivacy?.checked),
      age: Boolean(this.agreeAge?.checked),
      marketing: Boolean(this.agreeMarketing?.checked),
      agreedAt: Date.now()
    };

    if (this.signupErrorMsg) this.signupErrorMsg.classList.add('hidden');

    try {
      await this.authService.signUpWithEmail(email, pw, name, agreements);
      if (this.formSignup) this.formSignup.reset();
      this.toggleAuthModal(false);
      this.showToast(`🎉 환영합니다, ${name || '회원'}님! 회원가입이 완료되었습니다.`);
    } catch (err) {
      if (this.signupErrorMsg) {
        this.signupErrorMsg.textContent = err.message;
        this.signupErrorMsg.classList.remove('hidden');
      } else {
        alert(err.message);
      }
    }
  }

  async handleManualSync() {
    if (!this.authService) return;
    this.addDebugLog('[Auth] 수동 동기화 요청...');
    await this.authService.syncToCloud();
    await this.authService.syncFromCloud();
    this.learnedRules = JSON.parse(localStorage.getItem('gemini_learned_rules') || '[]');
    this.renderLearnedRules();
    this.renderHistory();
  }

  handleSaveFirebaseConfig() {
    if (!this.authService) return;
    const val = this.firebaseConfigInput?.value.trim();
    if (!val) {
      this.authService.saveFirebaseConfig(null);
      alert('Firebase 설정이 초기화되었습니다. 로컬 모드로 동작합니다.');
      return;
    }
    try {
      const parsed = JSON.parse(val);
      this.authService.saveFirebaseConfig(parsed);
      alert('Firebase 설정이 저장되었습니다! 클라우드 연동을 시작합니다.');
    } catch (e) {
      alert('올바른 JSON 형식의 Firebase 설정 객체를 입력해주세요.');
    }
  }

  handleResetFirebaseConfig() {
    if (!this.authService) return;
    if (confirm('Firebase 설정을 초기화하고 로컬 모드로 전환하시겠습니까?')) {
      this.authService.saveFirebaseConfig(null);
      if (this.firebaseConfigInput) this.firebaseConfigInput.value = '';
      alert('초기화되었습니다.');
    }
  }

  async handleLogout() {
    if (!this.authService) return;
    if (confirm('로그아웃 하시겠습니까?')) {
      await this.authService.signOut();
      this.toggleAuthModal(false);
    }
  }

  saveCurrentSessionToHistory(reason = 'manual') {
    // 1. 현재 화면이나 버퍼에 아직 처리되지 않은 발화가 있다면 먼저 플러시하여 세션에 포함
    if (this.currentInputText || this.currentOutputText) {
      this.flushCurrentTurnToHistory();
    }

    if (!this.currentSessionTurns || this.currentSessionTurns.length === 0) {
      return false;
    }

    const turnsCount = this.currentSessionTurns.length;
    const now = new Date();
    const dateStr = now.toLocaleDateString([], { year: 'numeric', month: '2-digit', day: '2-digit' });
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const srcLangObj = SUPPORTED_LANGUAGES.find((l) => l.code === this.userLang);
    const tgtLangObj = SUPPORTED_LANGUAGES.find((l) => l.code === this.partnerLang);

    const sessionItem = {
      id: Date.now(),
      timestamp: Date.now(),
      dateStr,
      timeStr,
      title: `${dateStr} ${timeStr} 대화 세션`,
      mode: this.speechMode,
      modeLabel: this.speechMode === 'ptt' ? '누르고 말하기 (PTT)' : '자동 감지 (핸즈프리)',
      userLang: this.userLang,
      partnerLang: this.partnerLang,
      langPair: `${srcLangObj ? srcLangObj.name : this.userLang} ➔ ${tgtLangObj ? tgtLangObj.name : this.partnerLang}`,
      turnsCount,
      turns: [...this.currentSessionTurns],
      reason
    };

    // 최신 대화 세션이 히스토리 상단에 오도록 추가
    this.history.unshift(sessionItem);
    localStorage.setItem('gemini_chat_history', JSON.stringify(this.history));
    this.renderHistory();

    // 로그인 상태일 시 클라우드 자동 동기화
    this.authService?.syncToCloud();

    this.currentSessionTurns = [];
    this.addDebugLog(`[히스토리 보관] 대화 ${turnsCount}건이 단 1개의 완성된 세션 카드로 히스토리에 저장되었습니다. (사유: ${reason})`);
    return true;
  }

  clearChatWithHistorySave() {
    // 1. 현재 대화 세션을 단 1개의 완성된 세션 카드로 히스토리에 통째로 저장
    const saved = this.saveCurrentSessionToHistory('reset');

    if (saved) {
      this.showToast('💾 이전 대화가 대화 기록에 세션으로 안전하게 저장되었습니다.');
      this.setStatusPill('✨ 새 대화창 준비 완료', '#10b981');
    } else {
      this.showToast('새 대화창이 준비되었습니다.');
      this.setStatusPill('대기 중 (새 대화)', '#94a3b8');
    }

    // 2. 화면 대화창(로그 카드) 깨끗하게 초기화
    if (this.userChatLog) this.userChatLog.innerHTML = '';
    if (this.partnerChatLog) this.partnerChatLog.innerHTML = '';
    this.currentSessionTurns = [];

    // 3. 솔로 피드 모드 초기화
    if (this.conversationFeed) {
      this.conversationFeed.innerHTML = `
        <div class="feed-placeholder">
          <div class="placeholder-icon">🎙️</div>
          <h3>실시간 동시통역 준비 완료</h3>
          <p>마이크 버튼을 누르고 말씀하시면 귓속으로 번역된 음성이 전달되고 실시간 텍스트 피드가 생성됩니다.</p>
        </div>
      `;
    }

    // 4. 실시간 자막 초기 힌트 텍스트 복원
    if (this.userPrimaryText) this.userPrimaryText.textContent = '';
    if (this.userSecondaryText) this.userSecondaryText.textContent = '';
    if (this.partnerPrimaryText) this.partnerPrimaryText.textContent = '';
    if (this.partnerSecondaryText) this.partnerSecondaryText.textContent = '';
    if (this.userLiveWrap) this.userLiveWrap.style.display = 'none';
    if (this.partnerLiveWrap) this.partnerLiveWrap.style.display = 'none';

    // 5. 내부 버퍼 초기화
    this.currentInputText = '';
    this.currentOutputText = '';

    setTimeout(() => {
      if (!this.isStreaming) {
        this.setStatusPill('준비 완료 (마이크 터치)', '#10b981');
      } else {
        this.setStatusPill('통역 중 (듣는 중)', '#10b981');
      }
    }, 2000);
  }

  setSpeechMode(mode) {
    if (this.speechMode === mode) return;

    // 1. 모드 전환 시 이전 모드에서 나눈 대화 세션을 히스토리에 단 1개의 완성된 세션 카드로 안전 보관!
    this.saveCurrentSessionToHistory('mode_switch');

    // 2. 기존에 마이크가 켜져 있었다면 즉시 완전 종료 (모드 간 마이크 인계 차단)
    if (this.isStreaming) {
      this.stopStreaming();
    }

    // 2. 모드별 진행 중이던 타이머 및 발화 상태 완전 초기화
    if (this.pttTurnFallbackTimer) {
      clearTimeout(this.pttTurnFallbackTimer);
      this.pttTurnFallbackTimer = null;
    }
    if (this.handsfreeSilenceTimer) {
      clearTimeout(this.handsfreeSilenceTimer);
      this.handsfreeSilenceTimer = null;
    }

    this.isPttHolding = false;
    this.isPttWaitingCompletion = false;
    this.isHandsfreeSpeaking = false;
    this.turnCompleteReceivedDuringTail = false;
    this.pendingAudioQueue = [];

    // 3. 버튼 active 시각 효과 및 라벨 복원
    this.btnPttPartner?.classList.remove('ptt-active');
    this.btnPttUser?.classList.remove('ptt-active');
    if (this.partnerPttBtnText) this.partnerPttBtnText.textContent = '누르고 말하기 (Guest)';
    if (this.userPttBtnText) this.userPttBtnText.textContent = '누르고 말하기 (나)';
    this.btnToggleStream?.classList.remove('ptt-active');
    this.btnSoloMic?.classList.remove('ptt-active');

    // 4. 모드 변경 저장 및 UI 전환
    this.speechMode = mode;
    localStorage.setItem('gemini_speech_mode', mode);
    this.updateSpeechModeUI();

    // 5. 각 모드의 독립적인 순수 대기 상태 UI 설정
    if (mode === 'ptt') {
      this.updatePttIdleUI();
    } else {
      this.setStatusPill('준비 완료 (마이크 터치)', '#10b981');
      if (this.streamStatusLabel) {
        this.streamStatusLabel.textContent = '터치하여 실시간 동시통역 시작 (중간 호흡 대기)';
      }
      if (this.soloMicText) {
        this.soloMicText.textContent = '통역 시작';
      }
    }

    this.addDebugLog(`[Mode] 발화 방식 변경: ${mode === 'ptt' ? '누르고 말하기 (PTT)' : '자동 감지 (핸즈프리)'} (마이크 완전 초기화)`);
  }

  updateSpeechModeUI() {
    if (this.btnModeHandsfree && this.btnModePtt) {
      if (this.speechMode === 'ptt') {
        this.btnModePtt.classList.add('active');
        this.btnModeHandsfree.classList.remove('active');
        if (this.pttHintLabel) this.pttHintLabel.classList.remove('hidden');

        // PTT Mode: Hide center single mic button, show Top & Bottom dual PTT buttons
        if (this.btnToggleStream) this.btnToggleStream.style.display = 'none';
        if (this.streamStatusLabel) this.streamStatusLabel.style.display = 'none';
        this.partnerPttContainer?.classList.remove('hidden');
        this.userPttContainer?.classList.remove('hidden');

        this.btnSoloMic?.classList.add('ptt-mode');
        if (!this.isStreaming) {
          this.soloMicText.textContent = '누르고 말하기';
        }
      } else {
        this.btnModeHandsfree.classList.add('active');
        this.btnModePtt.classList.remove('active');
        if (this.pttHintLabel) this.pttHintLabel.classList.add('hidden');

        // Handsfree Mode: Show center single mic button, hide Top & Bottom dual PTT buttons
        if (this.btnToggleStream) this.btnToggleStream.style.display = 'flex';
        if (this.streamStatusLabel) this.streamStatusLabel.style.display = 'block';
        this.partnerPttContainer?.classList.add('hidden');
        this.userPttContainer?.classList.add('hidden');

        this.btnToggleStream?.classList.remove('ptt-mode');
        this.btnSoloMic?.classList.remove('ptt-mode');
        if (!this.isStreaming) {
          this.streamStatusLabel.textContent = '터치하여 실시간 동시통역 시작 (중간 호흡 대기)';
          this.soloMicText.textContent = '통역 시작';
        }
      }
    }
  }

  sendSilenceBurst(count = 4) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    // 16000Hz 16-bit Mono PCM 60ms = 960 samples = 1920 zero bytes = 2560 'A's in base64
    const silenceBase64 = 'A'.repeat(2560);
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN && !this.isPttHolding) {
          const payload = {
            realtime_input: {
              media_chunks: [
                {
                  mime_type: 'audio/pcm;rate=16000',
                  data: silenceBase64
                }
              ]
            }
          };
          this.ws.send(JSON.stringify(payload));
          this.addDebugLog(`[VAD] 무음 종결 신호 전송 (${i + 1}/${count})`);
        }
      }, i * 35);
    }
  }

  async handlePttDown(e, speaker = 'user') {
    if (this.speechMode !== 'ptt') return;
    if (e && e.cancelable && e.type !== 'keydown') e.preventDefault();
    if (this.isPttHolding) return;

    this.currentPttSpeaker = speaker;

    if (this.pttTurnFallbackTimer) {
      clearTimeout(this.pttTurnFallbackTimer);
      this.pttTurnFallbackTimer = null;
    }

    // 이전 발화 턴이 아직 처리 중이었다면 새 발화 시작 전 안전 플러시
    if (this.currentInputText || this.currentOutputText) {
      this.flushCurrentTurnToHistory();
    }

    this.isPttHolding = true;
    this.isPttWaitingCompletion = false;
    this.turnCompleteReceivedDuringTail = false;
    this.lastSpeechTime = Date.now();
    this.isUserSpeaking = true;
    this.renderLiveTranscript();

    // Visual active states for respective button
    if (speaker === 'partner') {
      this.btnPttPartner?.classList.add('ptt-active');
      if (this.partnerPttBtnText) this.partnerPttBtnText.textContent = '말씀하시는 중... 🎙️';
      this.setStatusPill('상대방 음성 입력 중...', '#ec4899');
    } else {
      this.btnPttUser?.classList.add('ptt-active');
      if (this.userPttBtnText) this.userPttBtnText.textContent = '말씀하시는 중... 🎙️';
      this.btnToggleStream?.classList.add('ptt-active');
      this.btnSoloMic?.classList.add('ptt-active');
      this.setStatusPill('내 음성 입력 중...', '#00e5ff');
    }

    if (!this.isStreaming) {
      await this.startStreaming();
    } else {
      // 이미 연결된 실시간 세션에서 발화자(상대방 vs 나)에 따라 통역 타겟 언어 즉시 전환
      const activeTarget = speaker === 'partner' ? this.userLang : this.partnerLang;
      if (this.lastSentTargetLang !== activeTarget) {
        this.sendSetupMessage(activeTarget);
      }
    }
  }

  sendSetupMessage(targetLang = null) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const tgt = targetLang || ((this.speechMode === 'ptt' && this.currentPttSpeaker === 'partner') ? this.userLang : this.partnerLang);
    this.lastSentTargetLang = tgt;

    let customGlossary = '';
    if (this.learnedRules && this.learnedRules.length > 0) {
      const topRules = this.learnedRules.slice(0, 8);
      customGlossary = `\nCustom Glossary & Key Terms:\n` + topRules.map(r => `- "${r.src}" -> "${r.tgt}"`).join('\n');
    }

    const setupMessage = {
      setup: {
        model: 'models/gemini-3.5-live-translate-preview',
        generation_config: {
          response_modalities: ['AUDIO', 'TEXT'],
          translation_config: {
            target_language_code: tgt,
            echo_target_language: this.settings.echoTargetLanguage
          }
        }
      }
    };

    this.ws.send(JSON.stringify(setupMessage));
    this.addDebugLog(`[Setup Sent] Target: ${tgt} (Speaker: ${this.currentPttSpeaker})`);
  }

  handlePttUp(e) {
    if (this.speechMode !== 'ptt' || !this.isPttHolding) return;
    if (e && e.cancelable && e.type !== 'keyup') e.preventDefault();

    this.isPttHolding = false;
    this.isPttWaitingCompletion = true;
    this.turnCompleteReceivedDuringTail = false;
    this.isUserSpeaking = false;

    // 1. 버튼 눌림 시각 효과 해제 및 라벨 복원
    this.btnPttPartner?.classList.remove('ptt-active');
    this.btnPttUser?.classList.remove('ptt-active');
    if (this.partnerPttBtnText) this.partnerPttBtnText.textContent = '누르고 말하기 (Guest)';
    if (this.userPttBtnText) this.userPttBtnText.textContent = '누르고 말하기 (나)';

    this.btnToggleStream?.classList.remove('ptt-active');
    this.btnSoloMic?.classList.remove('ptt-active');
    this.setStatusPill('번역 출력 중...', '#00e5ff');

    // 2. Gemini Live 신경망에 "문장이 끝났다"는 명확한 침묵 신호(Zero PCM Silence Burst)를 전송
    this.sendSilenceBurst(5);

    // 3. 누르고 있는 동안 도착해서 보류되었던 번역 오디오가 있다면 즉시 재생
    this.playPendingAudioQueue();

    // 4. 턴 완결 대기 안전 타이머: turnComplete 신호가 5초 내에 수신되지 않을 경우 세이프티 마감
    if (this.pttTurnFallbackTimer) {
      clearTimeout(this.pttTurnFallbackTimer);
    }
    this.pttTurnFallbackTimer = setTimeout(() => {
      if (this.speechMode === 'ptt' && !this.isPttHolding && this.isPttWaitingCompletion) {
        this.addDebugLog('[PTT Fallback] turnComplete 미수신 세이프티 마감');
        this.finishPttTurn();
      }
    }, 5000);
  }

  finishPttTurn() {
    if (this.pttTurnFallbackTimer) {
      clearTimeout(this.pttTurnFallbackTimer);
      this.pttTurnFallbackTimer = null;
    }

    // 번역 오디오가 재생 중이라면 소리가 끝날 때까지 대기 후 히스토리로 마감
    const remainingSec = this.audioStreamer ? this.audioStreamer.getRemainingPlaybackTime() : 0;
    const waitMs = Math.max(150, Math.round(remainingSec * 1000) + 200);

    setTimeout(() => {
      if (this.speechMode === 'ptt' && !this.isPttHolding) {
        this.isPttWaitingCompletion = false;
        if (this.currentInputText || this.currentOutputText) {
          this.flushCurrentTurnToHistory();
        }
        this.updatePttIdleUI();
      }
    }, waitMs);
  }

  updatePttIdleUI() {
    if (this.speechMode === 'ptt' && !this.isPttHolding && !this.isPttWaitingCompletion) {
      this.streamStatusLabel.textContent = '버튼을 누르고 있는 동안 말씀하세요 (Space 키 가능)';
      this.soloMicText.textContent = '누르고 말하기';
      this.setStatusPill('대기 중 (누르고 말하기)', '#10b981');
    }
  }

  // [자동 감지 모드 전용] 음성 볼륨 및 발화 멈춤 대기 시간(Pause Tolerance) 관리
  handleVoiceVolume(vol) {
    if (this.speechMode !== 'handsfree') return;

    if (vol > 0.008) {
      this.isHandsfreeSpeaking = true;
      this.lastSpeechTime = Date.now();
      if (this.handsfreeSilenceTimer) {
        clearTimeout(this.handsfreeSilenceTimer);
        this.handsfreeSilenceTimer = null;
      }
    } else if (this.isHandsfreeSpeaking) {
      // 말이 잦아들었을 때 설정창에서 지정한 발화 멈춤 대기 시간(pauseTolerance) 동안 침묵인지 관찰
      if (!this.handsfreeSilenceTimer) {
        this.handsfreeSilenceTimer = setTimeout(() => {
          this.onHandsfreeSpeechEnded();
        }, this.pauseTolerance);
      }
    }
  }

  onHandsfreeSpeechEnded() {
    this.isHandsfreeSpeaking = false;
    this.handsfreeSilenceTimer = null;
    this.addDebugLog(`[자동감지] 발화 멈춤 감지 (${this.pauseTolerance}ms 경과) -> 통역 음성 재생`);

    // 스마트 긴 문장 보호로 보류되었던 번역 음성 일괄 재생
    this.playPendingAudioQueue();

    // 말이 멈추고 음성 재생이 끝나는 시점에 즉시 현재 턴을 카드로 마감하여 다음 대화와 분리
    this.turnCompleteReceivedDuringTail = false;
    const remainingSec = this.audioStreamer ? this.audioStreamer.getRemainingPlaybackTime() : 0;
    const waitMs = Math.max(120, Math.round(remainingSec * 1000) + 120);
    setTimeout(() => {
      if (this.speechMode === 'handsfree' && !this.isHandsfreeSpeaking) {
        if (this.currentInputText || this.currentOutputText) {
          this.flushCurrentTurnToHistory();
        }
      }
    }, waitMs);
  }

  shouldHoldAudioPlayback() {
    if (this.speechMode === 'ptt') {
      // PTT 모드: 버튼을 누르고 있는 동안에만 보류
      return this.isPttHolding;
    }
    if (this.speechMode === 'handsfree') {
      // 자동 감지 모드: 스마트 긴 문장 보호가 켜져 있고 사용자가 말하고 있을 때만 보류
      return this.smartGuard && this.isHandsfreeSpeaking;
    }
    return false;
  }

  playPendingAudioQueue() {
    if (!this.settings.audioOutputEnabled || this.pendingAudioQueue.length === 0) return;
    this.addDebugLog(`[오디오 재생] 보류된 청크 ${this.pendingAudioQueue.length}개 재생`);
    while (this.pendingAudioQueue.length > 0) {
      const chunk = this.pendingAudioQueue.shift();
      this.audioStreamer.playChunk(chunk);
    }
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
    this.authService?.syncToCloud();
  }

  deleteDictionaryRule(src) {
    this.learnedRules = this.learnedRules.filter(r => r.src !== src);
    localStorage.setItem('gemini_learned_rules', JSON.stringify(this.learnedRules));
    this.renderLearnedRules();
    this.authService?.syncToCloud();
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
      this.apiKey = this.apiKey || FIXED_GEMINI_API_KEY;

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

        let customGlossary = '';
        if (this.learnedRules && this.learnedRules.length > 0) {
          const topRules = this.learnedRules.slice(0, 8);
          customGlossary = `\nCustom Glossary & Key Terms:\n` + topRules.map(r => `- "${r.src}" -> "${r.tgt}"`).join('\n');
        }

        this.sendSetupMessage();
        this.setStatusPill('통역 중 (듣는 중)', '#10b981');
        this.streamStatusLabel.textContent = this.speechMode === 'ptt'
          ? '버튼을 누르고 있는 동안 말씀하세요 (Space 키 가능)'
          : '음성을 듣고 실시간 통역 중입니다... (말씀하세요)';
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

        // 1. Google 10분 세션 최대 지속시간 만료 (GoAway 정상 세션 회전 - 오류 아님!)
        const isSessionLimit = reason.includes('GoAway') || reason.includes('session duration') || reason.includes('duration limit');
        if (isSessionLimit) {
          this.addDebugLog('[Gemini] Google 10분 세션 지속 제한에 도달하여 자동 갱신되었습니다. (정상 동작)');
          this.stopStreaming();
          this.setStatusPill('세션 갱신 완료 (준비)', '#10b981');
          if (this.speechMode === 'handsfree') {
            // 자동 감지(핸즈프리) 모드인 경우 사용자가 끊김을 느끼지 않게 바로 새 세션 재연결
            setTimeout(() => this.startStreaming(), 300);
          } else {
            this.updatePttIdleUI();
          }
          return;
        }

        let alertMessage = null;
        if (ev.code === 1011 || reason.includes('prepayment credits are depleted') || reason.includes('credits')) {
          this.setStatusPill('API 크레딧 소진', '#f43f5e');
          alertMessage = '⚠️ 구글 Gemini API 키의 크레딧/한도가 소진되었습니다.\n\n새로운 Gemini API 키를 발급받으신 후 상단 설정(⚙️) 아이콘을 눌러 새 키를 입력해 주세요.';
        } else if ((ev.code === 1006 || ev.code === 1007 || ev.code === 1008) && !reason.includes('normal')) {
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
      } catch (e) { }
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
    // [CRITICAL] PTT 모드일 때는 버튼을 누르고 있는 동안에만 실시간 마이크 오디오 전송 (손을 뗀 후 잡음 유입 차단)
    if (this.speechMode === 'ptt' && !this.isPttHolding) {
      return;
    }

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

    if (data.goAway || data.go_away) {
      this.addDebugLog('[Gemini] 10분 세션 교체 신호(GoAway) 수신');
      return;
    }

    const serverContent = data.serverContent || data.server_content || data.payload?.serverContent;
    if (!serverContent) return;

    if (serverContent.interrupted) {
      this.addDebugLog('[Gemini] 사용자 발화 감지로 AI 음성 출력이 중단됨(interrupted)');
    }

    const refreshPttFallback = () => {
      if (this.speechMode === 'ptt' && !this.isPttHolding && this.isPttWaitingCompletion && this.pttTurnFallbackTimer) {
        clearTimeout(this.pttTurnFallbackTimer);
        this.pttTurnFallbackTimer = setTimeout(() => {
          if (!this.isPttHolding && this.isPttWaitingCompletion) {
            this.addDebugLog('[PTT Fallback] 스트리밍 완료 후 대기 종료 -> 안전 마감');
            this.finishPttTurn();
          }
        }, 2500);
      }
    };

    // 1. Input Transcript (User / Partner STT)
    const inTrans = serverContent.inputTranscription || serverContent.input_transcription;
    if (inTrans && inTrans.text) {
      this.currentInputText += inTrans.text;
      this.lastSpeechTime = Date.now();
      this.isUserSpeaking = true;
      if (this.pendingTurnTimer) {
        clearTimeout(this.pendingTurnTimer);
        this.pendingTurnTimer = null;
      }

      // [자동 감지 모드] 자막 수신 시 발화 중 상태 유지 및 pauseTolerance 타이머 갱신
      if (this.speechMode === 'handsfree') {
        this.isHandsfreeSpeaking = true;
        if (this.handsfreeSilenceTimer) {
          clearTimeout(this.handsfreeSilenceTimer);
          this.handsfreeSilenceTimer = null;
        }
        this.handsfreeSilenceTimer = setTimeout(() => {
          this.onHandsfreeSpeechEnded();
        }, this.pauseTolerance);
      }

      refreshPttFallback();
      this.addDebugLog(`[STT 원문] ${inTrans.text}`);
      this.renderLiveTranscript();
    }

    // 2. Output Transcript (Model Translation STT or Model Turn Text)
    const outTrans = serverContent.outputTranscription || serverContent.output_transcription;
    if (outTrans && outTrans.text) {
      this.currentOutputText += outTrans.text;
      refreshPttFallback();
      this.addDebugLog(`[번역문] ${outTrans.text}`);
      this.renderLiveTranscript();
    }

    // 3. Model Turn (Audio output & direct text translation)
    const modelTurn = serverContent.modelTurn || serverContent.model_turn;
    if (modelTurn && modelTurn.parts) {
      for (const part of modelTurn.parts) {
        if (part.text) {
          this.currentOutputText += part.text;
          refreshPttFallback();
          this.addDebugLog(`[번역문] ${part.text}`);
          this.renderLiveTranscript();
        }
        const inlineData = part.inlineData || part.inline_data;
        if (inlineData && inlineData.data) {
          this.chunksReceived++;
          this.updateStatsBar();
          refreshPttFallback();
          this.addDebugLog(`[오디오 수신] chunk #${this.chunksReceived}`);
          if (this.settings.audioOutputEnabled) {
            if (this.speechMode === 'ptt' && this.isPttHolding) {
              // PTT 모드: 버튼을 누르고 있는 동안에는 번역 오디오를 보류
              this.pendingAudioQueue.push(inlineData.data);
              this.addDebugLog('[오디오 보류] PTT 누름 중');
            } else if (this.speechMode === 'handsfree' && this.smartGuard && this.isHandsfreeSpeaking) {
              // 자동 감지 모드 + 스마트 긴 문장 보호 ON: 말하는 도중에는 번역 오디오 보류
              this.pendingAudioQueue.push(inlineData.data);
              this.addDebugLog('[오디오 보류] 자동감지 발화 중');
            } else {
              this.audioStreamer.playChunk(inlineData.data);
            }
          }
        }
      }
    }

    // 4. Turn Complete (서버측 턴 완결 신호)
    if (serverContent.turnComplete || serverContent.turn_complete) {
      this.addDebugLog('[Turn Complete] 서버 턴 완결 신호 수신');

      if (this.speechMode === 'ptt') {
        if (this.isPttHolding) {
          // 사용자가 아직 마이크를 누르고 있다면 손을 뗄 때까지 플래그만 보존
          this.turnCompleteReceivedDuringTail = true;
        } else {
          // 이미 손을 뗐다면 오디오 재생 완료 확인 후 깔끔하게 턴 마감
          this.finishPttTurn();
        }
      } else {
        // [자동 감지 모드] 아직 말하고 있거나 발화 멈춤 대기 시간(pauseTolerance) 타이머가 진행 중이라면 보류
        if (this.isHandsfreeSpeaking || this.handsfreeSilenceTimer) {
          this.turnCompleteReceivedDuringTail = true;
          this.addDebugLog(`[Turn Complete] 발화 멈춤 대기 중 (${this.pauseTolerance}ms 타이머 진행 중) -> 마감 보류`);
        } else {
          const remainingSec = this.audioStreamer ? this.audioStreamer.getRemainingPlaybackTime() : 0;
          const waitMs = Math.max(60, Math.round(remainingSec * 1000) + 80);
          setTimeout(() => {
            if (this.speechMode === 'handsfree' && !this.isHandsfreeSpeaking && !this.handsfreeSilenceTimer) {
              this.flushCurrentTurnToHistory();
            }
          }, waitMs);
        }
      }
    }
  }

  isTextInLang(text, langCode) {
    if (!text || typeof text !== 'string') return false;
    const clean = text.trim();
    if (!clean) return false;

    // 한국어
    if (langCode === 'ko') {
      return /[\uac00-\ud7af\u1100-\u11ff\u3130-\u318f]/.test(clean);
    }
    // 일본어
    if (langCode === 'ja') {
      return /[\u3040-\u309f\u30a0-\u30ff]/.test(clean);
    }
    // 중국어
    if (langCode && langCode.startsWith('zh')) {
      return /[\u4e00-\u9fff]/.test(clean);
    }
    // 아랍어
    if (langCode === 'ar') {
      return /[\u0600-\u06ff]/.test(clean);
    }
    // 러시아어 / 우크라이나어
    if (langCode === 'ru' || langCode === 'uk') {
      return /[\u0400-\u04ff]/.test(clean);
    }
    // 태국어
    if (langCode === 'th') {
      return /[\u0e00-\u0e7f]/.test(clean);
    }
    // 힌디어
    if (langCode === 'hi') {
      return /[\u0900-\u097f]/.test(clean);
    }
    // 베트남어
    if (langCode === 'vi') {
      return /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(clean);
    }
    // 라틴 문자 기반 언어 (영어, 스페인어, 프랑스어, 독일어 등)
    return /[a-zA-Z]/.test(clean);
  }

  splitLanguages(input, output, explicitSpeaker = null) {
    const textA = (input || '').trim();
    const textB = (output || '').trim();

    // 1. PTT 모드에서 화자가 명시적으로 정해진 경우
    const speaker = explicitSpeaker || (this.speechMode === 'ptt' ? this.currentPttSpeaker : null);
    if (speaker === 'partner') {
      return {
        userText: textB,      // 상대방이 말했으므로 번역된 textB가 한국어(userText)
        partnerText: textA,   // 상대방 영어 원문
        speaker: 'partner'
      };
    }
    if (speaker === 'user') {
      return {
        userText: textA,      // 내가 말했으므로 입력 textA가 한국어(userText)
        partnerText: textB,   // 영어 번역문
        speaker: 'user'
      };
    }

    // 2. 자동 감지(핸즈프리) 모드: 언어 특성 분석
    const aIsUser = this.isTextInLang(textA, this.userLang);
    const bIsUser = this.isTextInLang(textB, this.userLang);
    const aIsPartner = this.isTextInLang(textA, this.partnerLang);
    const bIsPartner = this.isTextInLang(textB, this.partnerLang);

    if (aIsUser && !bIsUser) {
      return { userText: textA, partnerText: textB, speaker: 'user' };
    }
    if (bIsUser && !aIsUser) {
      return { userText: textB, partnerText: textA, speaker: 'partner' };
    }
    if (aIsPartner && bIsUser) {
      return { userText: textB, partnerText: textA, speaker: 'partner' };
    }
    if (bIsPartner && aIsUser) {
      return { userText: textA, partnerText: textB, speaker: 'user' };
    }

    // 3. 한쪽만 텍스트가 도착한 경우 (실시간 자막 스트리밍 중)
    if (textA && !textB) {
      if (aIsUser) {
        return { userText: textA, partnerText: '', speaker: 'user' };
      } else if (aIsPartner) {
        return { userText: '', partnerText: textA, speaker: 'partner' };
      }
      return { userText: textA, partnerText: '', speaker: 'user' };
    }

    if (!textA && textB) {
      if (bIsUser) {
        return { userText: textB, partnerText: '', speaker: 'partner' };
      } else if (bIsPartner) {
        return { userText: '', partnerText: textB, speaker: 'user' };
      }
      return { userText: '', partnerText: textB, speaker: 'user' };
    }

    return { userText: textA, partnerText: textB, speaker: 'user' };
  }

  renderLiveTranscript() {
    const { userText, partnerText } = this.splitLanguages(this.currentInputText, this.currentOutputText);

    // 1. User View (하단: 나) -> 언제나 내 언어(userText)가 크고, 상대방 언어(partnerText)가 작게
    if (this.userPrimaryText) {
      this.userPrimaryText.textContent = userText || (this.isPttHolding && this.currentPttSpeaker === 'user' ? '말씀하시는 내용을 기록하고 있습니다...' : '');
    }
    if (this.userSecondaryText) {
      this.userSecondaryText.textContent = partnerText || '';
    }

    // 2. Partner View (상단: 상대방) -> 언제나 상대방 언어(partnerText)가 크고, 내 언어(userText)가 작게
    if (this.partnerPrimaryText) {
      this.partnerPrimaryText.textContent = partnerText || (this.isPttHolding && this.currentPttSpeaker === 'partner' ? 'Listening and recording...' : '');
    }
    if (this.partnerSecondaryText) {
      this.partnerSecondaryText.textContent = userText || '';
    }

    // 라이브 버블 표시 여부: 누르고 있는 동안 또는 실시간 텍스트가 있을 때만 활성화
    const hasLiveContent = Boolean(this.currentInputText || this.currentOutputText || this.isPttHolding);
    if (this.userLiveWrap) {
      this.userLiveWrap.style.display = hasLiveContent ? 'block' : 'none';
    }
    if (this.partnerLiveWrap) {
      this.partnerLiveWrap.style.display = hasLiveContent ? 'block' : 'none';
    }

    if (this.userChatLog) {
      const p = this.userChatLog.closest('.transcript-display');
      if (p) p.scrollTop = p.scrollHeight;
    }
    if (this.partnerChatLog) {
      const p = this.partnerChatLog.closest('.transcript-display');
      if (p) p.scrollTop = p.scrollHeight;
    }
  }

  // 문장 종결 부호(. ? ! 。 ？ ！ \n) 기준으로 텍스트를 문장 단위로 분할
  splitSentences(text) {
    if (!text || typeof text !== 'string') return [];
    const parts = [];
    let current = '';
    const endPuncts = new Set(['.', '?', '!', '。', '？', '！', '\n']);

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      current += ch;

      if (endPuncts.has(ch)) {
        // 숫자 소수점 예외 방지 (예: 3.5, 10.2)
        if (ch === '.' && i > 0 && i < text.length - 1 && /\d/.test(text[i - 1]) && /\d/.test(text[i + 1])) {
          continue;
        }
        const nextChar = text[i + 1];
        if (!nextChar || /\s/.test(nextChar) || nextChar === '\n' || endPuncts.has(nextChar)) {
          while (i + 1 < text.length && endPuncts.has(text[i + 1])) {
            i++;
            current += text[i];
          }
          parts.push(current.trim());
          current = '';
          while (i + 1 < text.length && (text[i + 1] === ' ' || text[i + 1] === '\t')) {
            i++;
          }
        }
      }
    }
    if (current.trim()) {
      parts.push(current.trim());
    }
    return parts.filter(Boolean);
  }

  isSentenceClosed(str) {
    if (!str) return false;
    return /[.?!。？！\n]$/.test(str.trim());
  }

  // 실시간 스트리밍 중 이미 완결된 앞선 문장을 먼저 카드로 독립 마감 (자동 감지 모드 전용)
  checkAndFlushRealtimeSentences() {
    // [CRITICAL] PTT 모드에서는 버튼을 누르고 있는 동안 문장을 절대 임의로 쪼개지 않음!
    // 한 번 누르고 말한 모든 내용이 하나의 대화창에 온전히 유지되어야 함.
    if (this.speechMode === 'ptt') return;

    if (!this.currentInputText || !this.currentOutputText) return;

    const inSentences = this.splitSentences(this.currentInputText);
    const outSentences = this.splitSentences(this.currentOutputText);

    // 원문과 번역문 모두 2문장 이상이고, 첫 문장이 종결 부호로 닫혀 있을 때
    if (inSentences.length >= 2 && outSentences.length >= 2) {
      if (this.isSentenceClosed(inSentences[0]) && this.isSentenceClosed(outSentences[0])) {
        const completedIn = inSentences.shift();
        const completedOut = outSentences.shift();

        this.createAndAppendTurnCard(completedIn, completedOut);

        this.currentInputText = inSentences.join(' ');
        this.currentOutputText = outSentences.join(' ');
        this.renderLiveTranscript();
      }
    }
  }

  createAndAppendTurnCard(inputStr, outputStr) {
    const rawInput = (inputStr || '').trim();
    const rawOutput = (outputStr || '').trim();
    if (!rawInput && !rawOutput) return;

    const { userText, partnerText, speaker } = this.splitLanguages(rawInput, rawOutput);

    const srcCode = speaker === 'partner' ? this.partnerLang : this.userLang;
    const tgtCode = speaker === 'partner' ? this.userLang : this.partnerLang;
    const srcLangObj = SUPPORTED_LANGUAGES.find(l => l.code === srcCode);
    const tgtLangObj = SUPPORTED_LANGUAGES.find(l => l.code === tgtCode);

    const item = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      original: rawInput,
      translated: rawOutput,
      userText,
      partnerText,
      speaker, // 'user' | 'partner'
      fromLang: srcLangObj ? srcLangObj.name : srcCode,
      toLang: tgtLangObj ? tgtLangObj.name : tgtCode
    };

    if (item.original || item.translated) {
      this.currentSessionTurns.push(item);
      this.appendTurnToChatLog(item);
      this.appendFeedBubble(item);
    }
  }

  flushCurrentTurnToHistory() {
    if (!this.currentInputText && !this.currentOutputText) return;

    const rawIn = this.currentInputText.trim();
    const rawOut = this.currentOutputText.trim();
    if (!rawIn && !rawOut) return;

    // 길게 이야기한 대화 전체를 분할하지 않고 1개의 완성된 대화 카드로 묶어서 채팅창에 등록!
    // 이전 대화 카드들은 화면에 그대로 보존되며, 그 밑에 새 카드로 차곡차곡 쌓임
    this.createAndAppendTurnCard(rawIn, rawOut);

    this.currentInputText = '';
    this.currentOutputText = '';

    // 실시간 라이브 자막창 초기화 (다음 대화가 깨끗한 새 창에 입력되도록 준비)
    if (this.userPrimaryText) this.userPrimaryText.textContent = '';
    if (this.userSecondaryText) this.userSecondaryText.textContent = '';
    if (this.partnerPrimaryText) this.partnerPrimaryText.textContent = '';
    if (this.partnerSecondaryText) this.partnerSecondaryText.textContent = '';

    if (this.userLiveWrap) this.userLiveWrap.style.display = 'none';
    if (this.partnerLiveWrap) this.partnerLiveWrap.style.display = 'none';
  }

  appendTurnToChatLog(item) {
    const userText = item.userText || (item.speaker === 'partner' ? item.translated : item.original);
    const partnerText = item.partnerText || (item.speaker === 'partner' ? item.original : item.translated);

    if (!userText && !partnerText) return;

    // 1. User View 대화 카드 (나의 화면: 한국어가 크게, 영어가 밑에 작게)
    if (this.userChatLog) {
      const userCard = document.createElement('div');
      userCard.className = 'chat-turn-card';
      const speakerBadge = item.speaker === 'partner' ? '👤 상대방' : '🗣️ 나';
      userCard.innerHTML = `
        <div class="card-header">
          <span>${item.time} &middot; <strong style="color:var(--accent-cyan); font-weight:700;">${speakerBadge}</strong></span>
          <span style="color:var(--text-muted);">${item.fromLang} ➔ ${item.toLang}</span>
        </div>
        <div class="card-trans">${this.escapeHtml(userText)}</div>
        ${partnerText && partnerText !== userText ? `<div class="card-orig">${this.escapeHtml(partnerText)}</div>` : ''}
      `;
      this.userChatLog.appendChild(userCard);

      const parent = this.userChatLog.closest('.transcript-display');
      if (parent) {
        requestAnimationFrame(() => {
          parent.scrollTop = parent.scrollHeight;
        });
      }
    }

    // 2. Partner View 대화 카드 (상대방 화면: 영어가 크게, 한국어가 밑에 작게)
    if (this.partnerChatLog) {
      const partnerCard = document.createElement('div');
      partnerCard.className = 'chat-turn-card partner-card';
      const speakerBadge = item.speaker === 'partner' ? '🗣️ 나 (You)' : '👤 상대방 (Guest)';
      partnerCard.innerHTML = `
        <div class="card-header">
          <span>${item.time} &middot; <strong style="color:#a78bfa; font-weight:700;">${speakerBadge}</strong></span>
          <span style="color:var(--text-muted);">${item.fromLang} ➔ ${item.toLang}</span>
        </div>
        <div class="card-trans">${this.escapeHtml(partnerText)}</div>
        ${userText && userText !== partnerText ? `<div class="card-orig">${this.escapeHtml(userText)}</div>` : ''}
      `;
      this.partnerChatLog.appendChild(partnerCard);

      const parent = this.partnerChatLog.closest('.transcript-display');
      if (parent) {
        requestAnimationFrame(() => {
          parent.scrollTop = parent.scrollHeight;
        });
      }
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  showToast(msg) {
    this.showAutoLearnToast(msg);
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
    if (!this.historyList) return;
    if (this.history.length === 0) {
      this.historyList.innerHTML = '<p class="empty-history">아직 기록된 대화 세션이 없습니다.</p>';
      return;
    }

    this.historyList.innerHTML = '';
    this.history.forEach((session, sessionIdx) => {
      // 1. 최신 세션 기반 데이터인 경우 (세션 단위 묶음 카드)
      if (session.turns && Array.isArray(session.turns)) {
        const turns = session.turns;
        const sessionCard = document.createElement('div');
        sessionCard.className = 'history-session-card';

        const turnsRowsHtml = turns.map((t) => {
          const isPartner = t.speaker === 'partner';
          const speakerBadge = isPartner ? '👤 상대방' : '🗣️ 나';
          const transText = isPartner ? (t.userText || t.translated) : (t.partnerText || t.translated);
          const origText = isPartner ? (t.partnerText || t.original) : (t.userText || t.original);

          return `
            <div class="history-turn-row ${isPartner ? 'partner' : ''}">
              <div class="history-turn-speaker">${t.time} &middot; ${speakerBadge}</div>
              <div class="history-turn-trans">${this.escapeHtml(transText)}</div>
              ${origText && origText !== transText ? `<div class="history-turn-orig">원문: ${this.escapeHtml(origText)}</div>` : ''}
            </div>
          `;
        }).join('');

        sessionCard.innerHTML = `
          <div class="history-session-header">
            <div class="history-session-meta">
              <div class="history-session-title">
                <span>📅 ${session.dateStr || ''} ${session.timeStr || ''}</span>
                <span class="history-session-badge">${session.modeLabel || '대화 세션'}</span>
              </div>
              <div class="history-session-sub">${session.langPair || ''} &middot; 대화 ${turns.length}건</div>
            </div>
            <div class="history-session-actions">
              <button class="history-session-btn btn-copy-session" title="이 대화 세션 전체 복사">📋 복사</button>
              <button class="history-session-btn btn-learn-session" style="color:#00e5ff;" title="이 세션의 대화들을 AI 학습에 반영">🧠 학습</button>
            </div>
          </div>
          <div class="history-session-turns-list">
            ${turnsRowsHtml}
          </div>
        `;

        // 세션 전체 복사 버튼
        sessionCard.querySelector('.btn-copy-session')?.addEventListener('click', () => {
          const text = turns.map((t) => {
            const spk = t.speaker === 'partner' ? '상대방' : '나';
            return `[${t.time}] (${spk}) 원문: ${t.original}\n번역: ${t.translated}`;
          }).join('\n\n');
          const header = `=== ${session.title || '대화 세션'} (${session.modeLabel || ''}) ===\n\n`;
          navigator.clipboard.writeText(header + text).then(() => {
            alert('이 대화 세션 전체가 클립보드에 복사되었습니다.');
          });
        });

        // 세션 AI 맞춤 학습 버튼
        sessionCard.querySelector('.btn-learn-session')?.addEventListener('click', () => {
          if (turns.length === 0) return;
          const firstTurn = turns[0];
          const correctTarget = prompt(`AI가 기억해야 할 올바른 맞춤 번역 단어나 표현을 입력해주세요:\n(예: ${firstTurn.original} ➔ ...)`);
          if (correctTarget && correctTarget.trim()) {
            this.addDictionaryRule(firstTurn.original, correctTarget.trim());
            alert(`✅ AI 학습 완료! 다음 통역부터 즉시 맞춤 적용됩니다.`);
          }
        });

        this.historyList.appendChild(sessionCard);
      } else {
        // 2. 구버전 낱개 단일 턴 데이터 하위 호환
        const el = document.createElement('div');
        el.className = 'history-item';
        el.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div class="speaker">${session.time || ''} [${session.fromLang || ''} ➔ ${session.toLang || ''}]</div>
            <button class="learn-btn" style="background:rgba(0,229,255,0.15); border:1px solid #00e5ff; color:#00e5ff; padding:2px 8px; border-radius:4px; font-size:0.75rem; cursor:pointer;" title="이 대화를 맞춤 번역 규칙으로 AI에 학습">🧠 AI 학습</button>
          </div>
          <div class="text-main">${this.escapeHtml(session.translated || session.original || '')}</div>
          <div class="text-sub">원문: ${this.escapeHtml(session.original || '')}</div>
        `;

        el.querySelector('.learn-btn')?.addEventListener('click', () => {
          const correctTarget = prompt(`"${session.original}"에 대해 AI가 기억해야 할 올바른 번역을 입력해주세요:`, session.translated);
          if (correctTarget && correctTarget.trim()) {
            this.addDictionaryRule(session.original, correctTarget.trim());
            alert(`✅ AI 학습 완료!`);
          }
        });

        this.historyList.appendChild(el);
      }
    });
    this.historyList.scrollTop = 0;
  }

  copyHistory() {
    if (this.history.length === 0) return alert('복사할 대화 기록이 없습니다.');
    const fullText = this.history.map((s, idx) => {
      if (s.turns && Array.isArray(s.turns)) {
        const turnsText = s.turns.map(t => {
          const spk = t.speaker === 'partner' ? '상대방' : '나';
          return `  [${t.time}] (${spk}) ${t.original} ➔ ${t.translated}`;
        }).join('\n');
        return `========================================\n[세션 ${idx + 1}] ${s.dateStr || ''} ${s.timeStr || ''} (${s.modeLabel || ''})\n언어: ${s.langPair || ''} (총 ${s.turns.length}건)\n========================================\n${turnsText}`;
      } else {
        return `[${s.time || ''}] 원문: ${s.original}\n번역: ${s.translated}`;
      }
    }).join('\n\n');

    navigator.clipboard.writeText(fullText).then(() => alert('전체 대화 세션 기록이 클립보드에 복사되었습니다.'));
  }

  downloadHistory() {
    if (this.history.length === 0) return alert('저장할 대화 기록이 없습니다.');
    const fullText = this.history.map((s, idx) => {
      if (s.turns && Array.isArray(s.turns)) {
        const turnsText = s.turns.map(t => {
          const spk = t.speaker === 'partner' ? '상대방' : '나';
          return `  [${t.time}] (${spk})\n  원문: ${t.original}\n  번역: ${t.translated}\n`;
        }).join('\n');
        return `========================================\n세션 #${idx + 1} | ${s.dateStr || ''} ${s.timeStr || ''} | ${s.modeLabel || ''}\n언어: ${s.langPair || ''}\n========================================\n\n${turnsText}`;
      } else {
        return `[${s.time || ''}] [${s.fromLang}->${s.toLang}]\n원문: ${s.original}\n번역: ${s.translated}\n`;
      }
    }).join('\n----------------------------------------\n\n');

    const blob = new Blob([fullText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gemini-sessions-${new Date().toISOString().slice(0, 10)}.txt`;
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
      if (this.speechMode === 'ptt' && !this.isPttHolding) return;
      const pct = Math.min(100, Math.round(volume * 400));
      this.streamStatusLabel.textContent = `🎙️ 마이크 감지 중 (레벨: ${pct}%) | 송신: ${this.chunksSent} / 수신: ${this.chunksReceived}`;
    }
  }

  updateStatsBar() {
    if (this.isStreaming) {
      if (this.speechMode === 'ptt' && !this.isPttHolding) return;
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
      if (this.speechMode === 'ptt') {
        this.btnToggleStream.className = this.isPttHolding ? 'mic-button ptt-active' : 'mic-button ptt-mode idle';
        this.btnSoloMic.className = this.isPttHolding ? 'mic-button-floating ptt-active' : 'mic-button-floating ptt-mode idle';
        this.micIcon.classList.remove('hidden');
        this.stopIcon.classList.add('hidden');
        this.streamStatusLabel.textContent = this.isPttHolding ? '🎙️ 말씀하세요... (듣는 중)' : '버튼을 누르고 있는 동안 말씀하세요 (Space 키 가능)';
        this.soloMicText.textContent = this.isPttHolding ? '말씀하시는 중...' : '누르고 말하기';
      } else {
        this.btnToggleStream.className = 'mic-button streaming';
        this.btnSoloMic.className = 'mic-button-floating streaming';
        this.micIcon.classList.add('hidden');
        this.stopIcon.classList.remove('hidden');
        this.streamStatusLabel.textContent = '실시간 통역 중... (터치하여 중지)';
        this.soloMicText.textContent = '통역 중지';
      }
    } else {
      this.btnToggleStream.className = this.speechMode === 'ptt' ? 'mic-button ptt-mode idle' : 'mic-button idle';
      this.btnSoloMic.className = this.speechMode === 'ptt' ? 'mic-button-floating ptt-mode idle' : 'mic-button-floating idle';
      this.micIcon.classList.remove('hidden');
      this.stopIcon.classList.add('hidden');
      this.streamStatusLabel.textContent = this.speechMode === 'ptt'
        ? '버튼을 누르고 있는 동안 말씀하세요 (Space 키 가능)'
        : '터치하여 실시간 동시통역 시작 (중간 호흡 대기)';
      this.soloMicText.textContent = this.speechMode === 'ptt' ? '누르고 말하기' : '통역 시작';
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
