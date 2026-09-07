/**
 * ============================================================
 *  APP.JS — CS PHOTOBOOTH Main Orchestrator
 * ============================================================
 */
(function () {
  'use strict';

  function App() {
    this.robot      = null;
    this.photobooth = null;
    this._init();
  }

  App.prototype._init = function () {
    var self = this;

    // Initialize 3D Companion Robot
    this.robot = new window.RobotComponent("robotContainer");

    // Initialize Photobooth Engine
    this.photobooth = new window.PhotoboothComponent(this.robot);

    // Initial greeting pose
    setTimeout(function () {
      if (self.robot) {
        self.robot.setMode('photobooth');
        self.robot.waveHello();
      }
    }, 400);

    // Interactive Mascot poke
    document.addEventListener("click", function (e) {
      var heroMascot = e.target.closest(".hero-brand-pill, .pb-hero-header");
      if (heroMascot && self.robot) {
        self.robot.waveHello();
      }
    });

    this._initParticles();
    console.log("[CS PHOTOBOOTH] App initialized.");
  };

  App.prototype._initParticles = function () {
    var canvas = document.getElementById("particleCanvas");
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    var particles = [];

    function resize() {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    }

    function createParticle() {
      return {
        x: Math.random() * canvas.width,
        y: canvas.height + 5,
        r: Math.random() * 1.8 + 0.4,
        opacity: Math.random() * 0.4 + 0.05,
        vx: (Math.random() - 0.5) * 0.3,
        vy: -Math.random() * 0.5 - 0.1,
      };
    }

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,122,0," + p.opacity + ")";
        ctx.fill();
        p.x += p.vx;
        p.y += p.vy;
        p.opacity -= 0.0008;
        if (p.y < -10 || p.opacity <= 0) particles[i] = createParticle();
      }
      requestAnimationFrame(draw);
    }

    window.addEventListener("resize", resize);
    resize();

    for (var i = 0; i < 45; i++) {
      var p = createParticle();
      p.y = Math.random() * canvas.height;
      particles.push(p);
    }

    draw();
  };

  // Launch on DOM ready
  document.addEventListener("DOMContentLoaded", function () {
    window._ariaApp = new App();
  });

})();
