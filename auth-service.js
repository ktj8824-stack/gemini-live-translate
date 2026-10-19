/**
 * 번역톡 (Gemini Live Translate) - Authentication & Cloud Sync Service
 * Firebase Auth & Cloud Firestore 연동 및 오프라인/로컬 동기화 하이브리드 엔진
 * (iOS WKWebView file:// 프로토콜 및 일반 웹 브라우저 100% 호환)
 */

(function (window) {
  'use strict';

  class AuthService {
    constructor({ onAuthStateChanged, onSyncStatusChanged, onDebugLog }) {
      this.onAuthStateChangedCallback = onAuthStateChanged;
      this.onSyncStatusChangedCallback = onSyncStatusChanged;
      this.onDebugLog = onDebugLog || console.log;

      this.currentUser = null;
      this.firebaseApp = null;
      this.firebaseAuth = null;
      this.firestoreDb = null;
      this.isFirebaseReady = false;

      this.localUserKey = 'gemini_auth_user';
      this.firebaseConfigKey = 'gemini_firebase_config';
      this.kakaoAppKeyStorage = 'gemini_kakao_app_key';
      this.kakaoMasterAppKey = 'aa3ed4bdeb8db39117fcd008c756acb7';

      // 32자리 16진수 앱 키인지 검증 (URL이나 임의 텍스트가 저장되어 있을 경우 마스터 키로 자동 정정)
      const storedKakaoKey = localStorage.getItem(this.kakaoAppKeyStorage);
      if (!storedKakaoKey || !/^[0-9a-fA-F]{32}$/.test(storedKakaoKey.trim())) {
        this.kakaoAppKey = this.kakaoMasterAppKey;
        localStorage.setItem(this.kakaoAppKeyStorage, this.kakaoMasterAppKey);
      } else {
        this.kakaoAppKey = storedKakaoKey.trim();
      }

      this.firebaseConfig = this.loadFirebaseConfig();
      this.init();
    }

    log(msg) {
      if (this.onDebugLog) this.onDebugLog(`[Auth] ${msg}`);
      console.log(`[AuthService] ${msg}`);
    }

    saveKakaoAppKey(key) {
      if (!key) {
        localStorage.removeItem(this.kakaoAppKeyStorage);
        this.kakaoAppKey = '';
      } else {
        localStorage.setItem(this.kakaoAppKeyStorage, key.trim());
        this.kakaoAppKey = key.trim();
        if (window.Kakao && !window.Kakao.isInitialized()) {
          try {
            window.Kakao.init(this.kakaoAppKey);
          } catch (e) {
            console.warn('Kakao init error', e);
          }
        }
      }
      this.log(`카카오 앱 키 저장: ${this.kakaoAppKey ? '등록 완료' : '초기화'}`);
    }

    loadFirebaseConfig() {
      try {
        const saved = localStorage.getItem(this.firebaseConfigKey);
        if (saved) return JSON.parse(saved);
      } catch (e) {
        console.warn('Firebase config parse error', e);
      }
      return null;
    }

    saveFirebaseConfig(config) {
      if (!config) {
        localStorage.removeItem(this.firebaseConfigKey);
        this.firebaseConfig = null;
        this.isFirebaseReady = false;
      } else {
        localStorage.setItem(this.firebaseConfigKey, JSON.stringify(config));
        this.firebaseConfig = config;
      }
      return this.init();
    }

    async init() {
      // 1. 기존 캐시된 로그인 유저 복원
      const cachedUser = this.loadCachedUser();
      if (cachedUser) {
        this.currentUser = cachedUser;
        if (this.onAuthStateChangedCallback) {
          this.onAuthStateChangedCallback(this.currentUser);
        }
      }

      // 2. Firebase 설정이 존재하면 동적 SDK 로드 시도
      if (this.firebaseConfig && this.firebaseConfig.apiKey && this.firebaseConfig.projectId) {
        try {
          await this.initFirebase(this.firebaseConfig);
        } catch (err) {
          this.log(`Firebase 초기화 실패: ${err.message}. 로컬 계정 모드로 동작합니다.`);
        }
      } else {
        this.log('Firebase 미설정 상태: 로컬 계정/데모 모드로 동작합니다.');
      }
    }

    loadCachedUser() {
      try {
        const data = localStorage.getItem(this.localUserKey);
        return data ? JSON.parse(data) : null;
      } catch (e) {
        return null;
      }
    }

    saveCachedUser(user) {
      if (user) {
        localStorage.setItem(this.localUserKey, JSON.stringify(user));
      } else {
        localStorage.removeItem(this.localUserKey);
      }
      this.currentUser = user;
      if (this.onAuthStateChangedCallback) {
        this.onAuthStateChangedCallback(this.currentUser);
      }
    }

    async initFirebase(config) {
      try {
        const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js');
        const { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js');
        const { getFirestore, doc, setDoc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js');

        this.firebaseApp = initializeApp(config);
        this.firebaseAuth = getAuth(this.firebaseApp);
        this.firestoreDb = getFirestore(this.firebaseApp);
        this.GoogleAuthProvider = GoogleAuthProvider;
        this.signInWithPopup = signInWithPopup;
        this.signInWithEmailAndPassword = signInWithEmailAndPassword;
        this.createUserWithEmailAndPassword = createUserWithEmailAndPassword;
        this.signOutFirebase = signOut;
        this.doc = doc;
        this.setDoc = setDoc;
        this.getDoc = getDoc;

        this.isFirebaseReady = true;
        this.log('Firebase 클라우드 연동 성공!');

        onAuthStateChanged(this.firebaseAuth, async (fbUser) => {
          if (fbUser) {
            const userObj = {
              uid: fbUser.uid,
              email: fbUser.email,
              displayName: fbUser.displayName || fbUser.email.split('@')[0],
              photoURL: fbUser.photoURL || null,
              provider: fbUser.providerData?.[0]?.providerId || 'password',
              lastLogin: Date.now()
            };
            this.saveCachedUser(userObj);
            this.log(`Firebase 로그인 완료: ${userObj.email}`);
            await this.syncFromCloud();
          } else if (this.isFirebaseReady && this.currentUser && this.currentUser.provider !== 'local') {
            this.saveCachedUser(null);
          }
        });
      } catch (err) {
        this.isFirebaseReady = false;
        throw err;
      }
    }

    // Google 소셜 로그인
    async signInWithGoogle() {
      if (this.isFirebaseReady && this.firebaseAuth && this.signInWithPopup) {
        try {
          const provider = new this.GoogleAuthProvider();
          const result = await this.signInWithPopup(this.firebaseAuth, provider);
          const fbUser = result.user;
          const userObj = {
            uid: fbUser.uid,
            email: fbUser.email,
            displayName: fbUser.displayName || '구글 사용자',
            photoURL: fbUser.photoURL || null,
            provider: 'google.com',
            lastLogin: Date.now()
          };
          this.saveCachedUser(userObj);
          this.log(`구글 로그인 성공: ${userObj.email}`);
          await this.syncFromCloud();
          return { success: true, user: userObj };
        } catch (err) {
          this.log(`구글 로그인 에러: ${err.message}`);
          throw err;
        }
      } else {
        // 로컬 데모 모드 (Firebase 키 미입력 상태)
        const mockUser = {
          uid: 'google-demo-' + Date.now().toString(36),
          email: 'google_user@demo.com',
          displayName: '구글 사용자 (체험 계정)',
          photoURL: null,
          provider: 'google_demo',
          lastLogin: Date.now()
        };
        this.saveCachedUser(mockUser);
        this.log(`[데모 모드] 구글 로그인 완료: ${mockUser.email}`);
        await this.syncFromCloud();
        return { success: true, user: mockUser, isDemo: true };
      }
    }

    // Kakao 실제 소셜 로그인 및 회원가입
    async signInWithKakao() {
      // 1. 카카오 공식 SDK 로드 여부 검사
      if (!window.Kakao) {
        throw new Error('카카오 SDK가 아직 준비되지 않았습니다. 잠시 후 다시 시도해주세요.');
      }

      // 2. 카카오 JavaScript 앱 키 확보 및 32자리 유효성 검증
      let appKey = this.kakaoAppKey || localStorage.getItem(this.kakaoAppKeyStorage);
      if (!appKey || !/^[0-9a-fA-F]{32}$/.test(appKey.trim())) {
        appKey = this.kakaoMasterAppKey;
        this.saveKakaoAppKey(appKey);
      }
      appKey = appKey.trim();

      // 3. 카카오 SDK 초기화 (기존 잘못 초기화되었을 수 있는 인스턴스를 완전 초기화 후 정식 키 적용)
      if (window.Kakao.isInitialized()) {
        try {
          if (typeof window.Kakao.cleanup === 'function') {
            window.Kakao.cleanup();
          }
        } catch (e) {
          console.warn('Kakao cleanup error:', e);
        }
      }
      try {
        window.Kakao.init(appKey);
      } catch (e) {
        console.warn('Kakao init error:', e);
      }

      this.log(`실제 카카오 로그인 팝업 창 호출 (AppKey: ${appKey.substring(0, 6)}...)...`);

      // 4. 공식 Kakao.Auth.login 호출 (scope 생략하여 개발자센터 기본 동의항목에 맞춤)
      return new Promise((resolve, reject) => {
        window.Kakao.Auth.login({
          success: (authObj) => {
            this.log('카카오 인증 토큰 수신 완료! 사용자 프로필 조회 중...');

            // 5. 실제 사용자 계정 정보(닉네임, 이메일, 프로필 이미지) 조회
            window.Kakao.API.request({
              url: '/v2/user/me',
              success: async (res) => {
                const kakaoAccount = res.kakao_account || {};
                const profile = kakaoAccount.profile || {};
                const email = kakaoAccount.email || `kakao_${res.id}@kakao.user`;
                const displayName = profile.nickname || '카카오 사용자';
                const photoURL = profile.profile_image_url || null;

                const userObj = {
                  uid: `kakao_${res.id}`,
                  email,
                  displayName,
                  photoURL,
                  provider: 'kakao',
                  accessToken: authObj.access_token,
                  lastLogin: Date.now()
                };

                this.saveCachedUser(userObj);
                this.log(`실제 카카오 로그인 성공: ${displayName} (${email})`);
                await this.syncFromCloud();
                resolve({ success: true, user: userObj });
              },
              fail: (err) => {
                const errMsg = err?.msg || '카카오 사용자 정보를 가져오지 못했습니다.';
                this.log(`카카오 사용자 정보 조회 실패: ${errMsg}`);
                reject(new Error(errMsg));
              }
            });
          },
          fail: (err) => {
            const errMsg = err?.error_description || err?.msg || '카카오 로그인이 취소되었거나 오류가 발생했습니다.';
            this.log(`카카오 로그인 실패: ${errMsg}`);
            reject(new Error(errMsg));
          }
        });
      });
    }

    // 이메일 로그인
    async signInWithEmail(email, password) {
      if (!email || !password) throw new Error('이메일과 비밀번호를 입력해주세요.');

      if (this.isFirebaseReady && this.firebaseAuth && this.signInWithEmailAndPassword) {
        try {
          const res = await this.signInWithEmailAndPassword(this.firebaseAuth, email, password);
          const fbUser = res.user;
          const userObj = {
            uid: fbUser.uid,
            email: fbUser.email,
            displayName: fbUser.displayName || fbUser.email.split('@')[0],
            photoURL: fbUser.photoURL || null,
            provider: 'password',
            lastLogin: Date.now()
          };
          this.saveCachedUser(userObj);
          this.log(`이메일 로그인 성공: ${userObj.email}`);
          await this.syncFromCloud();
          return { success: true, user: userObj };
        } catch (err) {
          this.log(`이메일 로그인 실패: ${err.message}`);
          throw err;
        }
      } else {
        // 로컬 계정 모드
        const localUsers = JSON.parse(localStorage.getItem('gemini_local_registered_users') || '{}');
        const lower = email.toLowerCase().trim();
        const account = localUsers[lower];
        if (!account || account.password !== password) {
          if (!account) {
            throw new Error('등록되지 않은 이메일입니다. 회원가입 탭에서 먼저 가입해주세요.');
          } else {
            throw new Error('비밀번호가 일치하지 않습니다.');
          }
        }
        const userObj = {
          uid: account.uid,
          email: account.email,
          displayName: account.displayName || lower.split('@')[0],
          photoURL: null,
          provider: 'local',
          lastLogin: Date.now()
        };
        this.saveCachedUser(userObj);
        this.log(`로컬 계정 로그인 성공: ${userObj.email}`);
        await this.syncFromCloud();
        return { success: true, user: userObj, isDemo: true };
      }
    }

    // 이메일 회원가입
    async signUpWithEmail(email, password, displayName = '', agreements = {}) {
      if (!email || !password) throw new Error('이메일과 비밀번호를 입력해주세요.');
      if (password.length < 6) throw new Error('비밀번호는 최소 6자 이상이어야 합니다.');

      if (this.isFirebaseReady && this.firebaseAuth && this.createUserWithEmailAndPassword) {
        try {
          const res = await this.createUserWithEmailAndPassword(this.firebaseAuth, email, password);
          const fbUser = res.user;
          const userObj = {
            uid: fbUser.uid,
            email: fbUser.email,
            displayName: displayName || email.split('@')[0],
            photoURL: null,
            provider: 'password',
            agreements,
            lastLogin: Date.now()
          };
          this.saveCachedUser(userObj);
          this.log(`이메일 회원가입 성공: ${userObj.email}`);
          await this.syncToCloud();
          return { success: true, user: userObj };
        } catch (err) {
          this.log(`이메일 가입 실패: ${err.message}`);
          throw err;
        }
      } else {
        // 로컬 계정 등록
        const localUsers = JSON.parse(localStorage.getItem('gemini_local_registered_users') || '{}');
        const lower = email.toLowerCase().trim();
        if (localUsers[lower]) {
          throw new Error('이미 등록된 이메일 계정입니다. 로그인 탭에서 로그인해주세요.');
        }
        const uid = 'usr_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
        const userObj = {
          uid,
          email: lower,
          displayName: displayName || lower.split('@')[0],
          password,
          agreements,
          createdAt: Date.now()
        };
        localUsers[lower] = userObj;
        localStorage.setItem('gemini_local_registered_users', JSON.stringify(localUsers));

        const sessionUser = {
          uid: userObj.uid,
          email: userObj.email,
          displayName: userObj.displayName,
          photoURL: null,
          provider: 'local',
          agreements,
          lastLogin: Date.now()
        };
        this.saveCachedUser(sessionUser);
        this.log(`로컬 계정 가입 완료: ${sessionUser.email}`);
        await this.syncToCloud();
        return { success: true, user: sessionUser, isDemo: true };
      }
    }

    // 로그아웃
    async signOut() {
      try {
        if (this.isFirebaseReady && this.firebaseAuth && this.signOutFirebase) {
          await this.signOutFirebase(this.firebaseAuth);
        }
      } catch (e) {
        console.warn('Firebase signout error', e);
      }
      this.saveCachedUser(null);
      this.log('로그아웃 완료');
    }

    // 클라우드 -> 로컬 데이터 동기화
    async syncFromCloud() {
      if (!this.currentUser) return;
      if (this.onSyncStatusChangedCallback) this.onSyncStatusChangedCallback('syncing');

      try {
        if (this.isFirebaseReady && this.firestoreDb && this.doc && this.getDoc) {
          const userDocRef = this.doc(this.firestoreDb, 'users', this.currentUser.uid);
          const docSnap = await this.getDoc(userDocRef);

          if (docSnap.exists()) {
            const data = docSnap.data();
            this.log('Firestore 클라우드 데이터 수신 완료');

            // 대화 히스토리 병합
            if (data.history && Array.isArray(data.history)) {
              const localHist = JSON.parse(localStorage.getItem('gemini_history') || '[]');
              const mergedHist = this.mergeSessions(localHist, data.history);
              localStorage.setItem('gemini_history', JSON.stringify(mergedHist));
            }

            // 학습된 AI 룰 병합
            if (data.learnedRules && Array.isArray(data.learnedRules)) {
              const localRules = JSON.parse(localStorage.getItem('gemini_learned_rules') || '[]');
              const mergedRules = this.mergeRules(localRules, data.learnedRules);
              localStorage.setItem('gemini_learned_rules', JSON.stringify(mergedRules));
            }

            if (data.contextSummary) {
              localStorage.setItem('gemini_context_summary', data.contextSummary);
            }
          } else {
            this.log('클라우드에 기존 데이터 없음 -> 현재 로컬 데이터 업로드');
            await this.syncToCloud();
          }
        } else {
          // 로컬 모드 사용자별 볼트 분리
          const userVault = JSON.parse(localStorage.getItem(`gemini_vault_${this.currentUser.uid}`) || '{}');
          if (userVault.history) {
            const localHist = JSON.parse(localStorage.getItem('gemini_history') || '[]');
            localStorage.setItem('gemini_history', JSON.stringify(this.mergeSessions(localHist, userVault.history)));
          }
          if (userVault.learnedRules) {
            const localRules = JSON.parse(localStorage.getItem('gemini_learned_rules') || '[]');
            localStorage.setItem('gemini_learned_rules', JSON.stringify(this.mergeRules(localRules, userVault.learnedRules)));
          }
        }

        if (this.onSyncStatusChangedCallback) this.onSyncStatusChangedCallback('synced');
      } catch (err) {
        this.log(`클라우드 동기화 실패: ${err.message}`);
        if (this.onSyncStatusChangedCallback) this.onSyncStatusChangedCallback('error');
      }
    }

    // 로컬 -> 클라우드 데이터 업로드
    async syncToCloud() {
      if (!this.currentUser) return;
      if (this.onSyncStatusChangedCallback) this.onSyncStatusChangedCallback('syncing');

      try {
        const history = JSON.parse(localStorage.getItem('gemini_history') || '[]');
        const learnedRules = JSON.parse(localStorage.getItem('gemini_learned_rules') || '[]');
        const contextSummary = localStorage.getItem('gemini_context_summary') || '';

        if (this.isFirebaseReady && this.firestoreDb && this.doc && this.setDoc) {
          const userDocRef = this.doc(this.firestoreDb, 'users', this.currentUser.uid);
          await this.setDoc(userDocRef, {
            email: this.currentUser.email,
            displayName: this.currentUser.displayName,
            history,
            learnedRules,
            contextSummary,
            updatedAt: Date.now()
          }, { merge: true });
          this.log('Firestore 클라우드 백업 완료');
        } else {
          // 로컬 볼트 백업
          const vault = { history, learnedRules, contextSummary, updatedAt: Date.now() };
          localStorage.setItem(`gemini_vault_${this.currentUser.uid}`, JSON.stringify(vault));
        }

        if (this.onSyncStatusChangedCallback) this.onSyncStatusChangedCallback('synced');
      } catch (err) {
        this.log(`클라우드 업로드 실패: ${err.message}`);
        if (this.onSyncStatusChangedCallback) this.onSyncStatusChangedCallback('error');
      }
    }

    mergeSessions(listA, listB) {
      const map = new Map();
      for (const item of listB) {
        const id = item.id || `${item.timestamp}_${item.mode}`;
        map.set(id, item);
      }
      for (const item of listA) {
        const id = item.id || `${item.timestamp}_${item.mode}`;
        map.set(id, item);
      }
      return Array.from(map.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    }

    mergeRules(listA, listB) {
      const map = new Map();
      for (const r of listB) {
        if (r && r.src) map.set(r.src.toLowerCase(), r);
      }
      for (const r of listA) {
        if (r && r.src) map.set(r.src.toLowerCase(), r);
      }
      return Array.from(map.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    }
  }

  window.AuthService = AuthService;
})(window);
