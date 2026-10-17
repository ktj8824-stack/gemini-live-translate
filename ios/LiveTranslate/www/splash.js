/**
 * App Splash & Intro Motion Controller
 * Supports both high-end Canvas/CSS particle motion and optional intro.mp4 video
 */
class SplashIntro {
  constructor(options = {}) {
    this.duration = options.duration || 3200; // Total display time in ms
    this.container = document.getElementById('app-splash-screen');
    this.canvas = document.getElementById('splash-canvas');
    this.video = document.getElementById('splash-video');
    this.skipBtn = document.getElementById('btn-skip-splash');
    this.statusText = document.getElementById('splash-status-text');
    this.progressBar = document.querySelector('.splash-loader-progress');
    
    this.animFrameId = null;
    this.isDismissed = false;
    this.startTime = null;
    this.particles = [];
    
    if (!this.container) return;

    this.init();
  }

  init() {
    // Setup Skip button
    if (this.skipBtn) {
      this.skipBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.dismiss();
      });
    }

    // Try checking if a real video file (intro.mp4) exists and can play
    this.checkAndPlayVideo().then((hasVideo) => {
      if (!hasVideo) {
        this.startCanvasMotion();
      }
    });

    // Fallback safety timer: dismiss after maximum 4 seconds
    setTimeout(() => {
      if (!this.isDismissed) {
        this.dismiss();
      }
    }, this.duration + 500);
  }

  async checkAndPlayVideo() {
    if (!this.video) return false;

    return new Promise((resolve) => {
      let isResolved = false;
      const done = (val) => {
        if (!isResolved) {
          isResolved = true;
          resolve(val);
        }
      };

      // Set timeout in case network hangs
      const timeoutTimer = setTimeout(() => done(false), 800);

      this.video.src = 'intro.mp4';
      this.video.addEventListener('canplaythrough', () => {
        clearTimeout(timeoutTimer);
        this.video.style.display = 'block';
        if (this.canvas) this.canvas.style.display = 'none';
        
        const playPromise = this.video.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              this.video.onended = () => this.dismiss();
              done(true);
            })
            .catch(() => done(false));
        } else {
          done(false);
        }
      }, { once: true });

      this.video.addEventListener('error', () => {
        clearTimeout(timeoutTimer);
        done(false);
      }, { once: true });

      this.video.load();
    });
  }

  startCanvasMotion() {
    if (!this.canvas) return;

    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 2, 2.5);
    const resize = () => {
      this.width = this.canvas.clientWidth || window.innerWidth;
      this.height = this.canvas.clientHeight || window.innerHeight;
      this.canvas.width = this.width * dpr;
      this.canvas.height = this.height * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    // Initialize flowing particles
    const particleCount = 42;
    this.particles = [];
    for (let i = 0; i < particleCount; i++) {
      this.particles.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        size: Math.random() * 2.2 + 0.8,
        speedX: (Math.random() - 0.5) * 1.2,
        speedY: (Math.random() - 0.5) * 1.2,
        opacity: Math.random() * 0.7 + 0.3,
        color: i % 2 === 0 ? 'rgba(0, 229, 255,' : 'rgba(168, 85, 247,' // Cyan vs Violet
      });
    }

    this.startTime = performance.now();

    const render = (now) => {
      if (this.isDismissed) return;

      const elapsed = now - this.startTime;
      const progress = Math.min(elapsed / this.duration, 1.0);

      // Update progress bar & label
      if (this.progressBar) {
        this.progressBar.style.width = `${Math.min(progress * 105, 100)}%`;
      }
      if (this.statusText) {
        if (progress < 0.4) {
          this.statusText.textContent = '통역 신경망 연결 중...';
        } else if (progress < 0.8) {
          this.statusText.textContent = '오디오 스트리머 최적화 중...';
        } else {
          this.statusText.textContent = '통역 준비 완료!';
        }
      }

      ctx.clearRect(0, 0, this.width, this.height);

      const cx = this.width / 2;
      const cy = this.height / 2;

      // 1. Draw central glowing radial aura
      const pulse = 1 + Math.sin(elapsed * 0.004) * 0.15;
      const radialGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, 180 * pulse);
      radialGrad.addColorStop(0, 'rgba(59, 130, 246, 0.22)');
      radialGrad.addColorStop(0.5, 'rgba(139, 92, 246, 0.12)');
      radialGrad.addColorStop(1, 'rgba(10, 13, 20, 0)');
      ctx.fillStyle = radialGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, 220, 0, Math.PI * 2);
      ctx.fill();

      // 2. Draw dual oscillating harmonic voice waves (Cyan & Magenta convergence)
      const waveCount = 2;
      for (let w = 0; w < waveCount; w++) {
        const isCyan = w === 0;
        const color = isCyan ? 'rgba(0, 229, 255, 0.45)' : 'rgba(236, 72, 153, 0.45)';
        const phaseOffset = isCyan ? 0 : Math.PI;
        const waveSpeed = 0.003;
        const waveFreq = 0.012;
        const waveAmp = (25 + Math.sin(elapsed * 0.002) * 12) * Math.sin(progress * Math.PI);

        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;

        for (let x = 0; x <= this.width; x += 4) {
          // Attenuate waves toward edges so they focus in center
          const distFromCenter = Math.abs(x - cx) / cx;
          const envelope = Math.max(0, 1 - distFromCenter * 0.85);
          const y = cy + Math.sin(x * waveFreq + elapsed * waveSpeed + phaseOffset) * waveAmp * envelope;

          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // 3. Draw converging particles
      for (let p of this.particles) {
        p.x += p.speedX;
        p.y += p.speedY;

        // Attract toward center slightly as progress advances
        const dx = cx - p.x;
        const dy = cy - p.y;
        p.x += dx * 0.003 * progress;
        p.y += dy * 0.003 * progress;

        // Wrap edges
        if (p.x < 0) p.x = this.width;
        if (p.x > this.width) p.x = 0;
        if (p.y < 0) p.y = this.height;
        if (p.y > this.height) p.y = 0;

        ctx.fillStyle = `${p.color}${p.opacity * (0.4 + 0.6 * Math.sin(elapsed * 0.005))})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // 4. Energy burst ring toward completion (2.2s ~ 2.8s)
      if (progress > 0.7) {
        const burstRatio = (progress - 0.7) / 0.3;
        const burstRadius = 40 + burstRatio * 160;
        const burstAlpha = Math.max(0, 1 - burstRatio) * 0.6;

        ctx.save();
        ctx.strokeStyle = `rgba(0, 229, 255, ${burstAlpha})`;
        ctx.lineWidth = 3 * (1 - burstRatio);
        ctx.beginPath();
        ctx.arc(cx, cy, burstRadius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = `rgba(236, 72, 153, ${burstAlpha * 0.7})`;
        ctx.beginPath();
        ctx.arc(cx, cy, burstRadius * 0.75, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      if (progress >= 1.0) {
        this.dismiss();
        return;
      }

      this.animFrameId = requestAnimationFrame(render);
    };

    this.animFrameId = requestAnimationFrame(render);
  }

  dismiss() {
    if (this.isDismissed) return;
    this.isDismissed = true;

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.video) {
      try { this.video.pause(); } catch (_) {}
    }

    if (this.container) {
      this.container.classList.add('splash-dismissing');
      setTimeout(() => {
        this.container.classList.add('splash-hidden');
        // Announce readiness to main app if needed
        window.dispatchEvent(new CustomEvent('app:splashFinished'));
      }, 650);
    }
  }
}

// Automatically instantiate when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  window.splashIntro = new SplashIntro();
});
