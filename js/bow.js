/* ============================================================
   "Portfolio" script-lettering particle cloud — home hero
   Renders the word in a cursive script (plus two sparkle stars)
   on an offscreen canvas, samples the OUTLINE edge pixels into
   particle targets with sketchy jitter, then animates:
     - spring-home particles with per-particle randomized
       mouse-repel scatter
     - click/tap explosion (staggered, radial burst)
     - continuous detach-and-fall rain with respawning targets
     - fallen particles piling up at the bottom (desktop only,
       height-capped)
   Respects prefers-reduced-motion (static outline, no motion).
   Public API (kept from the old bow): window.Bow.start/stop/
   scatter/settle.
   ============================================================ */
(function () {
  const canvas = document.getElementById('bowCanvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = window.matchMedia('(max-width: 767px)').matches;
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;

  const COLOR = '169, 239, 213'; // #A9EFD5
  const CONFIG = {
    budget: isMobile ? 1800 : 6000,   // mobile ≈ 43% of desktop
    stiffness: 0.045,
    damping: 0.86,
    repelRadius: isMobile ? 55 : 75,
    repelForce: 2.2,
    wobbleAmp: 1.2,
    detachPerSec: isMobile ? 8 : 24,  // particles leaving the text per second
    gravity: 42,                      // px/s² for falling particles
    maxFallSpeed: 65,                 // px/s — slow, floaty descent
    fallingCap: isMobile ? 150 : 550,
    pileEnabled: !isMobile,           // mobile skips accumulation entirely
    pileMaxRatio: 0.13,               // pile height cap as fraction of canvas height
    explodeRadius: 130,
    respawnDelay: [0.6, 2.2],         // seconds, random range
  };

  let particles = [];      // text particles bound to outline targets
  let falling = [];        // detached particles raining down
  let heightmap = [];      // per-4px-column pile height (css px)
  let pileCanvas = null;   // persistent offscreen layer for settled dots
  let pileCtx = null;
  let mouse = { x: -9999, y: -9999 };
  let dpr = 1;
  let W = 0, H = 0;
  let rafId = null;
  let running = false;
  let lastFrame = null;
  let detachCarry = 0;
  let fontReady = false;

  const rand = (a, b) => a + Math.random() * (b - a);

  /* ---------- Draw the lettering + stars on an offscreen canvas ---------- */
  function star(c, cx, cy, outer, points, rotation) {
    const inner = outer * 0.34;
    c.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = rotation + (i * Math.PI) / points;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.closePath();
    c.fill();
  }

  function drawLettering() {
    const off = document.createElement('canvas');
    off.width = W;
    off.height = H;
    const c = off.getContext('2d');
    c.fillStyle = '#000';

    // Fit "Portfolio" to ~78% of the canvas width
    let fontSize = 100;
    c.font = `${fontSize}px "Great Vibes", cursive`;
    const w100 = c.measureText('Portfolio').width || 1;
    fontSize = Math.min((W * 0.86) / w100 * 100, H * 0.52);
    c.font = `${fontSize}px "Great Vibes", cursive`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const cx = W / 2;
    const cy = H * 0.55;
    c.fillText('Portfolio', cx, cy);

    const textW = c.measureText('Portfolio').width;
    const left = cx - textW / 2;
    const top = cy - fontSize * 0.35;

    // Big 4-point sparkle by the P's upper-left, small one near the "li"
    star(c, left + textW * 0.045, top - fontSize * 0.02, fontSize * 0.18, 4, -0.28);
    star(c, left + textW * 0.795, top + fontSize * 0.16, fontSize * 0.065, 4, 0.35);

    return c.getImageData(0, 0, W, H);
  }

  /* ---------- Sample outline-edge pixels into jittered targets ---------- */
  function buildTargets() {
    const img = drawLettering();
    const d = img.data;
    const solid = (x, y) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return false;
      return d[(y * W + x) * 4 + 3] > 128;
    };

    const edges = [];
    const E = 2; // edge-detection neighbor distance
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        if (!solid(x, y)) continue;
        if (!solid(x - E, y) || !solid(x + E, y) || !solid(x, y - E) || !solid(x, y + E)) {
          edges.push({ x, y });
        }
      }
    }

    // Thin the edge set down to the particle budget, then jitter for the
    // sketchy hand-drawn look (a slice gets a rougher second pass).
    const pts = [];
    const keep = Math.min(1, CONFIG.budget / (edges.length || 1));
    for (const e of edges) {
      if (Math.random() > keep) continue;
      const rough = Math.random() < 0.18;
      const j = rough ? 2.4 : 0.9;
      pts.push({ x: e.x + rand(-j, j), y: e.y + rand(-j, j) });
    }
    return pts;
  }

  function makeParticle(t) {
    return {
      hx: t.x, hy: t.y,
      x: t.x + rand(-40, 40), y: t.y + rand(-40, 40),
      vx: 0, vy: 0,
      r: rand(0.7, 1.4),
      alpha: rand(0.7, 1),
      phase: rand(0, Math.PI * 2),
      speed: rand(0.5, 1.4),
      repelMul: rand(0.5, 1.6),   // per-particle randomness → async scatter
      state: 'text',              // text | burst | respawn
      burstT: 0, burstDur: 0,
      respawnT: 0,
      fade: 1,
    };
  }

  function buildParticles() {
    const targets = buildTargets();
    particles = targets.map(makeParticle);
    falling = [];
    heightmap = new Array(Math.ceil(W / 4)).fill(0);
    if (CONFIG.pileEnabled) {
      pileCanvas = document.createElement('canvas');
      pileCanvas.width = W * dpr;
      pileCanvas.height = H * dpr;
      pileCtx = pileCanvas.getContext('2d');
      pileCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    if (reduceMotion) {
      particles.forEach((p) => { p.x = p.hx; p.y = p.hy; });
    }
  }

  /* ---------- Lifecycle: detach → fall → pile / fade ---------- */
  function pileHeightAt(x) {
    const i = Math.max(0, Math.min(heightmap.length - 1, Math.floor(x / 4)));
    return heightmap[i];
  }

  function detachToFalling(p, vx, vy) {
    if (falling.length < CONFIG.fallingCap) {
      falling.push({
        x: p.x, y: p.y,
        vx: vx !== undefined ? vx : rand(-6, 6),
        vy: vy !== undefined ? vy : rand(0, 12),
        r: p.r, alpha: p.alpha,
        phase: rand(0, Math.PI * 2),
        fade: 1,
      });
    }
    p.state = 'respawn';
    p.respawnT = rand(CONFIG.respawnDelay[0], CONFIG.respawnDelay[1]);
    p.fade = 0;
  }

  function explodeAt(mx, my) {
    if (reduceMotion) return;
    for (const p of particles) {
      if (p.state !== 'text') continue;
      const dx = p.x - mx, dy = p.y - my;
      const dist = Math.hypot(dx, dy);
      if (dist > CONFIG.explodeRadius) continue;
      p.state = 'burst';
      p.burstT = -rand(0, 0.15);           // staggered start
      p.burstDur = rand(0.35, 0.8);
      const f = rand(140, 380) * (1 - dist / CONFIG.explodeRadius * 0.6);
      const a = Math.atan2(dy, dx) + rand(-0.35, 0.35);
      p.vx = Math.cos(a) * f;
      p.vy = Math.sin(a) * f;
    }
  }

  /* ---------- Simulation step ---------- */
  function step(dt, time) {
    // Continuous detachment (fractional accumulator keeps the rate exact)
    detachCarry += CONFIG.detachPerSec * dt;
    while (detachCarry >= 1) {
      detachCarry -= 1;
      const candidates = particles.filter((p) => p.state === 'text');
      if (candidates.length > CONFIG.budget * 0.5) {
        detachToFalling(candidates[(Math.random() * candidates.length) | 0]);
      }
    }

    for (const p of particles) {
      if (p.state === 'respawn') {
        p.respawnT -= dt;
        if (p.respawnT <= 0) {
          p.state = 'text';
          p.x = p.hx; p.y = p.hy;
          p.vx = 0; p.vy = 0;
          p.fade = 0.01;
        }
        continue;
      }
      if (p.fade < 1) p.fade = Math.min(1, p.fade + dt * 1.8);

      if (p.state === 'burst') {
        p.burstT += dt;
        if (p.burstT < 0) continue;        // staggered delay
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.92;
        p.vy *= 0.92;
        if (p.burstT >= p.burstDur) {
          if (Math.random() < 0.65) detachToFalling(p, p.vx * 0.2, Math.max(p.vy * 0.2, 4));
          else { p.state = 'respawn'; p.respawnT = rand(1.2, 2.8); p.fade = 0; }
        }
        continue;
      }

      // state === 'text': wobble + spring + mouse repel
      const fx = p.hx + Math.sin(time * p.speed + p.phase) * CONFIG.wobbleAmp;
      const fy = p.hy + Math.cos(time * p.speed * 0.8 + p.phase) * CONFIG.wobbleAmp;
      p.vx += (fx - p.x) * CONFIG.stiffness;
      p.vy += (fy - p.y) * CONFIG.stiffness;

      if (!coarsePointer) {
        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const d2 = dx * dx + dy * dy;
        const R = CONFIG.repelRadius;
        if (d2 < R * R && d2 > 0.01) {
          const dist = Math.sqrt(d2);
          const f = ((R - dist) / R) * CONFIG.repelForce * p.repelMul;
          p.vx += (dx / dist) * f;
          p.vy += (dy / dist) * f;
        }
      }

      p.vx *= CONFIG.damping;
      p.vy *= CONFIG.damping;
      p.x += p.vx;
      p.y += p.vy;
    }

    // Falling particles: gentle gravity + sway, then pile up or fade out
    const pileCap = H * CONFIG.pileMaxRatio;
    for (let i = falling.length - 1; i >= 0; i--) {
      const f = falling[i];
      f.vy = Math.min(f.vy + CONFIG.gravity * dt, CONFIG.maxFallSpeed);
      f.x += f.vx * dt + Math.sin(time * 1.3 + f.phase) * 0.25;
      f.y += f.vy * dt;
      f.vx *= 0.995;

      const floorY = H - 2 - (CONFIG.pileEnabled ? pileHeightAt(f.x) : 0);
      if (CONFIG.pileEnabled && f.y >= floorY) {
        const bucket = Math.max(0, Math.min(heightmap.length - 1, Math.floor(f.x / 4)));
        if (heightmap[bucket] < pileCap) {
          // Stamp onto the persistent pile layer, then grow that column
          pileCtx.beginPath();
          pileCtx.arc(f.x, floorY, f.r, 0, Math.PI * 2);
          pileCtx.fillStyle = `rgba(${COLOR}, ${f.alpha})`;
          pileCtx.fill();
          heightmap[bucket] += f.r * 1.5;
        }
        falling.splice(i, 1);
      } else if (!CONFIG.pileEnabled && f.y > H - 30) {
        f.fade -= dt * 2.5;
        if (f.fade <= 0 || f.y > H + 5) falling.splice(i, 1);
      } else if (f.y > H + 5) {
        falling.splice(i, 1);
      }
    }
  }

  /* ---------- Render ---------- */
  function render() {
    ctx.clearRect(0, 0, W, H);
    if (pileCanvas) {
      ctx.drawImage(pileCanvas, 0, 0, pileCanvas.width, pileCanvas.height, 0, 0, W, H);
    }
    for (const p of particles) {
      if (p.state === 'respawn' || p.fade <= 0) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${COLOR}, ${p.alpha * p.fade})`;
      ctx.fill();
    }
    for (const f of falling) {
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${COLOR}, ${f.alpha * f.fade})`;
      ctx.fill();
    }
  }

  function loop(t) {
    const time = t * 0.001;
    if (lastFrame === null) lastFrame = time;
    const dt = Math.min(time - lastFrame, 0.05);
    lastFrame = time;
    step(dt, time);
    render();
    rafId = requestAnimationFrame(loop);
  }

  /* ---------- Setup / resize / input ---------- */
  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.round(rect.width);
    H = Math.round(rect.height);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildParticles();
    if (reduceMotion) render();
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
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    explodeAt(e.clientX - rect.left, e.clientY - rect.top);
  });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 200);
  });

  // The script font loads async — rebuild targets once it's available so
  // the outline is sampled from Great Vibes rather than the fallback.
  if (document.fonts && document.fonts.load) {
    document.fonts.load('100px "Great Vibes"').then(() => {
      fontReady = true;
      if (W > 0) buildParticles();
      if (reduceMotion && W > 0) render();
    }).catch(() => {});
  }

  /* ---------- Public control (called by app router) ---------- */
  window.Bow = {
    start() {
      resize();
      if (reduceMotion) { render(); return; }
      if (!running) {
        running = true;
        lastFrame = null;
        rafId = requestAnimationFrame(loop);
      }
    },
    stop() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
    },
    scatter() {
      // Intro: fling particles outward before they regroup into the word
      particles.forEach((p) => {
        p.x = W / 2 + rand(-W * 0.7, W * 0.7);
        p.y = H / 2 + rand(-H * 0.7, H * 0.7);
      });
    },
    settle() {
      // Snap particles onto their targets (debug / instant preview)
      particles.forEach((p) => {
        if (p.state === 'text') { p.x = p.hx; p.y = p.hy; p.vx = 0; p.vy = 0; }
      });
      render();
    },
  };
})();
