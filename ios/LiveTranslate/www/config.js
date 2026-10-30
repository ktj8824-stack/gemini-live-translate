// iOS 앱은 file:// 로 실행되므로, 배포된 번역톡 서버 주소를 반드시 넣어야 합니다.
// (서버 .env 에 GEMINI_API_KEY 설정 필요)
// 예) window.TALK_API_BASE = 'https://talk.example.com';
window.TALK_API_BASE = window.TALK_API_BASE || 'https://YOUR-SERVER-URL';
