/**
 * Mobile-Robust Realtime Audio Streamer & Player for Gemini Live Translate
 * - Captures mic at native hardware rate & resamples cleanly to 16kHz 16-bit PCM Mono
 * - Plays back 24kHz 16-bit PCM smoothly with Mobile AudioContext Unlock
 */
class AudioStreamer {
  constructor({ onAudioChunk, onInputVolume, onOutputVolume, onDebugLog }) {
    this.onAudioChunk = onAudioChunk;
    this.onInputVolume = onInputVolume;
    this.onOutputVolume = onOutputVolume;
    this.onDebugLog = onDebugLog || console.log;

    this.inputAudioContext = null;
    this.outputAudioContext = null;
    this.mediaStream = null;
    this.scriptProcessor = null;
    this.isRecording = false;

    this.nextPlayTime = 0;
    this.outputSampleRate = 24000;
    this.targetInputRate = 16000;
  }

  // Mobile AudioContext Unlocker on user gesture
  async unlockAudio() {
    try {
      if (!this.outputAudioContext || this.outputAudioContext.state === 'closed') {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        this.outputAudioContext = new AudioCtx({ sampleRate: this.outputSampleRate });
      }
      if (this.outputAudioContext.state === 'suspended') {
        await this.outputAudioContext.resume();
      }
      // Play a tiny silent buffer to warm up mobile audio pipeline
      const silentBuffer = this.outputAudioContext.createBuffer(1, 1, this.outputSampleRate);
      const source = this.outputAudioContext.createBufferSource();
      source.buffer = silentBuffer;
      source.connect(this.outputAudioContext.destination);
      source.start(0);
      this.nextPlayTime = this.outputAudioContext.currentTime;
      this.onDebugLog('[Audio] Output audio unlocked and resumed');
    } catch (e) {
      console.warn('[Audio] Unlock warning:', e);
    }
  }

  async startRecording(options = { echoCancellation: true }) {
    if (this.isRecording) return;

    await this.unlockAudio();

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: options.echoCancellation ?? true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.inputAudioContext = new AudioCtx();

      if (this.inputAudioContext.state === 'suspended') {
        await this.inputAudioContext.resume();
      }

      const inputRate = this.inputAudioContext.sampleRate;
      this.onDebugLog(`[Mic] Started. Hardware SampleRate: ${inputRate}Hz -> Resampling to 16kHz`);

      const source = this.inputAudioContext.createMediaStreamSource(this.mediaStream);

      // Buffer size 4096 gives ~85ms latency at 48kHz
      const bufferSize = 4096;
      this.scriptProcessor = this.inputAudioContext.createScriptProcessor(bufferSize, 1, 1);

      this.scriptProcessor.onaudioprocess = (event) => {
        if (!this.isRecording) return;

        const inputData = event.inputBuffer.getChannelData(0);

        // Calculate input volume
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);
        if (this.onInputVolume) {
          this.onInputVolume(rms);
        }

        // Resample native rate to 16000Hz
        const resampled = this.downsampleBuffer(inputData, inputRate, this.targetInputRate);

        // Convert to 16-bit PCM Little Endian
        const pcm16 = this.floatTo16BitPCM(resampled);
        const base64Chunk = this.arrayBufferToBase64(pcm16.buffer);

        if (this.onAudioChunk) {
          this.onAudioChunk(base64Chunk);
        }
      };

      source.connect(this.scriptProcessor);
      this.scriptProcessor.connect(this.inputAudioContext.destination);

      this.isRecording = true;
    } catch (err) {
      this.onDebugLog(`[Mic Error] ${err.message}`);
      console.error('[AudioStreamer] Error starting mic:', err);
      throw err;
    }
  }

  stopRecording() {
    this.isRecording = false;

    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.inputAudioContext && this.inputAudioContext.state !== 'closed') {
      this.inputAudioContext.close();
      this.inputAudioContext = null;
    }

    this.onDebugLog('[Audio] Recording stopped');
  }

  downsampleBuffer(buffer, sampleRate, targetRate) {
    if (sampleRate === targetRate) {
      return buffer;
    }
    const sampleRateRatio = sampleRate / targetRate;
    const newLength = Math.round(buffer.length / sampleRateRatio);
    const result = new Float32Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;

    while (offsetResult < result.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
      let accum = 0;
      let count = 0;
      for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
        accum += buffer[i];
        count++;
      }
      result[offsetResult] = count > 0 ? accum / count : 0;
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }
    return result;
  }

  playChunk(base64Data) {
    try {
      if (!this.outputAudioContext || this.outputAudioContext.state === 'closed') {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        this.outputAudioContext = new AudioCtx({ sampleRate: this.outputSampleRate });
      }

      if (this.outputAudioContext.state === 'suspended') {
        this.outputAudioContext.resume();
      }

      const binary = atob(base64Data);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      const dataView = new DataView(bytes.buffer);
      const sampleCount = len / 2;
      const float32Array = new Float32Array(sampleCount);

      for (let i = 0; i < sampleCount; i++) {
        const int16 = dataView.getInt16(i * 2, true);
        float32Array[i] = int16 < 0 ? int16 / 0x8000 : int16 / 0x7FFF;
      }

      const audioBuffer = this.outputAudioContext.createBuffer(1, sampleCount, this.outputSampleRate);
      audioBuffer.getChannelData(0).set(float32Array);

      const source = this.outputAudioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.outputAudioContext.destination);

      const currentTime = this.outputAudioContext.currentTime;
      if (this.nextPlayTime < currentTime) {
        this.nextPlayTime = currentTime;
      }

      source.start(this.nextPlayTime);
      this.nextPlayTime += audioBuffer.duration;

      if (this.onOutputVolume) {
        let sum = 0;
        for (let i = 0; i < float32Array.length; i++) {
          sum += float32Array[i] * float32Array[i];
        }
        const rms = Math.sqrt(sum / float32Array.length);
        this.onOutputVolume(rms);
      }
    } catch (err) {
      console.error('[AudioStreamer] Error playing chunk:', err);
    }
  }

  floatTo16BitPCM(float32Array) {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < float32Array.length; i++) {
      let s = Math.max(-1, Math.min(1, float32Array[i]));
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return new Int16Array(buffer);
  }

  arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}

window.AudioStreamer = AudioStreamer;
