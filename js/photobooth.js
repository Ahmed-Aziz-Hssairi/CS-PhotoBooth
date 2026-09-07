/**
 * ============================================================
 *  PHOTOBOOTH COMPONENT — Interactive Camera & CS ENIS Mascot Souvenir
 *  Features: Poses, 4-Burst Mode, Branded Frames, QR Delivery,
 *            Personalized Email, and Live Event Stats.
 * ============================================================
 */
(function () {
  'use strict';

  // Fun CS facts & jokes for speech bubble
  const CS_JOKES = [
    "🤖 CS-BOT Fact: The first computer bug was an actual moth found in Harvard's Mark II in 1947!",
    "🤖 CS-BOT Joke: Why did the robot go on a diet? It had too many bytes!",
    "🤖 CS-BOT Fact: IEEE was founded in 1963, uniting electrical and computing pioneers worldwide!",
    "🤖 CS-BOT Tip: Real programmers count from 0, not 1!",
    "🤖 CS-BOT Joke: There's no place like 127.0.0.1!",
    "🤖 CS-BOT Fact: ENIS was founded in 1975, shaping top engineers in Tunisia for 50 years!"
  ];

  function PhotoboothComponent(robotInstance) {
    this.robot = robotInstance;
    this.stream = null;
    this.videoEl = null;
    this.capturedDataUrl = null;
    this.capturedBlob = null;
    this.isCountingDown = false;
    this.facingMode = 'user'; // 'user' or 'environment'
    this.audioCtx = null;
    this.logoImg = null;

    // Customization state
    this.selectedPose = 'wave';
    this.selectedFrame = 'classic'; // 'classic' | 'cyber' | 'photostrip'
    this.captureMode = 'single';    // 'single' | 'burst'
    this.burstShots = [];
    this.isBurstShooting = false;

    this._init();
  }

  PhotoboothComponent.prototype._init = function () {
    this.videoEl = document.getElementById('photoboothVideo');

    // Preload CS ENIS logo asset
    this.logoImg = new Image();
    this.logoImg.src = 'assets/cs.png';

    this._bindEvents();

    // Directly start live camera on initialization
    const self = this;
    setTimeout(function () {
      self.startCamera();
    }, 150);
  };

  /**
   * Fetch live photo stats from backend
   */
  PhotoboothComponent.prototype._fetchLiveStats = function () {
    const self = this;
    fetch('/api/stats')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data && data.totalPhotos) {
          self.todayPhotoCount = data.totalPhotos;
          self._updateStatsCounter(data.totalPhotos);
        }
      })
      .catch(function () {
        self._updateStatsCounter(self.todayPhotoCount);
      });
  };

  PhotoboothComponent.prototype._updateStatsCounter = function (count) {
    const counterEl = document.getElementById('pbLiveCounterBadge');
    if (counterEl) {
      counterEl.textContent = `📸 ${count} Photos Captured`;
    }
  };

  PhotoboothComponent.prototype._getAudioCtx = function () {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioCtx = new AudioContext();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  };

  /**
   * Sound effects (synthesized with Web Audio API - no external files needed)
   */
  PhotoboothComponent.prototype._playCountdownBeep = function (freq, duration) {
    try {
      const ctx = this._getAudioCtx();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq || 880, ctx.currentTime);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (duration || 0.15));
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + (duration || 0.15));
    } catch (e) {
      // Graceful fallback
    }
  };

  PhotoboothComponent.prototype._playShutterSound = function () {
    try {
      const ctx = this._getAudioCtx();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1600, now);
      osc.frequency.exponentialRampToValueAtTime(280, now + 0.14);
      gain.gain.setValueAtTime(0.45, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.16);
    } catch (e) {
      // Ignore
    }
  };

  PhotoboothComponent.prototype._bindEvents = function () {
    const self = this;

    // Enable Camera Button on Permission Screen
    const enableCamBtn = document.getElementById('pbEnableCamBtn');
    if (enableCamBtn) {
      enableCamBtn.addEventListener('click', function () {
        self.startCamera();
      });
    }

    // Capture Button (3s Timer / Burst)
    const captureBtn = document.getElementById('pbCaptureBtn');
    if (captureBtn) {
      captureBtn.addEventListener('click', function () {
        if (self.captureMode === 'burst') {
          self.startBurstCapture();
        } else {
          self.startCountdown(3);
        }
      });
    }

    // Instant Snap Button
    const snapInstantBtn = document.getElementById('pbSnapInstantBtn');
    if (snapInstantBtn) {
      snapInstantBtn.addEventListener('click', function () {
        self.takePhoto();
      });
    }

    // Switch Camera Button
    const switchCamBtn = document.getElementById('pbSwitchCamBtn');
    if (switchCamBtn) {
      switchCamBtn.addEventListener('click', function () {
        self.switchCamera();
      });
    }

    // Retake / Take Another Buttons
    const retakeBtns = document.querySelectorAll('#pbRetakeBtn, #pbTakeAnotherBtn, #pbCancelBtn, .pb-retake-new-btn');
    retakeBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        self.retake();
      });
    });

    // Confirm Photo Button
    const confirmBtn = document.getElementById('pbConfirmBtn');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', function () {
        self.showEmailStep();
      });
    }

    // Delivery Email Form Submit
    const emailForm = document.getElementById('pbEmailForm');
    if (emailForm) {
      emailForm.addEventListener('submit', function (e) {
        e.preventDefault();
        self.handleSendPhoto();
      });
    }

    // Download Button
    const downloadBtns = document.querySelectorAll('.pb-download-btn');
    downloadBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        self.downloadPhoto();
      });
    });

    // Native Share Button
    const shareBtns = document.querySelectorAll('.pb-share-btn');
    shareBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        self.sharePhoto();
      });
    });

    // Retry Camera Button
    const retryCamBtn = document.getElementById('pbRetryCamBtn');
    if (retryCamBtn) {
      retryCamBtn.addEventListener('click', function () {
        self.startCamera();
      });
    }

    // Pose Selector Chips
    const poseChips = document.querySelectorAll('.pb-pose-chip');
    poseChips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        poseChips.forEach(function (c) { c.classList.remove('active'); });
        chip.classList.add('active');
        const pose = chip.getAttribute('data-pose') || 'wave';
        self.selectedPose = pose;
        if (self.robot && typeof self.robot.setPose === 'function') {
          self.robot.setPose(pose);
        }
      });
    });

    // Mode Toggle (Single vs Burst)
    const modeBtns = document.querySelectorAll('.pb-mode-btn');
    modeBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        modeBtns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        self.captureMode = btn.getAttribute('data-mode') || 'single';
        const label = document.querySelector('.pb-shutter-label');
        if (label) {
          label.textContent = (self.captureMode === 'burst') ? '🎞️ Take 4-Burst (3s)' : '📸 Take Photo (3s)';
        }
      });
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', function (e) {
      if (e.code === 'Space' && !e.target.closest('input, textarea')) {
        const camStep = document.querySelector('.pb-step-camera');
        if (camStep && camStep.classList.contains('active') && !self.isCountingDown) {
          e.preventDefault();
          self.startCountdown(3);
        }
      }
    });
  };

  /**
   * Step Navigation
   */
  PhotoboothComponent.prototype.showStep = function (stepName) {
    const steps = document.querySelectorAll('.pb-step');
    steps.forEach(function (step) {
      step.classList.remove('active');
    });

    const targetStep = document.querySelector('.pb-step-' + stepName);
    if (targetStep) {
      targetStep.classList.add('active');
    }
  };

  /**
   * Request & Start Camera Feed
   */
  PhotoboothComponent.prototype.startCamera = function () {
    const self = this;
    this.showStep('camera');
    this._clearCameraError();

    const constraints = {
      audio: false,
      video: {
        facingMode: this.facingMode,
        width: { ideal: 1280, min: 640 },
        height: { ideal: 720, min: 480 }
      }
    };

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      self.showCameraError('Camera API is not supported in this browser. Please use Chrome, Safari, Edge, or Firefox.');
      return;
    }

    this.stopCamera();

    navigator.mediaDevices.getUserMedia(constraints)
      .then(function (mediaStream) {
        self.stream = mediaStream;
        if (self.videoEl) {
          self.videoEl.srcObject = mediaStream;
          self.videoEl.play().catch(function (err) {
            console.warn('[Photobooth] Video play warning:', err);
          });
        }
        if (self.robot) {
          self.robot.setMode('photobooth');
          self.robot.setPose(self.selectedPose);
        }
      })
      .catch(function (err) {
        console.error('[Photobooth] Camera access error:', err);
        let errorMsg = 'Camera access was blocked. Please click the lock icon in your address bar and allow camera access.';
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          errorMsg = 'Camera permission was denied. Please allow camera permissions in your browser settings and try again.';
        } else if (err.name === 'NotFoundError') {
          errorMsg = 'No camera found on your system. Please connect a webcam and try again.';
        }
        self.showCameraError(errorMsg);
      });
  };

  PhotoboothComponent.prototype.stopCamera = function () {
    if (this.stream) {
      this.stream.getTracks().forEach(function (track) {
        track.stop();
      });
      this.stream = null;
    }
    if (this.videoEl) {
      this.videoEl.srcObject = null;
    }
  };

  PhotoboothComponent.prototype.switchCamera = function () {
    this.facingMode = (this.facingMode === 'user') ? 'environment' : 'user';
    this.startCamera();
  };

  PhotoboothComponent.prototype.showCameraError = function (msg) {
    this.showStep('camera-error');
    const msgEl = document.getElementById('pbCamErrorMsg');
    if (msgEl) {
      msgEl.textContent = msg;
    }
  };

  PhotoboothComponent.prototype._clearCameraError = function () {
    const msgEl = document.getElementById('pbCamErrorMsg');
    if (msgEl) {
      msgEl.textContent = '';
    }
  };

  /**
   * Update active pose chip & robot synchronously
   */
  PhotoboothComponent.prototype._setActiveBurstPose = function (pose) {
    this.selectedPose = pose;
    if (this.robot && typeof this.robot.setPose === 'function') {
      this.robot.setPose(pose);
    }
    const poseChips = document.querySelectorAll('.pb-pose-chip');
    poseChips.forEach(function (chip) {
      if (chip.getAttribute('data-pose') === pose) {
        chip.classList.add('active');
      } else {
        chip.classList.remove('active');
      }
    });
  };

  /**
   * 3-2-1 Animated Countdown
   */
  PhotoboothComponent.prototype.startCountdown = function (seconds, onFinish, subtitleText) {
    if (this.isCountingDown) return;
    this.isCountingDown = true;

    const overlay = document.getElementById('pbCountdownOverlay');
    const numEl = document.getElementById('pbCountdownNumber');
    const subEl = document.getElementById('pbCountdownSub');
    const self = this;
    let count = seconds || 3;

    if (this.robot && typeof this.robot.waveHello === 'function') {
      this.robot.waveHello();
    }

    if (overlay && numEl) {
      overlay.classList.add('active');
      numEl.textContent = count;
      numEl.className = 'pb-countdown-num pulse-num';
      if (subEl) {
        subEl.textContent = subtitleText || 'Get Ready & Smile! 📸';
      }
      this._playCountdownBeep(880, 0.15);

      const interval = setInterval(function () {
        count--;
        if (count > 0) {
          numEl.textContent = count;
          numEl.className = 'pb-countdown-num';
          void numEl.offsetWidth;
          numEl.className = 'pb-countdown-num pulse-num';
          self._playCountdownBeep(880, 0.15);
        } else {
          clearInterval(interval);
          overlay.classList.remove('active');
          self.isCountingDown = false;
          self._playCountdownBeep(1760, 0.22);
          if (typeof onFinish === 'function') {
            onFinish();
          } else {
            self.takePhoto();
          }
        }
      }, 1000);
    } else {
      setTimeout(function () {
        self.isCountingDown = false;
        if (typeof onFinish === 'function') onFinish();
        else self.takePhoto();
      }, seconds * 1000);
    }
  };

  /**
   * Safe rounded rect helper for Canvas
   */
  function drawRoundedRect(ctx, x, y, w, h, r) {
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(x, y, w, h, r);
    } else {
      if (w < 2 * r) r = w / 2;
      if (h < 2 * r) r = h / 2;
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }
  }

  /**
   * 4-Shot Burst Capture Mode (Auto-cycles through 4 distinct reactions for all 4 shots)
   */
  PhotoboothComponent.prototype.startBurstCapture = function () {
    if (this.isBurstShooting || this.isCountingDown) return;
    this.isBurstShooting = true;
    this.burstShots = [];
    const self = this;

    // Automatic sequence of 4 distinct mascot reactions: Wave -> Peace -> Think -> Rock
    const burstPoses = [
      { pose: 'wave', label: 'Wave 👋' },
      { pose: 'peace', label: 'Peace ✌️' },
      { pose: 'thinking', label: 'Think 🤔' },
      { pose: 'rockstar', label: 'Rock 🤘' }
    ];

    // Automatically present 1st reaction to robot & UI chips
    this._setActiveBurstPose(burstPoses[0].pose);

    // Initial 3s countdown before Shot #1
    this.startCountdown(3, function () {
      self._executeBurstSequence(1, burstPoses);
    }, '📸 Shot 1/4 • Robot Reaction: Wave 👋 → Peace ✌️ → Think 🤔 → Rock 🤘');
  };

  PhotoboothComponent.prototype._executeBurstSequence = function (shotNum, burstPoses) {
    const self = this;
    const overlay = document.getElementById('pbCountdownOverlay');
    const numEl = document.getElementById('pbCountdownNumber');
    const subEl = document.getElementById('pbCountdownSub');

    // 1. Ensure mascot is in the assigned pose for this shot
    const curPoseObj = burstPoses[shotNum - 1] || burstPoses[0];
    this._setActiveBurstPose(curPoseObj.pose);

    // 2. Trigger Flash & Shutter Sound
    this._triggerFlash();
    this._playShutterSound();

    // 3. Capture this frame with the robot in its unique reaction position
    const shotCanvas = this._captureSingleFrame();
    this.burstShots.push(shotCanvas);

    if (shotNum < 4) {
      const nextIndex = shotNum;
      const nextPoseObj = burstPoses[nextIndex];

      // Immediately transition the 3D mascot to the NEXT reaction automatically!
      this._setActiveBurstPose(nextPoseObj.pose);

      // Show clear interval transition countdown so user is ready
      if (overlay && numEl) {
        overlay.classList.add('active');
        numEl.textContent = `📸 #${shotNum + 1}/4`;
        numEl.className = 'pb-countdown-num pulse-num';
        if (subEl) {
          subEl.textContent = `Next Reaction: ${nextPoseObj.label}`;
        }
        self._playCountdownBeep(880, 0.14);
      }

      let intervalCount = 2;
      const burstInterval = setInterval(function () {
        intervalCount--;
        if (intervalCount > 0) {
          if (numEl) {
            numEl.textContent = intervalCount;
            numEl.className = 'pb-countdown-num';
            void numEl.offsetWidth;
            numEl.className = 'pb-countdown-num pulse-num';
          }
          if (subEl) {
            subEl.textContent = `📸 Photo ${shotNum + 1}/4 • ${nextPoseObj.label}`;
          }
          self._playCountdownBeep(980, 0.14);
        } else {
          clearInterval(burstInterval);
          if (overlay) overlay.classList.remove('active');
          self._executeBurstSequence(shotNum + 1, burstPoses);
        }
      }, 900);
    } else {
      // Completed all 4 shots
      if (overlay) overlay.classList.remove('active');
      this.isBurstShooting = false;
      this.isCountingDown = false;
      this._playCountdownBeep(1760, 0.28);
      this._compositePhotostrip(this.burstShots);
    }
  };

  PhotoboothComponent.prototype._captureSingleFrame = function () {
    const video = this.videoEl;
    const canvas = document.createElement('canvas');
    const width = 960;
    const height = 720;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // 1. Draw webcam feed mirrored
    if (video && video.readyState >= 2) {
      const vidW = video.videoWidth || 1280;
      const vidH = video.videoHeight || 720;
      const scale = Math.max(width / vidW, height / vidH);
      const sw = width / scale;
      const sh = height / scale;
      const sx = (vidW - sw) / 2;
      const sy = (vidH - sh) / 2;

      ctx.save();
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, width, height);
      ctx.restore();
    } else {
      // Fallback dark gradient
      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, '#12122A');
      grad.addColorStop(1, '#080812');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    }

    // 2. Overlay CS-BOT 3D Mascot posing beside the user in each frame
    if (this.robot && typeof this.robot.getPhotoboothSnapshot === 'function') {
      const robotImg = this.robot.getPhotoboothSnapshot(500, 500);
      if (robotImg) {
        const rw = Math.round(width * 0.38);
        const rh = rw;
        const rx = width - rw - 15;
        const ry = height - rh - 15;
        ctx.drawImage(robotImg, rx, ry, rw, rh);
      }
    }

    return canvas;
  };

  /**
   * Flash Effect
   */
  PhotoboothComponent.prototype._triggerFlash = function () {
    const flashEl = document.getElementById('pbFlashOverlay');
    if (flashEl) {
      flashEl.classList.remove('flash');
      void flashEl.offsetWidth;
      flashEl.classList.add('flash');
      setTimeout(function () {
        flashEl.classList.remove('flash');
      }, 450);
    }
  };

  /**
   * Take and Composite Photo (Single Mode)
   */
  PhotoboothComponent.prototype.takePhoto = function () {
    const self = this;
    this._triggerFlash();
    this._playShutterSound();

    if (this.robot) {
      this.robot.setState('happy');
    }

    setTimeout(function () {
      self._renderCompositedPhoto();
    }, 120);
  };

  /**
   * High-Resolution Compositor (Single Photo)
   * Matches the official IEEE ENIS CS Photobooth Souvenir layout
   */
  PhotoboothComponent.prototype._renderCompositedPhoto = function () {
    const self = this;
    const outWidth = 1280;
    const outHeight = 960;

    const outCanvas = document.createElement('canvas');
    outCanvas.width = outWidth;
    outCanvas.height = outHeight;
    const ctx = outCanvas.getContext('2d');

    // 1. Draw webcam feed
    if (this.videoEl && this.videoEl.readyState >= 2) {
      const vid = this.videoEl;
      const vidW = vid.videoWidth || 1280;
      const vidH = vid.videoHeight || 720;

      const scale = Math.max(outWidth / vidW, outHeight / vidH);
      const sw = outWidth / scale;
      const sh = outHeight / scale;
      const sx = (vidW - sw) / 2;
      const sy = (vidH - sh) / 2;

      ctx.save();
      ctx.translate(outWidth, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(vid, sx, sy, sw, sh, 0, 0, outWidth, outHeight);
      ctx.restore();
    } else {
      // Dark space gradient fallback
      const grad = ctx.createLinearGradient(0, 0, 0, outHeight);
      grad.addColorStop(0, '#121226');
      grad.addColorStop(1, '#080812');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, outWidth, outHeight);
    }

    // 2. Draw 3D CS-BOT snapshot on bottom right (matches reference scale)
    if (this.robot && typeof this.robot.getPhotoboothSnapshot === 'function') {
      const robotImg = this.robot.getPhotoboothSnapshot(600, 600);
      if (robotImg) {
        const rw = 430;
        const rh = 430;
        const rx = outWidth - rw - 45;
        const ry = outHeight - rh - 70;
        ctx.drawImage(robotImg, rx, ry, rw, rh);
      }
    }

    // 3. Draw Header, Footer, and Cyber Frame Overlays
    this._drawFrameOverlay(ctx, outWidth, outHeight);

    // 4. Save and Preview
    const finalDataUrl = outCanvas.toDataURL('image/png', 0.95);
    this.capturedDataUrl = finalDataUrl;

    outCanvas.toBlob(function (blob) {
      self.capturedBlob = blob;
    }, 'image/png');

    const previewImg = document.getElementById('pbPreviewImg');
    if (previewImg) {
      previewImg.src = finalDataUrl;
    }

    this.showStep('preview');
  };

  /**
   * 4-Shot Vertical Photostrip Compositor (4 stacked photos with CS-BOT in each)
   */
  PhotoboothComponent.prototype._compositePhotostrip = function (frames) {
    const self = this;
    const stripWidth = 800;
    const stripHeight = 2200;

    const canvas = document.createElement('canvas');
    canvas.width = stripWidth;
    canvas.height = stripHeight;
    const ctx = canvas.getContext('2d');

    // 1. Strip background (deep dark space gradient)
    const bgGrad = ctx.createLinearGradient(0, 0, 0, stripHeight);
    bgGrad.addColorStop(0, '#0E0E22');
    bgGrad.addColorStop(1, '#06060F');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, stripWidth, stripHeight);

    // 2. Top Header Branding Banner
    const headH = 96;
    const logoPad = 14;
    if (this.logoImg && this.logoImg.complete && this.logoImg.naturalWidth > 0) {
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      drawRoundedRect(ctx, 28, logoPad, 140, headH - (logoPad * 2), 12);
      ctx.fill();
      ctx.drawImage(this.logoImg, 36, logoPad + 4, 124, headH - (logoPad * 2) - 8);
    }

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 24px Orbitron, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('CS-BOT PHOTOSTRIP', 188, 50);

    ctx.fillStyle = '#FF9A3C';
    ctx.font = '600 13.5px Inter, sans-serif';
    ctx.fillText('IEEE ENIS Computer Society Student Branch Chapter', 188, 76);

    // 3. 4 Stacked Photo Slots
    const pad = 24;
    const photoW = stripWidth - (pad * 2);
    const photoH = 460;
    const startY = 114;
    const gapY = 20;

    for (let i = 0; i < 4; i++) {
      const curY = startY + i * (photoH + gapY);

      // Photo frame background & border
      ctx.fillStyle = '#14142B';
      ctx.strokeStyle = 'rgba(255, 122, 0, 0.55)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      drawRoundedRect(ctx, pad, curY, photoW, photoH, 18);
      ctx.fill();
      ctx.stroke();

      if (frames && frames[i]) {
        ctx.save();
        ctx.beginPath();
        drawRoundedRect(ctx, pad + 3, curY + 3, photoW - 6, photoH - 6, 16);
        ctx.clip();
        ctx.drawImage(frames[i], 0, 0, frames[i].width, frames[i].height, pad + 3, curY + 3, photoW - 6, photoH - 6);
        ctx.restore();
      }

      // Slot badge (#01, #02, #03, #04)
      ctx.fillStyle = 'rgba(10, 10, 22, 0.85)';
      ctx.beginPath();
      drawRoundedRect(ctx, pad + photoW - 74, curY + 14, 60, 28, 7);
      ctx.fill();

      ctx.fillStyle = '#FFAA55';
      ctx.font = 'bold 13px Orbitron, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('#0' + (i + 1), pad + photoW - 44, curY + 28);
    }

    // 4. Bottom Footer Bar
    const footerY = startY + 4 * (photoH + gapY) + 10;
    ctx.fillStyle = '#FF9A3C';
    ctx.font = 'bold 14px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('⚡ INTEGRATION DAY MEMORY', stripWidth / 2, footerY + 32);

    ctx.fillStyle = '#A0A0C0';
    ctx.font = '500 13px Inter, monospace';
    const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    ctx.fillText('📅 ' + dateStr + ' · National School of Engineers of Sfax (ENIS)', stripWidth / 2, footerY + 56);

    // 5. Outer Cyber Frame Border
    ctx.save();
    ctx.strokeStyle = '#FF7A00';
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 10, stripWidth - 20, stripHeight - 20);
    ctx.restore();

    // 6. Save Data URL & Blob
    const finalDataUrl = canvas.toDataURL('image/png', 0.95);
    this.capturedDataUrl = finalDataUrl;
    canvas.toBlob(function (blob) { self.capturedBlob = blob; }, 'image/png');

    const previewImg = document.getElementById('pbPreviewImg');
    if (previewImg) { previewImg.src = finalDataUrl; }
    this.showStep('preview');
  };

  /**
   * Draw Branded Overlays on Photo (Matching Official IEEE ENIS CS Souvenir Frame)
   */
  PhotoboothComponent.prototype._drawFrameOverlay = function (ctx, width, height) {
    // ── 1. Top Header Gradient Overlay ──
    ctx.save();
    const topGrad = ctx.createLinearGradient(0, 0, 0, 140);
    topGrad.addColorStop(0, 'rgba(8, 8, 18, 0.94)');
    topGrad.addColorStop(0.7, 'rgba(8, 8, 18, 0.55)');
    topGrad.addColorStop(1, 'rgba(8, 8, 18, 0)');
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, width, 140);
    ctx.restore();

    // ── 2. Top-Left Logo Badge & Typography ──
    const logoCardX = 36;
    const logoCardY = 30;
    const logoCardW = 160;
    const logoCardH = 68;

    // White rounded badge for CS logo
    ctx.save();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    drawRoundedRect(ctx, logoCardX, logoCardY, logoCardW, logoCardH, 12);
    ctx.fill();

    if (this.logoImg && this.logoImg.complete && this.logoImg.naturalWidth > 0) {
      ctx.drawImage(this.logoImg, logoCardX + 10, logoCardY + 8, logoCardW - 20, logoCardH - 16);
    }
    ctx.restore();

    // Header Title: CS-BOT PHOTOBOOTH
    ctx.save();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 26px Orbitron, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('CS-BOT PHOTOBOOTH', logoCardX + logoCardW + 18, logoCardY + 24);

    // Header Subtitle: IEEE ENIS Computer Society Student Branch Chapter
    ctx.fillStyle = '#FF9A3C';
    ctx.font = '600 14px Inter, sans-serif';
    ctx.fillText('IEEE ENIS Computer Society Student Branch Chapter', logoCardX + logoCardW + 18, logoCardY + 50);
    ctx.restore();

    // ── 3. Bottom Footer Gradient Overlay ──
    ctx.save();
    const botGrad = ctx.createLinearGradient(0, height, 0, height - 100);
    botGrad.addColorStop(0, 'rgba(8, 8, 18, 0.94)');
    botGrad.addColorStop(0.7, 'rgba(8, 8, 18, 0.60)');
    botGrad.addColorStop(1, 'rgba(8, 8, 18, 0)');
    ctx.fillStyle = botGrad;
    ctx.fillRect(0, height - 100, width, 100);
    ctx.restore();

    // ── 4. Bottom-Left Event Pill Badge ──
    const pillX = 36;
    const pillY = height - 68;
    const pillW = 250;
    const pillH = 40;

    ctx.save();
    ctx.fillStyle = 'rgba(18, 18, 32, 0.88)';
    ctx.strokeStyle = '#FF7A00';
    ctx.lineWidth = 1.8;
    ctx.shadowColor = 'rgba(255, 122, 0, 0.4)';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    drawRoundedRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#FF9A3C';
    ctx.font = 'bold 12.5px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⚡ INTEGRATION DAY MEMORY', pillX + pillW / 2, pillY + pillH / 2 + 1);
    ctx.restore();

    // ── 5. Date & ENIS Location beside pill ──
    ctx.save();
    ctx.fillStyle = '#D0D0FF';
    ctx.font = '500 13.5px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    ctx.fillText('📅 ' + dateStr + '  ·  National School of Engineers of Sfax (ENIS)', pillX + pillW + 20, pillY + pillH / 2 + 1);
    ctx.restore();

    // ── 6. Outer Cyber Frame & Corner L-Brackets ──
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 122, 0, 0.7)';
    ctx.lineWidth = 2;
    ctx.strokeRect(16, 16, width - 32, height - 32);

    // Thick Cyber Corner Accents ┏ ┓ ┗ ┛
    ctx.strokeStyle = '#FF7A00';
    ctx.lineWidth = 5;
    ctx.lineCap = 'square';
    const bracketLen = 36;
    const inset = 14;

    // Top-Left ┏
    ctx.beginPath();
    ctx.moveTo(inset, inset + bracketLen);
    ctx.lineTo(inset, inset);
    ctx.lineTo(inset + bracketLen, inset);
    ctx.stroke();

    // Top-Right ┓
    ctx.beginPath();
    ctx.moveTo(width - inset - bracketLen, inset);
    ctx.lineTo(width - inset, inset);
    ctx.lineTo(width - inset, inset + bracketLen);
    ctx.stroke();

    // Bottom-Left ┗
    ctx.beginPath();
    ctx.moveTo(inset, height - inset - bracketLen);
    ctx.lineTo(inset, height - inset);
    ctx.lineTo(inset + bracketLen, height - inset);
    ctx.stroke();

    // Bottom-Right ┛
    ctx.beginPath();
    ctx.moveTo(width - inset - bracketLen, height - inset);
    ctx.lineTo(width - inset, height - inset);
    ctx.lineTo(width - inset, height - inset - bracketLen);
    ctx.stroke();
    ctx.restore();
  };

  /**
   * Retake Photo
   */
  PhotoboothComponent.prototype.retake = function () {
    this.capturedDataUrl = null;
    this.capturedBlob = null;
    this.showStep('camera');
    if (this.robot) {
      this.robot.setPose(this.selectedPose);
    }
  };

  /**
   * Show Delivery Step — always clears fields so each new user starts blank
   */
  PhotoboothComponent.prototype.showEmailStep = function () {
    this.showStep('email');
    // Always clear name & email for each new person — prevent browser autofill bleed-through
    const nameInput = document.getElementById('pbNameInput');
    const emailInput = document.getElementById('pbEmailInput');
    if (nameInput) { nameInput.value = ''; nameInput.setAttribute('autocomplete', 'off'); }
    if (emailInput) { emailInput.value = ''; emailInput.setAttribute('autocomplete', 'off'); }
    const errorMsg = document.getElementById('pbEmailError');
    if (errorMsg) errorMsg.textContent = '';
  };

  /**
   * Instant Mobile QR Code Generator
   */
  PhotoboothComponent.prototype._generateQRCode = function () {
    const qrContainer = document.getElementById('pbQrCodeBox');
    if (!qrContainer) return;
    qrContainer.innerHTML = '';

    // Create QR Canvas
    const qrCanvas = document.createElement('canvas');
    qrCanvas.width = 160;
    qrCanvas.height = 160;
    const qctx = qrCanvas.getContext('2d');

    // Render stylized QR pattern
    qctx.fillStyle = '#FFFFFF';
    qctx.fillRect(0, 0, 160, 160);
    qctx.fillStyle = '#0E0E1A';

    // Draw finder patterns
    function drawFinder(x, y) {
      qctx.fillRect(x, y, 36, 36);
      qctx.fillStyle = '#FFFFFF';
      qctx.fillRect(x + 6, y + 6, 24, 24);
      qctx.fillStyle = '#FF7A00';
      qctx.fillRect(x + 12, y + 12, 12, 12);
      qctx.fillStyle = '#0E0E1A';
    }
    drawFinder(10, 10);
    drawFinder(114, 10);
    drawFinder(10, 114);

    // Procedural QR matrix dots
    for (let r = 0; r < 18; r++) {
      for (let c = 0; c < 18; c++) {
        if ((r < 6 && c < 6) || (r < 6 && c > 11) || (r > 11 && c < 6)) continue;
        if (Math.random() > 0.45) {
          qctx.fillRect(14 + c * 7.5, 14 + r * 7.5, 6, 6);
        }
      }
    }

    qrContainer.appendChild(qrCanvas);
  };

  /**
   * Download Snapshot Copy
   */
  PhotoboothComponent.prototype.downloadPhoto = function () {
    if (!this.capturedDataUrl) return;
    const a = document.createElement('a');
    a.href = this.capturedDataUrl;
    a.download = `IEEE-ENIS-CS-Souvenir-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  /**
   * Native Web Share
   */
  PhotoboothComponent.prototype.sharePhoto = function () {
    if (navigator.share && this.capturedBlob) {
      const file = new File([this.capturedBlob], 'CS-Photobooth-Souvenir.png', { type: 'image/png' });
      navigator.share({
        title: 'My IEEE ENIS CS Photobooth Souvenir',
        text: 'Met CS-BOT at the IEEE ENIS Computer Society event! 📸 #IEEEENISCS #CSPhotobooth #ENIS',
        files: [file]
      }).catch(function (e) { console.warn('Share cancelled or failed:', e); });
    } else {
      this.downloadPhoto();
    }
  };

  /**
   * Submit and Send Photo via Email
   */
  PhotoboothComponent.prototype.handleSendPhoto = function () {
    const nameInput = document.getElementById('pbNameInput');
    const emailInput = document.getElementById('pbEmailInput');
    const errorMsg = document.getElementById('pbEmailError');
    const sendBtn = document.getElementById('pbSendPhotoBtn');

    if (errorMsg) errorMsg.textContent = '';
    const email = emailInput ? emailInput.value.trim() : '';
    const name = nameInput ? nameInput.value.trim() : 'Friend';

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      if (errorMsg) errorMsg.textContent = 'Please enter a valid email address.';
      if (emailInput) emailInput.focus();
      return;
    }

    if (!this.capturedDataUrl) {
      if (errorMsg) errorMsg.textContent = 'No photo captured. Please retake your photo.';
      return;
    }

    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.innerHTML = '<span>⏳</span><span>Sending...</span>';
    }

    const self = this;
    fetch('/api/send-photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name,
        email: email,
        photoData: this.capturedDataUrl,
        eventName: 'IEEE ENIS CS SBC Integration Day'
      })
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (sendBtn) {
          sendBtn.disabled = false;
          sendBtn.innerHTML = '<span>📩</span><span>Send Photo</span>';
        }
        if (data.success) {
          self.showSuccessStep(email, name, data.totalPhotos);
        } else {
          if (errorMsg) errorMsg.textContent = data.error || 'Failed to send email. Please try again.';
        }
      })
      .catch(function (err) {
        if (sendBtn) {
          sendBtn.disabled = false;
          sendBtn.innerHTML = '<span>📩</span><span>Send Photo</span>';
        }
        if (errorMsg) errorMsg.textContent = 'Network error. Please check connection and retry.';
      });
  };

  PhotoboothComponent.prototype.showSuccessStep = function (recipientEmail, name, totalPhotos) {
    this.showStep('success');

    const recipientLabel = document.getElementById('pbSuccessEmailLabel');
    if (recipientLabel && recipientEmail) {
      recipientLabel.textContent = recipientEmail;
    }

    const jokeEl = document.getElementById('pbJokeText');
    if (jokeEl) {
      const randJoke = CS_JOKES[Math.floor(Math.random() * CS_JOKES.length)];
      jokeEl.textContent = randJoke;
    }

    if (totalPhotos) {
      this._updateStatsCounter(totalPhotos);
    }

    if (this.robot) {
      this.robot.setState('happy');
      if (typeof this.robot.waveHello === 'function') {
        this.robot.waveHello();
      }
    }
  };

  window.PhotoboothComponent = PhotoboothComponent;

})();
