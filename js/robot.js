/**
 * ============================================================
 *  ROBOT COMPONENT v15.0 — Dual-Hand Upright Waving & Hello
 *
 *  - No hoop / cerceau.
 *  - Both floating hands are positioned upright (palms & fingers pointing up).
 *  - When clicked: Robot speaks "Hello! How can I help you today?" and
 *    BOTH hands raise up high, waving warmly with flexing fingers!
 * ============================================================
 */
(function () {
  'use strict';

  /* ── Math & Interpolation Helpers ─────────────────────── */
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function easeOutExpo(t) { return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t); }

  /* ══════════════════════════════════════════════════════ */
  function RobotComponent(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) { console.error('[Robot] Container not found:', containerId); return; }
    if (typeof THREE === 'undefined') { console.error('[Robot] THREE not loaded!'); return; }

    /* State */
    this.state = 'happy';  // idle | thinking | responding | happy | wink
    this.mode = 'photobooth'; // photobooth
    this.form = 'hands';  // hands deployed for posing

    /* Hands Transformation */
    this._transforming = false;
    this._transformDir = 1;
    this._handProgress = 1.0;      // Fully deployed hands for posing

    /* Camera */
    this._camZ = 8.0;
    this._camZTarget = 8.0;
    this._CAM_HEAD = 7.8;
    this._CAM_HANDS = 8.4;

    /* Physics & Float Motion */
    this._time = 0;
    this._animFrame = null;
    this._pos = { x: 0, y: 0.55, z: 0 };
    this._rot = { x: 0, y: 0, z: 0 };
    this._jumpImpulse = 0;
    this._spinImpulse = 0;

    /* Eye State */
    this._blinkTimer = 0;
    this._nextBlinkTime = 3.0;
    this._isBlinking = false;

    /* Mouse Tracking */
    this._mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };

    /* Hand Gestures & Poses */
    this._isWaving = false;
    this._waveTimer = 0;
    this.pose = 'wave'; // 'wave' | 'thumbs_up' | 'peace' | 'thinking' | 'rockstar'

    /* Three.js Core */
    this._renderer = this._scene = this._camera = null;
    this._droneRoot = this._headGroup = null;
    this._antennas = [];
    this._thrusterRing = this._headThruster = this._headParticles = null;

    /* Pure Floating Hands */
    this._leftHandGroup = this._rightHandGroup = null;
    this._leftPalmGroup = this._rightPalmGroup = null;
    this._leftFingers = [];
    this._rightFingers = [];
    this._leftPalmCore = this._rightPalmCore = null;

    /* Face Canvas */
    this._faceCanvas = this._faceCtx = this._faceTexture = this._faceMesh = null;
    this._haloEl = null;

    this._init();
  }

  /* ── INITIALIZATION ───────────────────────────────────── */
  RobotComponent.prototype._init = function () {
    var self = this;
    this._buildOverlayDOM();
    this._createFaceCanvas();
    this._setupThree();
    this._buildModel();
    this._setupEvents();
    this._animate();
    setTimeout(function () { self._resizeRenderer(); }, 80);
  };

  /* ── GLOW HALO DOM ────────────────────────────────────── */
  RobotComponent.prototype._buildOverlayDOM = function () {
    var halo = document.createElement('div');
    halo.style.cssText = [
      'position:fixed;top:32%;left:50%;',
      'transform:translate(-50%,-50%);',
      'width:320px;height:320px;',
      'background:radial-gradient(circle,rgba(255,122,0,0.16) 0%,rgba(255,80,0,0.03) 50%,transparent 70%);',
      'border-radius:50%;pointer-events:none;z-index:10;transition:all 0.9s ease;'
    ].join('');
    document.body.appendChild(halo);
    this._haloEl = halo;
  };

  /* ── FACE CANVAS ─────────────────────────────────────── */
  RobotComponent.prototype._createFaceCanvas = function () {
    this._faceCanvas = document.createElement('canvas');
    this._faceCanvas.width = 512;
    this._faceCanvas.height = 384;
    this._faceCtx = this._faceCanvas.getContext('2d');
    this._faceTexture = new THREE.CanvasTexture(this._faceCanvas);
    this._drawFace();
  };

  RobotComponent.prototype._drawFace = function () {
    var ctx = this._faceCtx;
    var w = 512, h = 384, t = this._time;

    /* Cyber Screen Gradient */
    var bg = ctx.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, w / 1.3);
    bg.addColorStop(0, '#221006');
    bg.addColorStop(0.65, '#120702');
    bg.addColorStop(1, '#050201');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    /* Scanlines */
    ctx.fillStyle = 'rgba(255,140,0,0.035)';
    for (var sy = 0; sy < h; sy += 4) ctx.fillRect(0, sy, w, 2);

    /* Grid */
    ctx.strokeStyle = 'rgba(255,122,0,0.06)';
    ctx.lineWidth = 1;
    for (var gx = 0; gx < w; gx += 32) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke(); }
    for (var gy = 0; gy < h; gy += 32) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke(); }

    /* Corner Reticles */
    ctx.save();
    ctx.strokeStyle = 'rgba(255,140,0,0.35)';
    ctx.lineWidth = 1.8;
    [
      [20, 40, 20, 20, 40, 20],
      [w - 20, 40, w - 20, 20, w - 40, 20],
      [20, h - 40, 20, h - 20, 40, h - 20],
      [w - 20, h - 40, w - 20, h - 20, w - 40, h - 20]
    ].forEach(function (c) {
      ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.lineTo(c[2], c[3]); ctx.lineTo(c[4], c[5]); ctx.stroke();
    });

    /* Status Dot */
    var dotCol = this._transforming ? '#FF9100' : (this.form === 'hands' ? '#00E5FF' : '#00E676');
    ctx.shadowBlur = 10; ctx.shadowColor = dotCol; ctx.fillStyle = dotCol;
    ctx.beginPath(); ctx.arc(36, 30, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;

    /* Label */
    ctx.font = '10px "Courier New", monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,190,120,0.9)';
    var lbl = this._transforming ? 'ARIA [TRANSFORMING]' : (this.form === 'hands' ? 'ARIA [HELLO!]' : 'ARIA [DRONE MODE]');
    ctx.fillText(lbl, 50, 33);

    /* State Status */
    var stat = 'ONLINE';
    if (this._transforming) stat = this._transformDir > 0 ? 'SAYING HELLO...' : 'RETRACTING...';
    else if (this.state === 'thinking') stat = 'COMPUTING...';
    else if (this.state === 'responding') stat = 'TRANSMITTING';
    else if (this.state === 'happy') stat = 'HELLO ♥';
    else if (this.state === 'wink') stat = 'HELLO ;)';
    ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,160,50,0.9)'; ctx.fillText(stat, w - 30, 33);
    ctx.restore();

    /* Eyes */
    var ec = '#FF9D00', eg = 'rgba(255,140,0,0.95)';
    if (this.state === 'thinking') { ec = '#FFD700'; eg = 'rgba(255,215,0,0.95)'; }
    else if (this.state === 'responding' || this.state === 'happy' || this.state === 'wink') { ec = '#FFAA1A'; eg = 'rgba(255,170,26,0.98)'; }
    if (this._transforming) { ec = '#00E5FF'; eg = 'rgba(0,229,255,0.95)'; }

    ctx.shadowBlur = 22; ctx.shadowColor = eg;
    ctx.strokeStyle = ec; ctx.fillStyle = ec; ctx.lineWidth = 14; ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    var tx2 = (this._mouse ? this._mouse.x : 0) * 14;
    var ty2 = (this._mouse ? -this._mouse.y : 0) * 10;
    var lx = 160 + tx2, rx = 352 + tx2, ey = 175 + ty2;

    if (this._isBlinking) {
      [lx, rx].forEach(function (ex) { ctx.beginPath(); ctx.moveTo(ex - 28, ey); ctx.lineTo(ex + 28, ey); ctx.stroke(); });
      ctx.beginPath(); ctx.moveTo(220 + tx2 * 0.5, 270 + ty2 * 0.5); ctx.lineTo(292 + tx2 * 0.5, 270 + ty2 * 0.5); ctx.stroke();

    } else if (this._transforming) {
      var rot2 = t * 9;
      [[lx, 1], [rx, -1]].forEach(function (p) {
        ctx.beginPath(); ctx.arc(p[0], ey, 26, rot2 * p[1], rot2 * p[1] + 4.5); ctx.stroke();
        ctx.beginPath(); ctx.arc(p[0], ey, 12, -rot2 * p[1] * 1.3, -rot2 * p[1] * 1.3 + 3); ctx.stroke();
      });
      var sx3 = 180 + ((Math.sin(t * 8) + 1) / 2) * 152;
      ctx.beginPath(); ctx.moveTo(180 + tx2 * 0.4, 265 + ty2 * 0.4); ctx.lineTo(sx3 + tx2 * 0.4, 265 + ty2 * 0.4); ctx.stroke();

    } else if (this.state === 'thinking') {
      var r3 = t * 4.5;
      [[lx, 1], [rx, -1]].forEach(function (p) {
        ctx.beginPath(); ctx.arc(p[0], ey, 28, r3 * p[1], r3 * p[1] + 4.2); ctx.stroke();
        ctx.beginPath(); ctx.arc(p[0], ey, 10, -r3 * p[1] * 1.5, -r3 * p[1] * 1.5 + 3.14); ctx.stroke();
      });
      ctx.beginPath();
      for (var wi = 0; wi < 100; wi += 5) {
        var wx = 206 + wi + tx2 * 0.4, wy = 268 + Math.sin(t * 10 + wi * 0.15) * 8;
        wi === 0 ? ctx.moveTo(wx, wy) : ctx.lineTo(wx, wy);
      }
      ctx.stroke();

    } else if (this.state === 'responding') {
      var eb = Math.sin(t * 8) * 2.5, es = 34;
      [[lx], [rx]].forEach(function (p) { ctx.beginPath(); ctx.moveTo(p[0] - es, ey + 10 + eb); ctx.quadraticCurveTo(p[0], ey - es + eb, p[0] + es, ey + 10 + eb); ctx.stroke(); });
      var sw = (Math.sin(t * 16) * 0.5 + 0.5) * (Math.sin(t * 7) * 0.35 + 0.65);
      var mh = 6 + sw * 36, mww = 78 + (1 - sw) * 14;
      var mcx = 256 + tx2 * 0.4, mcy = 256 + ty2 * 0.4, hw2 = mww / 2;
      var stx = mcx - hw2, etx = mcx + hw2, tly = mcy - mh * 0.28, bly = mcy + mh * 0.72;
      ctx.save();
      ctx.beginPath(); ctx.moveTo(stx, mcy); ctx.quadraticCurveTo(mcx, tly - 3, etx, mcy); ctx.quadraticCurveTo(mcx, bly, stx, mcy); ctx.closePath();
      var mg = ctx.createLinearGradient(0, tly, 0, bly);
      mg.addColorStop(0, '#5A1E00'); mg.addColorStop(0.5, '#A83800'); mg.addColorStop(1, '#FF6A00');
      ctx.fillStyle = mg; ctx.fill();
      if (mh > 14) { ctx.fillStyle = '#FFAA33'; ctx.beginPath(); ctx.arc(mcx, bly - 2, hw2 * 0.42, Math.PI, 0); ctx.fill(); }
      if (mh > 18) { ctx.fillStyle = 'rgba(255,235,200,0.9)'; ctx.fillRect(mcx - 20, tly + 2, 40, 4); }
      ctx.restore();
      ctx.lineWidth = 10; ctx.strokeStyle = ec; ctx.shadowBlur = 24; ctx.shadowColor = eg;
      ctx.beginPath(); ctx.moveTo(stx, mcy); ctx.quadraticCurveTo(mcx, tly - 3, etx, mcy); ctx.quadraticCurveTo(mcx, bly, stx, mcy); ctx.closePath(); ctx.stroke();
      var cg2 = 0.32 + sw * 0.18; ctx.fillStyle = 'rgba(255,130,40,' + cg2.toFixed(2) + ')';
      [[112 + tx2, 236 + ty2], [400 + tx2, 236 + ty2]].forEach(function (p) { ctx.beginPath(); ctx.ellipse(p[0], p[1], 24, 14, 0, 0, Math.PI * 2); ctx.fill(); });

    } else if (this.state === 'wink') {
      ctx.beginPath(); ctx.arc(lx, ey, 18, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(rx - 30, ey + 6); ctx.quadraticCurveTo(rx, ey - 22, rx + 30, ey + 6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(215 + tx2 * 0.4, 252 + ty2 * 0.4); ctx.quadraticCurveTo(256 + tx2 * 0.4, 306 + ty2 * 0.4, 297 + tx2 * 0.4, 252 + ty2 * 0.4); ctx.stroke();
      ctx.fillStyle = 'rgba(255,140,50,0.4)';
      [[112 + tx2, 236 + ty2], [400 + tx2, 236 + ty2]].forEach(function (p) { ctx.beginPath(); ctx.ellipse(p[0], p[1], 24, 14, 0, 0, Math.PI * 2); ctx.fill(); });

    } else {
      var es2 = 34;
      [[lx], [rx]].forEach(function (p) { ctx.beginPath(); ctx.moveTo(p[0] - es2, ey + 12); ctx.quadraticCurveTo(p[0], ey - es2, p[0] + es2, ey + 12); ctx.stroke(); });
      ctx.beginPath(); ctx.moveTo(215 + tx2 * 0.4, 252 + ty2 * 0.4); ctx.quadraticCurveTo(256 + tx2 * 0.4, 306 + ty2 * 0.4, 297 + tx2 * 0.4, 252 + ty2 * 0.4); ctx.stroke();
      ctx.fillStyle = 'rgba(255,120,40,0.30)';
      [[112 + tx2, 236 + ty2], [400 + tx2, 236 + ty2]].forEach(function (p) { ctx.beginPath(); ctx.ellipse(p[0], p[1], 22, 12, 0, 0, Math.PI * 2); ctx.fill(); });
    }

    ctx.shadowBlur = 0;
    this._faceTexture.needsUpdate = true;
  };

  /* ── THREE.JS SETUP ───────────────────────────────────── */
  RobotComponent.prototype._setupThree = function () {
    var self = this;
    this._renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this._renderer.setClearColor(0x000000, 0);
    var cv = this._renderer.domElement;
    cv.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:15;';
    this.container.appendChild(cv);

    this._scene = new THREE.Scene();
    this._camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 120);
    this._camera.position.set(0, 0.0, this._camZ);

    /* Stage Lighting */
    this._scene.add(new THREE.AmbientLight(0x281812, 2.8));
    var kl = new THREE.PointLight(0xFF8C00, 5.0, 22); kl.position.set(2.8, 3.5, 6.0); this._scene.add(kl);
    var rl = new THREE.PointLight(0xFFA500, 4.0, 20); rl.position.set(-3.5, 2.0, -3.0); this._scene.add(rl);
    var tl = new THREE.PointLight(0xFF6600, 4.2, 14); tl.position.set(0, -2.5, 1.0); this._scene.add(tl);
    var cl = new THREE.PointLight(0x00E5FF, 2.8, 14); cl.position.set(0, 0.5, 4.0); this._scene.add(cl);

    this._resizeRenderer();
    window.addEventListener('resize', function () { self._resizeRenderer(); });
  };

  RobotComponent.prototype._resizeRenderer = function () {
    var w = window.innerWidth || 800, h = window.innerHeight || 600;
    this._renderer.setSize(w, h, false);
    this._camera.aspect = w / h;
    this._camera.updateProjectionMatrix();
  };

  /* ── 3D MODEL BUILDER ─────────────────────────────────── */
  RobotComponent.prototype._buildModel = function () {
    var mOrange = new THREE.MeshStandardMaterial({
      color: 0xEE5C00, roughness: 0.22, metalness: 0.50, emissive: 0x551E00, emissiveIntensity: 0.38
    });
    var mWire = new THREE.MeshBasicMaterial({
      color: 0xFFB040, wireframe: true, transparent: true, opacity: 0.35
    });
    var mCarbon = new THREE.MeshStandardMaterial({
      color: 0x161822, roughness: 0.28, metalness: 0.92
    });
    var mGold = new THREE.MeshStandardMaterial({
      color: 0xFFB300, roughness: 0.16, metalness: 0.88, emissive: 0xFF8800, emissiveIntensity: 0.55
    });
    var mGlow = new THREE.MeshStandardMaterial({
      color: 0xFFC04D, roughness: 0.10, metalness: 0.15, emissive: 0xFF8C00, emissiveIntensity: 1.5
    });
    var mCyanGlow = new THREE.MeshStandardMaterial({
      color: 0xFFFFFF, emissive: 0x00E5FF, emissiveIntensity: 2.8, roughness: 0.08
    });

    function cyber(geo, base) {
      var g = new THREE.Group();
      g.add(new THREE.Mesh(geo, base));
      var w = new THREE.Mesh(geo, mWire); w.scale.setScalar(1.003); g.add(w);
      return g;
    }
    function mkTorus(R, r, mat, pos, rotX) {
      var g = new THREE.TorusGeometry(R, r, 16, 32);
      if (rotX !== undefined) g.rotateX(rotX);
      var m = new THREE.Mesh(g, mat);
      if (pos) m.position.fromArray(pos);
      return m;
    }
    function mkBox(w2, h2, d, mat, pos) {
      var m = new THREE.Mesh(new THREE.BoxGeometry(w2, h2, d), mat);
      if (pos) m.position.fromArray(pos);
      return m;
    }
    function mkCyl(rT, rB, h2, seg, mat, pos) {
      var m = new THREE.Mesh(new THREE.CylinderGeometry(rT, rB, h2, seg), mat);
      if (pos) m.position.fromArray(pos);
      return m;
    }
    function mkSph(r, mat, pos) {
      var m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 16), mat);
      if (pos) m.position.fromArray(pos);
      return m;
    }

    /* Overall Root */
    this._droneRoot = new THREE.Group();
    this._scene.add(this._droneRoot);

    /* ══════════════════════════════════════════════════════
     *  1. HEAD UNIT
     * ══════════════════════════════════════════════════════ */
    this._headGroup = new THREE.Group();
    this._droneRoot.add(this._headGroup);

    /* Main Chassis */
    this._headGroup.add(cyber(new THREE.BoxGeometry(2.1, 1.55, 1.4, 8, 6, 6), mOrange));
    this._headGroup.add(mkBox(1.92, 1.38, 0.12, mCarbon, [0, 0, 0.67]));

    /* Face Screen */
    var sm = new THREE.MeshBasicMaterial({ map: this._faceTexture, transparent: true });
    this._faceMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.28), sm);
    this._faceMesh.position.z = 0.74;
    this._headGroup.add(this._faceMesh);

    /* Visor */
    var glMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, roughness: 0.05, transmission: 0.9 });
    var gl = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.28), glMat);
    gl.position.z = 0.75;
    this._headGroup.add(gl);

    /* Ear Turbines */
    [[-1.12, 0, 0], [1.12, 0, 0]].forEach(function (pos, idx) {
      var eg = new THREE.Group(); eg.position.fromArray(pos);
      eg.add(mkCyl(0.38, 0.38, 0.22, 16, mCarbon, [0, 0, 0]));
      eg.add(mkTorus(0.36, 0.04, mGold, [0, 0, (idx === 0 ? -0.12 : 0.12)], Math.PI / 2));
      this._headGroup.add(eg);
    }, this);

    /* Antennas */
    var antP = new THREE.CylinderGeometry(0.035, 0.035, 0.55, 8);
    [[-0.75, 0.44], [0.75, -0.44]].forEach(function (p) {
      var ag = new THREE.Group(); ag.position.set(p[0], 0.80, 0); ag.rotation.z = p[1];
      var pole = new THREE.Mesh(antP, mGold); pole.position.y = 0.28; ag.add(pole);
      ag.add(mkSph(0.13, mGlow, [0, 0.55, 0]));
      this._headGroup.add(ag); this._antennas.push(ag);
    }, this);

    /* Underside Hover Thruster */
    this._headThruster = new THREE.Group();
    this._headThruster.add(mkCyl(0.44, 0.32, 0.22, 16, mCarbon, [0, -0.88, 0]));
    this._thrusterRing = mkTorus(0.40, 0.045, new THREE.MeshBasicMaterial({ color: 0xFF8C00 }), [0, -0.96, 0], Math.PI / 2);
    this._headThruster.add(this._thrusterRing);
    this._headParticles = this._makeParticles(25, 0.40, -0.95, 0.8, 0.08, 0xFFA834);
    this._headThruster.add(this._headParticles);
    this._headGroup.add(this._headThruster);

    /* ══════════════════════════════════════════════════════
     *  2. UPRIGHT FLOATING CYBER HANDS (Left & Right)
     *  Fingers pointing UPWARDS with glowing palm core
     * ══════════════════════════════════════════════════════ */
    var HID = 0.001;

    function buildUprightCyberHand(isLeft) {
      var root = new THREE.Group();
      root.scale.setScalar(HID);

      /* Magnetic Floating Bottom Wrist Base */
      var cuff = new THREE.Group();
      cuff.position.set(0, -0.36, 0);
      cuff.add(mkCyl(0.28, 0.24, 0.20, 16, mCarbon));
      cuff.add(mkTorus(0.29, 0.035, mGold, [0, 0.06, 0], Math.PI / 2));
      cuff.add(mkTorus(0.25, 0.03, mCyanGlow, [0, -0.06, 0], Math.PI / 2));
      root.add(cuff);

      /* Wrist Pivot Ball */
      var wristBall = mkSph(0.16, mGold, [0, -0.22, 0]);
      root.add(wristBall);

      /* Main Palm Group (Center at Y = 0) */
      var palmGroup = new THREE.Group();
      palmGroup.position.set(0, 0, 0);

      /* Armored Cyber Palm */
      palmGroup.add(cyber(new THREE.BoxGeometry(0.52, 0.44, 0.20), mOrange));
      palmGroup.add(mkBox(0.46, 0.36, 0.08, mCarbon, [0, 0, 0.08]));  // Front Face
      palmGroup.add(mkBox(0.46, 0.36, 0.08, mCarbon, [0, 0, -0.08])); // Back Plate

      /* Glowing Energy Repulsor Core */
      var palmCore = mkSph(0.11, mCyanGlow, [0, 0, 0.10]);
      palmGroup.add(palmCore);
      palmGroup.add(mkTorus(0.15, 0.025, mGold, [0, 0, 0.10], 0));

      /* 4 Articulated Cyber Fingers Pointing UPWARDS */
      var fingers = [];
      var fingerX = [-0.17, -0.06, 0.06, 0.17];
      var fingerLengths = [0.26, 0.33, 0.31, 0.24];

      fingerX.forEach(function (fx, i) {
        var fg = new THREE.Group();
        fg.position.set(fx, 0.22, 0); // Sits at top edge of palm

        /* Knuckle Joint */
        fg.add(mkSph(0.055, mGold, [0, 0, 0]));

        /* Proximal Phalanx (extends upward) */
        var h1 = fingerLengths[i] * 0.55;
        var ph1 = mkBox(0.085, h1, 0.085, mOrange, [0, h1 * 0.5, 0]);
        fg.add(ph1);

        /* Middle Joint */
        fg.add(mkSph(0.05, mGold, [0, h1, 0]));

        /* Distal Phalanx (extends upward with slight curvature) */
        var h2 = fingerLengths[i] * 0.45;
        var ph2 = mkBox(0.075, h2, 0.075, mCarbon, [0, h1 + h2 * 0.5, 0.02]);
        fg.add(ph2);

        palmGroup.add(fg);
        fingers.push(fg);
      });

      /* Thumb Extending Up & Out from the side */
      var thumb = new THREE.Group();
      var thumbSide = isLeft ? 0.30 : -0.30;
      thumb.position.set(thumbSide, 0.02, 0.04);
      thumb.rotation.z = isLeft ? -0.50 : 0.50; // Angled outward
      thumb.add(mkSph(0.065, mGold, [0, 0, 0]));
      thumb.add(mkBox(0.085, 0.18, 0.085, mOrange, [0, 0.09, 0]));
      thumb.add(mkSph(0.055, mGold, [0, 0.18, 0]));
      thumb.add(mkBox(0.075, 0.15, 0.075, mCarbon, [0, 0.25, 0.02]));
      palmGroup.add(thumb);
      fingers.push(thumb);

      root.add(palmGroup);

      return {
        root: root,
        palmGroup: palmGroup,
        palmCore: palmCore,
        fingers: fingers
      };
    }

    /* Left Hand */
    var leftHandData = buildUprightCyberHand(true);
    this._leftHandGroup = leftHandData.root;
    this._leftPalmGroup = leftHandData.palmGroup;
    this._leftPalmCore = leftHandData.palmCore;
    this._leftFingers = leftHandData.fingers;
    this._leftHandGroup.position.set(-1.60, 0.0, 0.25);
    this._droneRoot.add(this._leftHandGroup);

    /* Right Hand */
    var rightHandData = buildUprightCyberHand(false);
    this._rightHandGroup = rightHandData.root;
    this._rightPalmGroup = rightHandData.palmGroup;
    this._rightPalmCore = rightHandData.palmCore;
    this._rightFingers = rightHandData.fingers;
    this._rightHandGroup.position.set(1.60, 0.0, 0.25);
    this._droneRoot.add(this._rightHandGroup);
  };

  RobotComponent.prototype._makeParticles = function (count, radius, baseY, spread, size, color) {
    var geo = new THREE.BufferGeometry();
    var pos = new Float32Array(count * 3);
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2, r = Math.random() * radius;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = baseY - Math.random() * spread;
      pos[i * 3 + 2] = Math.sin(a) * r;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    var mat = new THREE.PointsMaterial({ color: color, size: size, transparent: true, opacity: 0.82 });
    var g = new THREE.Group(); g.add(new THREE.Points(geo, mat)); return g;
  };

  /* ── EVENTS ───────────────────────────────────────────── */
  RobotComponent.prototype._setupEvents = function () {
    var self = this;
    // Mouse tracking disabled so the robot does not follow the cursor
    this._mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };

    window.addEventListener('click', function (e) {
      if (e.target.closest('input,textarea,button,.suggestion-chip,.question-card')) return;
      var w = window.innerWidth, h = window.innerHeight, inZone = false;
      if (self.mode === 'hero') {
        inZone = e.clientX > w * 0.20 && e.clientX < w * 0.80 && e.clientY > h * 0.05 && e.clientY < h * 0.65;
      } else {
        inZone = e.clientX > w * 0.60 && e.clientY < h * 0.55;
      }
      if (inZone) {
        self.waveHello();
      }
    });
  };

  /* ── TRANSFORM TRIGGER & HELLO GREETING ───────────────── */
  RobotComponent.prototype.transform = function () {
    if (this._transforming) return;
    var self = this;
    var toHands = (this.form === 'head');
    this.form = toHands ? 'hands' : 'head';
    this._transforming = true;
    this._transformDir = toHands ? 1 : -1;
    this._camZTarget = toHands ? this._CAM_HANDS : this._CAM_HEAD;
    this._jumpImpulse = 0.35;
    this._spinImpulse = 0; // No spin rotation
    this.setState('happy');

    if (toHands) {
      this._isWaving = true;
      this._waveTimer = 3.0;
    }
  };

  /* ── MAIN ANIMATION LOOP ──────────────────────────────── */
  RobotComponent.prototype._animate = function () {
    var self = this;
    var now = (performance && performance.now) ? (performance.now() * 0.001) : Date.now() * 0.001;
    var dt = (this._lastTime ? (now - this._lastTime) : 0.016);
    this._lastTime = now;
    if (dt > 0.1) dt = 0.016;
    this._time += dt * 1.8; // Snappy, dynamic animation timeline

    /* Mouse Smooth Lerp - Quick & Responsive */
    this._mouse.x = lerp(this._mouse.x, this._mouse.targetX, 0.14);
    this._mouse.y = lerp(this._mouse.y, this._mouse.targetY, 0.14);

    /* Camera Zoom Lerp */
    this._camZ = lerp(this._camZ, this._camZTarget, 0.10);
    this._camera.position.z = this._camZ;

    /* Hand Materialization Progress */
    var targetProg = (this.form === 'hands') ? 1.0 : 0.0;
    this._handProgress = lerp(this._handProgress, targetProg, 0.16);
    if (Math.abs(this._handProgress - targetProg) < 0.008) {
      this._handProgress = targetProg;
      this._transforming = false;
    }

    var hp = easeOutExpo(this._handProgress);
    var handScale = Math.max(0.001, hp);

    /* Update Left & Right Hands Scale and Floating Positions based on Active Pose */
    if (this._leftHandGroup && this._rightHandGroup) {
      this._leftHandGroup.scale.setScalar(handScale);
      this._rightHandGroup.scale.setScalar(handScale);

      var spreadX = (1 - hp) * 0.9;
      var restLeftX = -1.55 - spreadX;
      var restRightX = 1.55 + spreadX;

      if (this.pose === 'peace' && this.form === 'hands') {
        /* ✌️ Double Hand Dynamic Peace Sign (V-Sign) */
        // Left hand Peace Sign
        this._leftHandGroup.position.set(restLeftX, 0.45 + Math.sin(this._time * 3.0) * 0.08, 0.35);
        this._leftHandGroup.rotation.set(-0.12, 0.20, -0.22);
        this._leftFingers.forEach(function (fg, i) {
          if (i === 1) {
            fg.rotation.set(0.12, 0, -0.38); // Middle finger angled left
            fg.scale.set(1.20, 1.45, 1.20);
          } else if (i === 2) {
            fg.rotation.set(0.12, 0, 0.38); // Index finger angled right
            fg.scale.set(1.20, 1.45, 1.20);
          } else {
            fg.rotation.x = -1.90; // Pinky, Ring, and Thumb tightly folded
            fg.scale.set(1, 1, 1);
          }
        });

        // Right hand Peace Sign
        this._rightHandGroup.position.set(1.40, 0.45 + Math.sin(this._time * 3.0 + 0.5) * 0.08, 0.35);
        this._rightHandGroup.rotation.set(-0.12, -0.20, 0.22);
        this._rightFingers.forEach(function (fg, i) {
          if (i === 1) {
            fg.rotation.set(0.12, 0, -0.38); // Middle finger angled left
            fg.scale.set(1.20, 1.45, 1.20);
          } else if (i === 2) {
            fg.rotation.set(0.12, 0, 0.38); // Index finger angled right
            fg.scale.set(1.20, 1.45, 1.20);
          } else {
            fg.rotation.x = -1.90; // Pinky, Ring, and Thumb tightly folded
            fg.scale.set(1, 1, 1);
          }
        });
      } else if (this.pose === 'thinking' && this.form === 'hands') {
        /* 🤔 Thinking Pose */
        this._leftHandGroup.position.set(-0.75, -0.65 + Math.sin(this._time * 2.0) * 0.04, 0.60);
        this._leftHandGroup.rotation.set(-0.35, 0.28, -0.55);
        this._leftFingers.forEach(function (fg) { fg.rotation.x = -0.40; fg.scale.set(1, 1, 1); });

        this._rightHandGroup.position.set(0.42, -0.48 + Math.sin(this._time * 2.0) * 0.04, 0.82);
        this._rightHandGroup.rotation.set(-0.75, -0.38, 0.32);
        this._rightFingers.forEach(function (fg, i) {
          fg.scale.set(1, 1, 1);
          if (i === 2) {
            fg.rotation.x = 0.15; // Index finger on chin
          } else {
            fg.rotation.x = -1.30;
          }
        });
      } else if ((this.pose === 'celebrate' || this.pose === 'wink') && this.form === 'hands') {
        /* 🎉 Celebration Cheer Pose */
        var cheerJump = Math.sin(this._time * 8) * 0.12;
        this._leftHandGroup.position.set(restLeftX - 0.15, 0.70 + cheerJump, 0.38);
        this._rightHandGroup.position.set(restRightX + 0.15, 0.70 + cheerJump, 0.38);
        this._leftHandGroup.rotation.set(-0.25, 0.22, -0.45 + Math.sin(this._time * 6) * 0.10);
        this._rightHandGroup.rotation.set(-0.25, -0.22, 0.45 - Math.sin(this._time * 6) * 0.10);
        this._leftFingers.forEach(function (fg, i) {
          fg.scale.set(1.15, 1.25, 1.15);
          fg.rotation.x = Math.sin(self._time * 8 + i * 0.4) * 0.20;
        });
        this._rightFingers.forEach(function (fg, i) {
          fg.scale.set(1.15, 1.25, 1.15);
          fg.rotation.x = Math.sin(self._time * 8 + i * 0.4 + 0.3) * 0.20;
        });
      } else if (this.pose === 'rockstar' && this.form === 'hands') {
        /* 🤘 Rockstar Pose */
        var rockBeat = Math.sin(this._time * 12) * 0.10;
        this._leftHandGroup.position.set(restLeftX + 0.15, 0.62 + rockBeat, 0.45);
        this._leftHandGroup.rotation.set(-0.32, 0.25, -0.38);
        this._leftFingers.forEach(function (fg, i) {
          fg.scale.set(1, 1, 1);
          if (i === 0 || i === 3) {
            fg.rotation.x = 0.15;
          } else if (i === 4) {
            fg.rotation.x = 0.30;
          } else {
            fg.rotation.x = -1.70;
          }
        });

        this._rightHandGroup.position.set(restRightX - 0.15, 0.62 - rockBeat, 0.45);
        this._rightHandGroup.rotation.set(-0.32, -0.25, 0.38);
        this._rightFingers.forEach(function (fg, i) {
          fg.scale.set(1, 1, 1);
          if (i === 0 || i === 3) {
            fg.rotation.x = 0.15;
          } else if (i === 4) {
            fg.rotation.x = 0.30;
          } else {
            fg.rotation.x = -1.70;
          }
        });
      } else {
        /* 👋 Wave Pose */
        var lWaveZ = Math.sin(this._time * 10) * 0.40 - 0.10;
        var rWaveZ = -Math.sin(this._time * 10) * 0.40 + 0.10;
        this._leftHandGroup.position.set(restLeftX, 0.48 + Math.sin(this._time * 2.8) * 0.08, 0.28);
        this._rightHandGroup.position.set(restRightX, 0.48 + Math.cos(this._time * 2.8) * 0.08, 0.28);
        this._leftHandGroup.rotation.set(-0.15, 0.15, lWaveZ);
        this._rightHandGroup.rotation.set(-0.15, -0.15, rWaveZ);

        this._leftFingers.forEach(function (fg, i) {
          fg.scale.set(1, 1, 1);
          fg.rotation.x = Math.sin(self._time * 10 + i * 0.5) * 0.30;
        });
        this._rightFingers.forEach(function (fg, i) {
          fg.scale.set(1, 1, 1);
          fg.rotation.x = Math.sin(self._time * 10 + i * 0.5 + 0.5) * 0.30;
        });
      }
    }

    /* Floating Dynamics */
    var baseY = 0.55;
    var scl = 0.68;
    var ttx = 0, tty = baseY, ttz = 0;

    if (this.mode === 'photobooth') {
      var isSmall = window.innerWidth < 960;
      if (isSmall) {
        ttx = 0;
        tty = 1.95 + Math.cos(this._time * 2.0) * 0.08;
        ttz = -0.5;
        scl = 0.26;
      } else {
        var asp2 = this._camera.aspect || 1.6;
        ttx = -Math.min(3.6, Math.max(2.6, asp2 * 1.85)) + Math.sin(this._time * 1.8) * 0.12;
        tty = 0.45 + Math.cos(this._time * 2.2) * 0.14;
        ttz = -0.2;
        scl = 0.46;
      }
    } else if (this.mode === 'hero') {
      ttx = Math.sin(this._time * 2.0) * 0.25;
      tty += Math.cos(this._time * 2.4) * 0.18;
      ttz = Math.sin(this._time * 2.2) * 0.12;
    } else {
      var asp = this._camera.aspect || 1.6;
      var cx = -Math.min(3.4, Math.max(2.5, asp * 1.85));
      ttx = cx + Math.sin(this._time * 1.8) * 0.12;
      tty = 1.35 + Math.cos(this._time * 2.0) * 0.12;
      ttz = -0.4;
      scl = (window.innerWidth < 800) ? 0 : 0.32;
    }

    if (this.state === 'thinking') tty += Math.sin(this._time * 6) * 0.10;
    else if (this.state === 'responding') tty += Math.sin(this._time * 14) * 0.06;
    else if (this.state === 'happy') tty += Math.sin(this._time * 10) * 0.10;

    if (Math.abs(this._jumpImpulse) > 0.005) {
      tty += this._jumpImpulse;
      this._jumpImpulse = lerp(this._jumpImpulse, 0, 0.15);
    }

    var rx = Math.sin(this._time * 2.5) * 0.04;
    var ry = Math.sin(this._time * 1.8) * 0.08;
    var rz = Math.cos(this._time * 2.0) * 0.04;
    if (this.mode === 'photobooth') ry += 0.24; // Angle slightly inward toward center
    if (this.mode === 'chat') ry -= 0.18;
    if (this.state === 'thinking') { rz = -0.16 + Math.sin(this._time * 8) * 0.08; rx = -0.10; }
    if (this.state === 'responding') rx += Math.sin(this._time * 12) * 0.04;
    if (Math.abs(this._spinImpulse) > 0.01) {
      ry += this._spinImpulse;
      this._spinImpulse = lerp(this._spinImpulse, 0, 0.12);
    }

    this._pos.x = lerp(this._pos.x, ttx, 0.14);
    this._pos.y = lerp(this._pos.y, tty, 0.14);
    this._pos.z = lerp(this._pos.z, ttz, 0.14);
    this._rot.x = lerp(this._rot.x, rx, 0.14);
    this._rot.y = lerp(this._rot.y, ry, 0.14);
    this._rot.z = lerp(this._rot.z, rz, 0.14);

    if (this._droneRoot) {
      this._droneRoot.position.set(this._pos.x, this._pos.y, this._pos.z);
      this._droneRoot.rotation.set(this._rot.x, this._rot.y, this._rot.z);
      this._droneRoot.scale.setScalar(lerp(this._droneRoot.scale.x, scl, 0.12));
    }

    /* Pulse Repulsor Palm Cores */
    if (this._leftPalmCore && this._rightPalmCore) {
      var coreScale = 1 + Math.sin(this._time * 8) * 0.22;
      this._leftPalmCore.scale.setScalar(coreScale);
      this._rightPalmCore.scale.setScalar(coreScale);
    }

    /* Antennas & Thrusters */
    if (this._antennas.length >= 2) {
      this._antennas[0].rotation.z = 0.44 + Math.sin(this._time * 3.5) * 0.04;
      this._antennas[1].rotation.z = -0.44 + Math.sin(this._time * 3.5 + 1) * 0.04;
    }
    if (this._thrusterRing) this._thrusterRing.scale.setScalar(1 + Math.sin(this._time * 6) * 0.09);
    if (this._headParticles) this._headParticles.rotation.y = this._time * 0.5;

    /* Blinking */
    this._blinkTimer += dt;
    if (this._blinkTimer >= this._nextBlinkTime) {
      this._isBlinking = true;
      if (this._blinkTimer >= this._nextBlinkTime + 0.12) {
        this._isBlinking = false;
        this._blinkTimer = 0;
        this._nextBlinkTime = 2.4 + Math.random() * 3.5;
      }
    }

    /* Render */
    if (this._renderer && this._scene && this._camera) {
      this._drawFace();
      this._renderer.render(this._scene, this._camera);
    }

    this._animFrame = requestAnimationFrame(function () { self._animate(); });
  };

  /* ── PUBLIC API ───────────────────────────────────────── */
  RobotComponent.prototype.setState = function (s) { if (this.state !== s) this.state = s; };

  RobotComponent.prototype.setPose = function (pose) {
    this.pose = pose || 'wave';
    this.form = 'hands';
    this._handProgress = 1.0;
    this._jumpImpulse = 0.30; // Noticeable energetic jump reaction on pose select!
    if (this.pose === 'thinking') {
      this.setState('thinking');
    } else if (this.pose === 'rockstar') {
      this.setState('wink');
    } else if (this.pose === 'celebrate' || this.pose === 'wink') {
      this.setState('wink');
    } else {
      this.setState('happy');
    }
    this._drawFace();
  };

  RobotComponent.prototype.setMode = function (mode) {
    this.mode = mode;
    if (!this._haloEl) return;
    if (mode === 'chat' || mode === 'photobooth') {
      Object.assign(this._haloEl.style, { left: '86%', top: '35%', width: '220px', height: '220px', opacity: '0.5' });
    } else {
      Object.assign(this._haloEl.style, { left: '50%', top: '32%', width: '320px', height: '320px', opacity: '1' });
    }
  };

  RobotComponent.prototype.waveHello = function () {
    var self = this;
    this.setState('happy');
    this._jumpImpulse = 0.35;
    this._spinImpulse = 0; // Keep robot stably facing front (no spin)
    if (this.form === 'hands') {
      this._isWaving = true;
      this._waveTimer = 3.2;
    }
  };

  RobotComponent.prototype.getPhotoboothSnapshot = function (width, height) {
    width = width || 600;
    height = height || 700;
    try {
      var offCanvas = document.createElement('canvas');
      offCanvas.width = width;
      offCanvas.height = height;

      var offRenderer = new THREE.WebGLRenderer({
        canvas: offCanvas,
        alpha: true,
        antialias: true,
        preserveDrawingBuffer: true
      });
      offRenderer.setPixelRatio(1);
      offRenderer.setSize(width, height, false);
      offRenderer.setClearColor(0x000000, 0);

      // Perspective camera positioned to fit the complete robot (antennas, hands, thruster particles)
      var offCam = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
      offCam.position.set(0, -0.08, 7.2);
      offCam.lookAt(0, -0.08, 0);

      // Save original transform states
      var origState = this.state;
      var origPos = { x: this._pos.x, y: this._pos.y, z: this._pos.z };
      var origRot = { x: this._rot.x, y: this._rot.y, z: this._rot.z };
      var origScale = this._droneRoot.scale.x;
      var origLeftState = this._leftHandGroup ? {
        rx: this._leftHandGroup.rotation.x, ry: this._leftHandGroup.rotation.y, rz: this._leftHandGroup.rotation.z,
        px: this._leftHandGroup.position.x, py: this._leftHandGroup.position.y, pz: this._leftHandGroup.position.z,
        scale: this._leftHandGroup.scale.x
      } : null;
      var origRightState = this._rightHandGroup ? {
        rx: this._rightHandGroup.rotation.x, ry: this._rightHandGroup.rotation.y, rz: this._rightHandGroup.rotation.z,
        px: this._rightHandGroup.position.x, py: this._rightHandGroup.position.y, pz: this._rightHandGroup.position.z,
        scale: this._rightHandGroup.scale.x
      } : null;

      // Front-facing, normal scale
      this._droneRoot.position.set(0, 0.0, 0);
      this._droneRoot.rotation.set(0, 0, 0);
      this._droneRoot.scale.setScalar(1.0);

      if (this._leftHandGroup && this._rightHandGroup) {
        this._leftHandGroup.scale.setScalar(1.0);
        this._rightHandGroup.scale.setScalar(1.0);

        if (this.pose === 'peace') {
          // Peace sign ✌️ - both hands: index & middle fingers extended, rest folded
          this._leftHandGroup.position.set(-1.45, 0.45, 0.35);
          this._leftHandGroup.rotation.set(-0.12, 0.20, -0.22);
          this._leftFingers.forEach(function (fg, i) {
            if (i === 1) { fg.rotation.set(0.12, 0, -0.38); fg.scale.set(1.20, 1.45, 1.20); }
            else if (i === 2) { fg.rotation.set(0.12, 0, 0.38); fg.scale.set(1.20, 1.45, 1.20); }
            else { fg.rotation.x = -1.90; fg.scale.set(1, 1, 1); }
          });
          this._rightHandGroup.position.set(1.40, 0.45, 0.35);
          this._rightHandGroup.rotation.set(-0.12, -0.20, 0.22);
          this._rightFingers.forEach(function (fg, i) {
            if (i === 1) { fg.rotation.set(0.12, 0, -0.38); fg.scale.set(1.20, 1.45, 1.20); }
            else if (i === 2) { fg.rotation.set(0.12, 0, 0.38); fg.scale.set(1.20, 1.45, 1.20); }
            else { fg.rotation.x = -1.90; fg.scale.set(1, 1, 1); }
          });
          this.state = 'happy';
        } else if (this.pose === 'thinking') {
          this._leftHandGroup.position.set(-0.75, -0.65, 0.60);
          this._leftHandGroup.rotation.set(-0.35, 0.28, -0.55);
          this._leftFingers.forEach(function (fg) { fg.rotation.x = -0.40; });

          this._rightHandGroup.position.set(0.42, -0.48, 0.82);
          this._rightHandGroup.rotation.set(-0.75, -0.38, 0.32);
          this._rightFingers.forEach(function (fg, i) {
            if (i === 2) fg.rotation.x = 0.15;
            else fg.rotation.x = -1.30;
          });
          this.state = 'thinking';
        } else if (this.pose === 'rockstar') {
          this._leftHandGroup.position.set(-1.30, 0.62, 0.45);
          this._leftHandGroup.rotation.set(-0.32, 0.25, -0.38);
          this._leftFingers.forEach(function (fg, i) {
            if (i === 0 || i === 3) fg.rotation.x = 0.15;
            else if (i === 4) fg.rotation.x = 0.30;
            else fg.rotation.x = -1.70;
          });

          this._rightHandGroup.position.set(1.30, 0.62, 0.45);
          this._rightHandGroup.rotation.set(-0.32, -0.25, 0.38);
          this._rightFingers.forEach(function (fg, i) {
            if (i === 0 || i === 3) fg.rotation.x = 0.15;
            else if (i === 4) fg.rotation.x = 0.30;
            else fg.rotation.x = -1.70;
          });
          this.state = 'wink';
        } else {
          // Cheerful wave / greeting pose (both hands raised up warmly)
          this._leftHandGroup.position.set(-1.50, 0.48, 0.28);
          this._rightHandGroup.position.set(1.50, 0.48, 0.28);
          this._leftHandGroup.rotation.set(-0.15, 0.15, -0.25);
          this._rightHandGroup.rotation.set(-0.15, -0.15, 0.25);
          this._leftFingers.forEach(function (fg) { fg.rotation.x = 0; });
          this._rightFingers.forEach(function (fg) { fg.rotation.x = 0; });
          this.state = 'happy';
        }
      }

      this._drawFace();

      offRenderer.render(this._scene, offCam);

      // Restore original state
      this.state = origState;
      this._droneRoot.position.set(origPos.x, origPos.y, origPos.z);
      this._droneRoot.rotation.set(origRot.x, origRot.y, origRot.z);
      this._droneRoot.scale.setScalar(origScale);

      if (origLeftState && this._leftHandGroup) {
        this._leftHandGroup.rotation.set(origLeftState.rx, origLeftState.ry, origLeftState.rz);
        this._leftHandGroup.position.set(origLeftState.px, origLeftState.py, origLeftState.pz);
        this._leftHandGroup.scale.setScalar(origLeftState.scale);
      }
      if (origRightState && this._rightHandGroup) {
        this._rightHandGroup.rotation.set(origRightState.rx, origRightState.ry, origRightState.rz);
        this._rightHandGroup.position.set(origRightState.px, origRightState.py, origRightState.pz);
        this._rightHandGroup.scale.setScalar(origRightState.scale);
      }

      offRenderer.dispose();
      return offCanvas;
    } catch (e) {
      console.warn('[Robot] Snapshot error, falling back to domElement:', e);
      return this._renderer ? this._renderer.domElement : null;
    }
  };

  RobotComponent.prototype.poke = function () {
    if (!this._transforming) this.transform();
  };

  RobotComponent.prototype.destroy = function () {
    if (this._animFrame) cancelAnimationFrame(this._animFrame);
    if (this._renderer) this._renderer.dispose();
  };

  window.RobotComponent = RobotComponent;

})();
