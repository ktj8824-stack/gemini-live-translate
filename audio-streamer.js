/**
 * Realtime Audio Streamer & Player for Gemini Live Translate
 * - Input: 16kHz 16-bit Mono Little-Endian PCM
 * - Output: 24kHz 16-bit Mono Little-Endian PCM
 */
class AudioStreamer {
  constructor({ onAudioChunk, onInputVolume, onOutputVolume }) {
    this.onAudioChunk = onAudioChunk;
    this.onInputVolume = onInputVolume;
    this.onOutputVolume = onOutputVolume;

    this.inputAudioContext = null;
    this.outputAudioContext = null;
    this.mediaStream = null;
    this.scriptProcessor = null;
    this.analyser = null;
    this.outputAnalyser = null;

    this.isPlaying = false;
    this.isRecording = false;

    // Output playback queue
    this.nextPlayTime = 0;
    this.outputSampleRate = 24000;
  }

  async startRecording(options = { echoCancellation: true }) {
    if (this.isRecording) return;

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: options.echoCancellation ?? true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      this.inputAudioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000
      });

      if (this.inputAudioContext.state === 'suspended') {
        await this.inputAudioContext.resume();
      }

      const source = this.inputAudioContext.createMediaStreamSource(this.mediaStream);

      // Input Analyser for waveform
      this.analyser = this.inputAudioContext.createAnalyser();
      this.analyser.fftSize = 256;
      source.connect(this.analyser);

      // ScriptProcessor for 100ms PCM chunking
      // bufferSize 2048 at 16kHz is ~128ms
      const bufferSize = 2048;
      this.scriptProcessor = this.inputAudioContext.createScriptProcessor(bufferSize, 1, 1);

      this.scriptProcessor.onaudioprocess = (event) => {
        if (!this.isRecording) return;

        const inputBuffer = event.inputBuffer.getChannelData(0);
        
        // Calculate volume for UI
        let sum = 0;
        for (let i = 0; i < inputBuffer.length; i++) {
          sum += inputBuffer[i] * inputBuffer[i];
        }
        const rms = Math.sqrt(sum / inputBuffer.length);
        if (this.onInputVolume) {
          this.onInputVolume(rms);
        }

        // Convert Float32 to 16-bit PCM Int16 Little-Endian
        const pcm16 = this.floatTo16BitPCM(inputBuffer);
        const base64Chunk = this.arrayBufferToBase64(pcm16.buffer);

        if (this.onAudioChunk) {
          this.onAudioChunk(base64Chunk);
        }
      };

      source.connect(this.scriptProcessor);
      this.scriptProcessor.connect(this.inputAudioContext.destination);

      this.isRecording = true;
      console.log('[AudioStreamer] Recording started at 16kHz PCM');
    } catch (err) {
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

    console.log('[AudioStreamer] Recording stopped');
  }

  initOutputContext() {
    if (!this.outputAudioContext || this.outputAudioContext.state === 'closed') {
      this.outputAudioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: this.outputSampleRate
      });
      this.outputAnalyser = this.outputAudioContext.createAnalyser();
      this.outputAnalyser.fftSize = 256;
      this.outputAnalyser.connect(this.outputAudioContext.destination);
      this.nextPlayTime = this.outputAudioContext.currentTime;
    }

    if (this.outputAudioContext.state === 'suspended') {
      this.outputAudioContext.resume();
    }
  }

  /**
   * Play received 24kHz 16-bit PCM audio chunk (Base64)
   */
  playChunk(base64Data) {
    try {
      this.initOutputContext();

      const binary = atob(base64Data);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      // Convert 16-bit Int16 PCM to Float32
      const dataView = new DataView(bytes.buffer);
      const sampleCount = len / 2;
      const float32Array = new Float32Array(sampleCount);

      for (let i = 0; i < sampleCount; i++) {
        const int16 = dataView.getInt16(i * 2, true); // little-endian
        float32Array[i] = int16 < 0 ? int16 / 0x8000 : int16 / 0x7FFF;
      }

      const audioBuffer = this.outputAudioContext.createBuffer(1, sampleCount, this.outputSampleRate);
      audioBuffer.getChannelData(0).set(float32Array);

      const source = this.outputAudioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.outputAnalyser);

      const currentTime = this.outputAudioContext.currentTime;
      if (this.nextPlayTime < currentTime) {
        this.nextPlayTime = currentTime;
      }

      source.start(this.nextPlayTime);
      this.nextPlayTime += audioBuffer.duration;

      // Output volume calculation
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
