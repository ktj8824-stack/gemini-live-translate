# LiveTranslate iOS (Xcode Project)

번역톡 실시간 동시통역 앱의 공식 **Xcode (iOS) 프로젝트**입니다.
WKWebView 기반으로 패키징되어 있으며, 아이폰 하드웨어 마이크와 24kHz 오디오 출력을 네이티브 수준으로 지원합니다.

---

## 📱 Xcode에서 실행 및 아이폰에 설치하는 방법

### 1단계: Xcode 프로젝트 열기
Finder에서 다음 파일을 더블 클릭하여 엽니다:
```bash
ios/LiveTranslate.xcodeproj
```
(또는 터미널에서 `open ios/LiveTranslate.xcodeproj`)

---

### 2단계: 개발자 계정 서명 설정 (Signing)
1. Xcode 좌측 네비게이터에서 맨 위 **`LiveTranslate` (파란색 프로젝트 아이콘)** 선택
2. 가운데 화면에서 **`TARGETS` -> `LiveTranslate`** 선택
3. 상단 탭에서 **`Signing & Capabilities`** 탭 클릭
4. **`Team`** 드롭다운에서 본인의 Apple ID / 개발자 계정 선택
   *(계정이 없다면 'Add Account...'를 눌러 평소 쓰시는 Apple ID를 로그인하시면 무료 개인 개발자로 즉시 등록됩니다)*
5. `Bundle Identifier`가 필요시 고유한 이름으로 자동 설정됩니다 (예: `com.yourname.LiveTranslate`).

---

### 3단계: 아이폰 연결 및 실행
1. 아이폰을 Mac에 USB 케이블로 연결합니다.
2. Xcode 상단 기기 선택 바에서 **`My Mac` 대신 연결한 본인의 `iPhone`**을 선택합니다.
3. 좌측 상단의 **▶ (Run)** 버튼을 클릭하거나 `Cmd + R`을 누릅니다.
4. 빌드가 완료되면 아이폰에 **번역톡** 앱이 자동으로 설치되고 실행됩니다!

---

### 🎙️ 마이크 권한 안내
- 앱이 처음 실행되면 마이크 권한 팝업("실시간 동시통역을 위해 마이크 음성을 인식하고 통역을 진행합니다")이 나타납니다.
- **[허용]**을 누르시면 마이크가 즉시 활성화되어 실시간 통역이 시작됩니다.

---

### 💡 주요 기능 및 구현 사양
- **iOS 15+ WKUIDelegate 미디어 권한 자동 승인**: WKWebView 내 `navigator.mediaDevices.getUserMedia` 완벽 지원
- **AVAudioSession PlayAndRecord**: 마이크 입력과 스피커/블루투스 출력이 하울링/에코 없이 동시 작동
- **로컬 번들 오프라인 패키징**: `www/` 폴더 내에 HTML/CSS/JS가 모두 포함되어 빠르고 가볍게 구동
- **Safari 웹 검사기 지원**: Mac Safari의 개발자용 메뉴에서 아이폰 웹뷰를 실시간 디버깅 가능

---

### 🔐 서버 주소 설정 (필수)
보안을 위해 Gemini API 키는 앱에 들어 있지 않습니다. 앱은 번역톡 서버에서 **1회용 임시 토큰**을 받아 통역합니다.
1. 서버(`server.js`)를 배포하고 `.env`에 `GEMINI_API_KEY`를 설정합니다. (`.env.example` 참고)
2. `ios/LiveTranslate/www/config.js`의 `TALK_API_BASE`를 배포한 서버 주소로 바꿉니다.
