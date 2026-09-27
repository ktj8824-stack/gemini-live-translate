/**
 * iOS Safari & Android Chrome Production-Grade Audio Streamer
 * - Fixes iOS Safari 0% silent microphone capture bug (GainNode 0 mute loop)
 * - 16kHz resampling with 100ms precise PCM buffering
 * - 24kHz smooth queue playback
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
    this.muteGain = null;
    this.isRecording = false;

    this.chunkSampleSize = 1600; 
    this.sampleAccumulator = [];

    this.nextPlayTime = 0;
    this.outputSampleRate = 24000;
  }

  async unlockAudio() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!this.outputAudioContext || this.outputAudioContext.state === 'closed') {
        this.outputAudioContext = new AudioCtx({ sampleRate: this.outputSampleRate });
      }
      if (this.outputAudioContext.state === 'suspended') {
        await this.outputAudioContext.resume();
      }
      this.nextPlayTime = this.outputAudioContext.currentTime;
      this.onDebugLog('[Audio] Output Engine Ready: ' + this.outputAudioContext.state);
    } catch (e) {
      console.warn('[Audio] Unlock error:', e);
    }
  }

  async startRecording(options = { echoCancellation: true }) {
    if (this.isRecording) return;

    await this.unlockAudio();
    this.sampleAccumulator = [];

    try {
      // Request mic stream
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
      this.onDebugLog(`[Mic] Hardware SampleRate: ${inputRate}Hz`);

      const source = this.inputAudioContext.createMediaStreamSource(this.mediaStream);

      // Buffer size 2048
      const bufferSize = 2048;
      this.scriptProcessor = this.inputAudioContext.createScriptProcessor(bufferSize, 1, 1);

      // CRITICAL FIX FOR iOS SAFARI:
      // In iOS Safari, connecting scriptProcessor directly to destination causes mic to mute (0 level).
      // Connecting through a muteGain (gain = 0) to destination keeps the audio pipeline running with real non-zero microphone data!
      this.muteGain = this.inputAudioContext.createGain();
      this.muteGain.gain.setValueAtTime(0, this.inputAudioContext.currentTime);

      this.scriptProcessor.onaudioprocess = (event) => {
        if (!this.isRecording) return;

        const inputData = event.inputBuffer.getChannelData(0);

        // Calculate RMS Volume
        let sum = 0;
        let peak = 0;
        for (let i = 0; i < inputData.length; i++) {
          const abs = Math.abs(inputData[i]);
          if (abs > peak) peak = abs;
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);

        if (this.onInputVolume) {
          this.onInputVolume(Math.max(rms, peak * 0.5));
        }

        // Resample native to 16kHz
        const resampled = this.resampleTo16k(inputData, inputRate);
        
        for (let i = 0; i < resampled.length; i++) {
          this.sampleAccumulator.push(resampled[i]);
        }

        // Emit exact 100ms (1600 samples) chunks
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
      this.muteGain.connect(this.inputAudioContext.destination);

      this.isRecording = true;
      this.onDebugLog('[Mic] Active & Streaming');
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

    if (this.muteGain) {
      this.muteGain.disconnect();
      this.muteGain = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.inputAudioContext && this.inputAudioContext.state !== 'closed') {
      this.inputAudioContext.close();
      this.inputAudioContext = null;
    }

    this.sampleAccumulator = [];
    this.onDebugLog('[Audio] Mic stopped');
  }

  resampleTo16k(inputBuffer, inputSampleRate) {
    if (inputSampleRate === 16000) {
      return inputBuffer;
    }
    const ratio = inputSampleRate / 16000;
    const newLength = Math.round(inputBuffer.length / ratio);
    const result = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
      const originIndex = i * ratio;
      const indexFloor = Math.floor(originIndex);
      const indexCeil = Math.min(inputBuffer.length - 1, Math.ceil(originIndex));
      const fraction = originIndex - indexFloor;
      result[i] = inputBuffer[indexFloor] * (1 - fraction) + inputBuffer[indexCeil] * fraction;
    }
    return result;
  }

  floatTo16BitPCM(samples) {
    const buffer = new ArrayBuffer(samples.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < samples.length; i++) {
      // Amplify slightly for mobile microphones if needed
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
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!this.outputAudioContext || this.outputAudioContext.state === 'closed') {
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
      const sampleCount = Math.floor(len / 2);
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
}

window.AudioStreamer = AudioStreamer;
