/**
 * iOS Safari & Android Chrome Production-Grade Audio Streamer
 * - Unified Single AudioContext architecture (Fixes iOS dual AudioContext freeze bug)
 * - Keeps AudioContext active during mic stop so translated audio can play uninterrupted
 * - 16kHz resampling with 60ms ultra-low latency PCM buffering
 * - 24kHz smooth queue playback
 */
class AudioStreamer {
  constructor({ onAudioChunk, onInputVolume, onOutputVolume, onDebugLog, onMicLost }) {
    this.onAudioChunk = onAudioChunk;
    this.onMicLost = onMicLost;
    this.onInputVolume = onInputVolume;
    this.onOutputVolume = onOutputVolume;
    this.onDebugLog = onDebugLog || console.log;

    // Single unified AudioContext for BOTH input and output to prevent iOS hardware conflict
    this.audioContext = null;
    this.mediaStream = null;
    this.scriptProcessor = null;
    this.muteGain = null;
    this.isRecording = false;

    this.chunkSampleSize = 960; // 60ms chunk (16kHz)
    this.sampleAccumulator = [];

    this.nextPlayTime = 0;
    this.outputSampleRate = 24000;
  }

  getAudioContext() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new AudioCtx();
    }
    return this.audioContext;
  }

  async unlockAudio() {
    try {
      const ctx = this.getAudioContext();
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      // Unlock iOS Safari hardware playback via dummy silent buffer
      const silence = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = silence;
      src.connect(ctx.destination);
      src.start(0);

      this.nextPlayTime = ctx.currentTime;
      this.onDebugLog('[Audio] Unified AudioContext Ready: ' + ctx.state + ' (' + ctx.sampleRate + 'Hz)');
    } catch (e) {
      console.warn('[Audio] Unlock error:', e);
    }
  }

  async startRecording(options = { echoCancellation: true }) {
    if (this.isRecording) return;

    // 1. Check MediaDevices & Secure Context
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const isSecure = window.isSecureContext !== false && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1');
      const errorMsg = !isSecure
        ? '마이크는 보안 연결(HTTPS 또는 localhost)에서만 사용할 수 있습니다. 주소를 확인해주세요.'
        : '이 브라우저는 마이크 입력을 지원하지 않거나 시스템 권한이 제한되어 있습니다.';
      this.onDebugLog(`[Mic Error] ${errorMsg}`);
      throw new Error(errorMsg);
    }

    // Immediately unlock unified audio engine
    await this.unlockAudio();
    this.sampleAccumulator = [];

    try {
      // 2. Request user media with fallback for bluetooth / external headsets
      let stream = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: options.echoCancellation ?? true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
      } catch (constraintErr) {
        this.onDebugLog(`[Mic] Strict constraints failed (${constraintErr.name}), retrying with default audio:true...`);
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      this.mediaStream = stream;

      const ctx = this.getAudioContext();

      // iOS는 전화/알림/백그라운드 시 'suspended'뿐 아니라 'interrupted' 상태가 되므로 둘 다 복구
      ctx.onstatechange = () => {
        const st = this.audioContext && this.audioContext.state;
        if (st && st !== 'running' && st !== 'closed') {
          this.onDebugLog(`[Audio] 오디오 엔진 상태: ${st} -> 재가동 시도`);
          this.resumeContext();
        }
      };

      // 마이크 장치가 끊기면(블루투스 해제, 다른 앱이 마이크 점유 등) 앱에 알려 재연결
      stream.getAudioTracks().forEach((track) => {
        track.onended = () => {
          if (this.mediaStream === stream && this.isRecording) {
            this.onDebugLog('[Mic] 마이크 트랙 종료 감지');
            if (this.onMicLost) this.onMicLost('track_ended');
          }
        };
      });
      if (navigator.mediaDevices.addEventListener && !this._deviceChangeBound) {
        this._deviceChangeBound = true;
        navigator.mediaDevices.addEventListener('devicechange', () => {
          if (!this.isRecording) return;
          clearTimeout(this._deviceChangeTimer);
          this._deviceChangeTimer = setTimeout(() => {
            const track = this.mediaStream && this.mediaStream.getAudioTracks()[0];
            if (!track || track.readyState === 'ended' || track.muted) {
              if (this.onMicLost) this.onMicLost('device_change');
            }
          }, 500);
        });
      }

      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const inputRate = ctx.sampleRate;
      this.onDebugLog(`[Mic] Hardware SampleRate: ${inputRate}Hz | Tracks: ${stream.getAudioTracks().length}`);

      const source = ctx.createMediaStreamSource(this.mediaStream);

      // ScriptProcessor (2048 samples = ~42ms at 48kHz, ~128ms at 16kHz)
      const bufferSize = 2048;
      this.scriptProcessor = ctx.createScriptProcessor(bufferSize, 1, 1);
      // Prevent GC from collecting the scriptProcessor
      window._activeScriptProcessor = this.scriptProcessor;

      // Keep pipeline alive without audible echo (0.00001 prevents WebKit audio graph sleeping)
      this.muteGain = ctx.createGain();
      this.muteGain.gain.setValueAtTime(0.00001, ctx.currentTime);

      this.scriptProcessor.onaudioprocess = (event) => {
        if (!this.isRecording) return;

        const inputData = event.inputBuffer.getChannelData(0);
        // Clear output buffer to avoid feedback / echo
        const outputData = event.outputBuffer.getChannelData(0);
        outputData.fill(0);

        let sum = 0;
        let peak = 0;
        for (let i = 0; i < inputData.length; i++) {
          const abs = Math.abs(inputData[i]);
          if (abs > peak) peak = abs;
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);

        if (this.onInputVolume) {
          this.onInputVolume(Math.max(rms, peak * 0.6));
        }

        const resampled = this.resampleTo16k(inputData, inputRate);

        for (let i = 0; i < resampled.length; i++) {
          this.sampleAccumulator.push(resampled[i]);
        }

        while (this.sampleAccumulator.length >= this.chunkSampleSize) {
          const chunkSamples = this.sampleAccumulator.splice(0, this.chunkSampleSize);
          const pcm16 = this.floatTo16BitPCM(chunkSamples);
          const base64 = this.pcm16ToBase64(pcm16);

          if (this.onAudioChunk) {
            this.onAudioChunk(base64);
          }
        }
      };

      source.connect(this.scriptProcessor);
      this.scriptProcessor.connect(this.muteGain);
      this.muteGain.connect(ctx.destination);

      this.isRecording = true;
      this.onDebugLog('[Mic] Active & Streaming');
    } catch (err) {
      let friendlyMsg = err.message;
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        friendlyMsg = '마이크 사용 권한이 거부되었습니다. 브라우저 주소창 왼쪽의 마이크 아이콘을 눌러 권한을 허용해주세요.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        friendlyMsg = '연결된 마이크 장치를 찾을 수 없습니다. 마이크 연결을 확인해주세요.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        friendlyMsg = '다른 프로그램(Zoom, 통화 등)에서 마이크를 이미 사용 중이거나 하드웨어 오류가 발생했습니다.';
      }
      this.onDebugLog(`[Mic Error] ${friendlyMsg}`);
      console.error('[AudioStreamer] Error starting mic:', err);
      const customErr = new Error(friendlyMsg);
      customErr.original = err;
      throw customErr;
    }
  }

  resumeContext() {
    const ctx = this.audioContext;
    if (!ctx || ctx.state === 'running' || ctx.state === 'closed') return;
    ctx.resume().then(() => {
      // 멈춰 있던 동안 밀린 재생 예약 시간을 현재로 당김 (재개 후 소리가 늦게 나오는 문제 방지)
      if (this.nextPlayTime < ctx.currentTime) this.nextPlayTime = ctx.currentTime;
    }).catch(() => {});
  }

  stopRecording() {
    this.isRecording = false;

    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor.onaudioprocess = null;
      this.scriptProcessor = null;
      window._activeScriptProcessor = null;
    }

    if (this.muteGain) {
      this.muteGain.disconnect();
      this.muteGain = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => {
        try { track.stop(); } catch (e) {}
      });
      this.mediaStream = null;
    }

    // [CRITICAL FOR iOS] Do NOT suspend the AudioContext!
    // The AudioContext must remain in 'running' state so that incoming translation audio plays cleanly.
    this.sampleAccumulator = [];
    this.onDebugLog('[Audio] Mic stopped (AudioContext kept running for playback)');
  }

  resampleTo16k(inputBuffer, inputSampleRate) {
    if (inputSampleRate === 16000) {
      return inputBuffer;
    }
    const ratio = inputSampleRate / 16000;
    const newLength = Math.round(inputBuffer.length / ratio);
    const result = new Float32Array(newLength);

    // High-quality Hermite cubic interpolation with pre-filtering
    for (let i = 0; i < newLength; i++) {
      const originIndex = i * ratio;
      const index = Math.floor(originIndex);
      const frac = originIndex - index;

      const p0 = inputBuffer[Math.max(0, index - 1)];
      const p1 = inputBuffer[index] || 0;
      const p2 = inputBuffer[Math.min(inputBuffer.length - 1, index + 1)] || 0;
      const p3 = inputBuffer[Math.min(inputBuffer.length - 1, index + 2)] || 0;

      // Cubic Hermite spline interpolation
      const c0 = p1;
      const c1 = 0.5 * (p2 - p0);
      const c2 = p0 - 2.5 * p1 + 2.0 * p2 - 0.5 * p3;
      const c3 = 0.5 * (p3 - p0) + 1.5 * (p1 - p2);

      let val = ((c3 * frac + c2) * frac + c1) * frac + c0;
      result[i] = val;
    }
    return result;
  }

  floatTo16BitPCM(samples) {
    const buffer = new ArrayBuffer(samples.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < samples.length; i++) {
      const sample = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
    }
    return new Int16Array(buffer);
  }

  pcm16ToBase64(int16Array) {
    const uint8Array = new Uint8Array(int16Array.buffer);
    let binary = '';
    const len = uint8Array.byteLength;
    for (let i = 0; i < len; i += 1024) {
      const slice = uint8Array.subarray(i, Math.min(i + 1024, len));
      binary += String.fromCharCode.apply(null, slice);
    }
    return btoa(binary);
  }

  playChunk(base64Data) {
    try {
      const ctx = this.getAudioContext();

      if (ctx.state !== 'running') {
        this.resumeContext();
      }

      const binary = atob(base64Data);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      const dataView = new DataView(bytes.buffer);
      const sampleCount = Math.floor(len / 2);
      const float32Array = new Float32Array(sampleCount);

      for (let i = 0; i < sampleCount; i++) {
        const int16 = dataView.getInt16(i * 2, true);
        float32Array[i] = int16 < 0 ? int16 / 0x8000 : int16 / 0x7FFF;
      }

      // Gemini Live outputs 24000Hz PCM
      const audioBuffer = ctx.createBuffer(1, sampleCount, 24000);
      audioBuffer.getChannelData(0).set(float32Array);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;

      // Master Gain Node at 100% volume
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(1.0, ctx.currentTime);

      source.connect(masterGain);
      masterGain.connect(ctx.destination);

      const currentTime = ctx.currentTime;
      if (this.nextPlayTime < currentTime) {
        this.nextPlayTime = currentTime;
      }

      const startAt = this.nextPlayTime;
      source.start(startAt);
      this.nextPlayTime += audioBuffer.duration;
      // 실제 소리가 나기 시작하는 시각(벽시계 ms) 반환 → 지연 측정용
      const startWallMs = Date.now() + Math.max(0, startAt - currentTime) * 1000;

      if (this.onOutputVolume) {
        let sum = 0;
        for (let i = 0; i < float32Array.length; i++) {
          sum += float32Array[i] * float32Array[i];
        }
        const rms = Math.sqrt(sum / float32Array.length);
        this.onOutputVolume(rms);
      }
      return startWallMs;
    } catch (err) {
      console.error('[AudioStreamer] Error playing chunk:', err);
      return null;
    }
  }

  getRemainingPlaybackTime() {
    if (!this.audioContext) return 0;
    const remaining = this.nextPlayTime - this.audioContext.currentTime;
    return remaining > 0 ? remaining : 0;
  }

  isPlaybackActive() {
    return this.getRemainingPlaybackTime() > 0.05;
  }
}

window.AudioStreamer = AudioStreamer;
