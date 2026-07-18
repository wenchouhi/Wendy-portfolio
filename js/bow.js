/* ============================================================
   Bow particle cloud — home hero
   Draws a ribbon-bow silhouette offscreen, samples it into
   particle targets, then animates particles with spring +
   mouse-repulsion physics. Respects prefers-reduced-motion.
   ============================================================ */
(function () {
  const canvas = document.getElementById('bowCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = window.matchMedia('(max-width: 767px)').matches;

  const CONFIG = {
    count: isMobile ? 550 : 1300,
    stiffness: 0.05,
    damping: 0.86,
    repelRadius: isMobile ? 60 : 95,
    repelForce: 2.6,
    floatAmp: 2.2,
    dotColor: '10, 10, 10',
  };

  let particles = [];
  let mouse = { x: -9999, y: -9999 };
  let dpr = 1;
  let W = 0, H = 0;
  let rafId = null;
  let running = false;

  /* ---------- Draw bow silhouette on an offscreen canvas ---------- */
  function drawBowShape(size) {
    const off = document.createElement('canvas');
    off.width = size;
    off.height = size;
    const c = off.getContext('2d');
    const cx = size / 2;
    const cy = size * 0.42;
    const r = size * 0.30;

    c.fillStyle = '#000';

    // Loops (rotated ellipses)
    [[-1, -0.32], [1, 0.32]].forEach(([side, rot]) => {
      c.save();
      c.translate(cx + side * r * 0.98, cy - r * 0.06);
      c.rotate(rot);
      c.beginPath();
      c.ellipse(0, 0, r * 0.98, r * 0.62, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();
    });

    // Knot
    c.beginPath();
    c.arc(cx, cy, r * 0.34, 0, Math.PI * 2);
    c.fill();

    // Tails (mirrored ribbons with notched ends)
    [[-1], [1]].forEach(([side]) => {
      c.save();
      c.translate(cx, cy);
      c.scale(side, 1);
      c.beginPath();
      c.moveTo(r * 0.10, r * 0.22);
      c.quadraticCurveTo(r * 0.55, r * 0.75, r * 0.72, r * 1.42);
      c.lineTo(r * 0.34, r * 1.52);
      c.quadraticCurveTo(r * 0.18, r * 0.85, r * 0.02, r * 0.34);
      c.closePath();
      c.fill();
      // Notch cut at ribbon end
      c.globalCompositeOperation = 'destination-out';
      c.beginPath();
      c.moveTo(r * 0.53, r * 1.60);
      c.lineTo(r * 0.53, r * 1.30);
      c.lineTo(r * 0.80, r * 1.55);
      c.closePath();
      c.fill();
      c.restore();
    });

    return c.getImageData(0, 0, size, size);
  }

  /* ---------- Sample silhouette pixels into target points ---------- */
  function buildTargets() {
    const shapeSize = Math.round(Math.min(W, H) * (isMobile ? 0.86 : 0.68));
    const img = drawBowShape(shapeSize);
    const pts = [];
    // Choose a sampling step that lands near the particle budget
    let step = 3;
    for (; step < 20; step++) {
      let n = 0;
      for (let y = 0; y < shapeSize; y += step) {
        for (let x = 0; x < shapeSize; x += step) {
          if (img.data[(y * shapeSize + x) * 4 + 3] > 128) n++;
        }
      }
      if (n <= CONFIG.count) break;
    }
    const ox = (W - shapeSize) / 2;
    const oy = (H - shapeSize) / 2 - H * 0.015;
    for (let y = 0; y < shapeSize; y += step) {
      for (let x = 0; x < shapeSize; x += step) {
        if (img.data[(y * shapeSize + x) * 4 + 3] > 128) {
          pts.push({
            x: ox + x + (Math.random() - 0.5) * step * 0.7,
            y: oy + y + (Math.random() - 0.5) * step * 0.7,
          });
        }
      }
    }
    return pts;
  }

  function buildParticles() {
    const targets = buildTargets();
    particles = targets.map((t) => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: 0,
      vy: 0,
      hx: t.x,
      hy: t.y,
      r: 0.8 + Math.random() * 1.1,
      alpha: 0.55 + Math.random() * 0.45,
      phase: Math.random() * Math.PI * 2,
      speed: 0.5 + Math.random() * 0.9,
    }));
    if (reduceMotion) {
      particles.forEach((p) => { p.x = p.hx; p.y = p.hy; });
    }
  }

  /* ---------- Render ---------- */
  function render(t) {
    ctx.clearRect(0, 0, W, H);
    const time = t * 0.001;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];

      if (!reduceMotion) {
        const fx = p.hx + Math.sin(time * p.speed + p.phase) * CONFIG.floatAmp;
        const fy = p.hy + Math.cos(time * p.speed * 0.8 + p.phase) * CONFIG.floatAmp;

        p.vx += (fx - p.x) * CONFIG.stiffness;
        p.vy += (fy - p.y) * CONFIG.stiffness;

        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const d2 = dx * dx + dy * dy;
        const R = CONFIG.repelRadius;
        if (d2 < R * R && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const f = ((R - d) / R) * CONFIG.repelForce;
          p.vx += (dx / d) * f;
          p.vy += (dy / d) * f;
        }

        p.vx *= CONFIG.damping;
        p.vy *= CONFIG.damping;
        p.x += p.vx;
        p.y += p.vy;
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${CONFIG.dotColor}, ${p.alpha})`;
      ctx.fill();
    }
  }

  function loop(t) {
    render(t);
    rafId = requestAnimationFrame(loop);
  }

  /* ---------- Setup / resize ---------- */
  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = rect.width;
    H = rect.height;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildParticles();
    if (reduceMotion) render(0);
  }

  canvas.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  });
  canvas.addEventListener('pointerleave', () => {
    mouse.x = -9999;
    mouse.y = -9999;
  });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 200);
  });

  /* ---------- Public control (called by app router) ---------- */
  window.Bow = {
    start() {
      resize();
      if (reduceMotion) { render(0); return; }
      if (!running) {
        running = true;
        rafId = requestAnimationFrame(loop);
      }
    },
    stop() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
    },
    scatter() {
      // Used by the intro: fling particles outward before they regroup
      particles.forEach((p) => {
        p.x = W / 2 + (Math.random() - 0.5) * W * 1.4;
        p.y = H / 2 + (Math.random() - 0.5) * H * 1.4;
      });
    },
    settle() {
      // Snap particles onto their targets (debug / instant preview)
      particles.forEach((p) => { p.x = p.hx; p.y = p.hy; p.vx = 0; p.vy = 0; });
      render(performance.now());
    },
  };
})();
