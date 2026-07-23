/* ============================================================
   WEN YI CHOU — Portfolio 2026
   Router, loader sequence, wipe transitions, custom cursor,
   projects rail, work detail. GSAP-driven.
   ============================================================ */
(function () {
  const WORKS = window.WORKS || [];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(pointer: fine)').matches;

  gsap.registerPlugin(ScrollTrigger);
  gsap.defaults({ ease: 'power2.out', duration: 0.6 });

  const $ = (sel) => document.querySelector(sel);
  const views = {};
  document.querySelectorAll('.view').forEach((v) => { views[v.dataset.view] = v; });

  const nav = $('#nav');
  const backBtn = $('#backBtn');
  const wipe = $('#wipe');
  const cursor = $('#cursor');
  const cursorLabel = $('#cursorLabel');

  let currentView = null;
  let navFloatTween = null;

  const enc = (p) => encodeURI(p);
   const imgSrc = (item) => (typeof item === 'string' ? item : item.src);
   const imgDesc = (item) => (typeof item === 'string' ? '' : (item.desc || ''));


  /* ============================================================
     Custom cursor
     ============================================================ */
  if (finePointer && !reduceMotion) {
    document.body.classList.add('has-cursor');
    const xTo = gsap.quickTo(cursor, 'x', { duration: 0.18, ease: 'power3.out' });
    const yTo = gsap.quickTo(cursor, 'y', { duration: 0.18, ease: 'power3.out' });
    gsap.set(cursor, { xPercent: -50, yPercent: -50, x: -100, y: -100 });

    window.addEventListener('pointermove', (e) => {
      xTo(e.clientX);
      yTo(e.clientY);
    });

    document.addEventListener('pointerover', (e) => {
      const hot = e.target.closest('[data-cursor]');
      const link = e.target.closest('a, button');
      if (hot) {
        cursorLabel.textContent = hot.dataset.cursor || 'VIEW';
        gsap.to(cursor, { width: 64, height: 64, duration: 0.3 });
        gsap.to(cursorLabel, { opacity: 1, duration: 0.2, delay: 0.08 });
      } else if (link) {
        gsap.to(cursor, { width: 28, height: 28, duration: 0.3 });
        gsap.to(cursorLabel, { opacity: 0, duration: 0.15 });
      } else {
        gsap.to(cursor, { width: 12, height: 12, duration: 0.3 });
        gsap.to(cursorLabel, { opacity: 0, duration: 0.15 });
      }
    });
  }

  /* ============================================================
     Nav active state + float animation
     ============================================================ */
  function setNavActive(name) {
    if (navFloatTween) { navFloatTween.kill(); navFloatTween = null; }
    nav.querySelectorAll('a').forEach((a) => {
      a.classList.toggle('is-active', a.dataset.nav === name);
      gsap.set(a, { y: 0 });
    });
    const active = nav.querySelector(`a[data-nav="${name}"]`);
    if (active && !reduceMotion) {
      navFloatTween = gsap.to(active, {
        y: -3,
        duration: 1.3,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
      });
    }
  }

  /* ============================================================
     Projects rail — build cards
     ============================================================ */
  const railTrack = $('#railTrack');
  WORKS.forEach((w, i) => {
    const card = document.createElement('a');
    card.className = 'card';
    card.href = `#/work/${i}`;
    card.dataset.cursor = 'VIEW';
    card.innerHTML = `
      <div class="card-imgwrap">
        <img class="card-img" src="${enc(w.cover)}" alt="${w.title}" loading="lazy">
      </div>
      <div class="card-cap">
        <span class="card-cat">${w.categoryLabel}</span>
        <span class="card-name">${w.title}</span>
      </div>`;
    railTrack.appendChild(card);
  });

  // Card hover: subtle zoom on the image (delegated so it also covers the
  // cloned cards used for the infinite auto-scroll below)
  if (finePointer && !reduceMotion) {
    railTrack.addEventListener('pointerover', (e) => {
      const card = e.target.closest('.card');
      if (!card || card.contains(e.relatedTarget)) return;
      gsap.to(card.querySelector('.card-img'), { scale: 1.05, duration: 0.45, ease: 'power2.out' });
    });
    railTrack.addEventListener('pointerout', (e) => {
      const card = e.target.closest('.card');
      if (!card || card.contains(e.relatedTarget)) return;
      gsap.to(card.querySelector('.card-img'), { scale: 1, duration: 0.45, ease: 'power2.out' });
    });
  }

  // Duplicate the card set once so the rail can auto-scroll infinitely to
  // the left without ever showing a seam. Clones are decorative — hidden
  // from assistive tech and excluded from the entrance animation.
  let wrapWidth = 0;
  if (!reduceMotion) {
    Array.from(railTrack.children).forEach((c) => {
      const clone = c.cloneNode(true);
      clone.classList.add('card-clone');
      clone.setAttribute('aria-hidden', 'true');
      clone.tabIndex = -1;
      railTrack.appendChild(clone);
    });
  }

  function measureWrap() {
    const cards = railTrack.querySelectorAll('.card');
    if (cards.length < WORKS.length * 2) return;
    wrapWidth = cards[WORKS.length].offsetLeft - cards[0].offsetLeft;
  }
  if (!reduceMotion && 'ResizeObserver' in window) {
    new ResizeObserver(measureWrap).observe(railTrack);
  }

  function wrapRailScroll() {
    if (wrapWidth <= 0) return;
    if (rail.scrollLeft >= wrapWidth) rail.scrollLeft -= wrapWidth;
  }

  // Wheel → horizontal scroll; drag to scroll
  const rail = $('#rail');
  rail.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      pauseAutoScroll();
      rail.scrollLeft += e.deltaY;
      wrapRailScroll();
      resumeAutoScrollSoon();
    }
  }, { passive: false });

  let dragging = false, dragStartX = 0, dragScroll = 0, dragMoved = false;
  rail.addEventListener('pointerdown', (e) => {
    dragging = true;
    dragMoved = false;
    dragStartX = e.clientX;
    dragScroll = rail.scrollLeft;
    pauseAutoScroll();
  });
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - dragStartX;
    if (Math.abs(dx) > 5) dragMoved = true;
    rail.scrollLeft = dragScroll - dx;
    wrapRailScroll();
  });
  window.addEventListener('pointerup', () => {
    dragging = false;
    resumeAutoScrollSoon();
  });
  railTrack.addEventListener('click', (e) => {
    if (dragMoved) e.preventDefault();
  }, true);

  // Slow continuous auto-scroll (the rail drifts left on its own); pauses
  // on hover/drag and resumes shortly after the user lets go.
  const AUTO_SCROLL_SPEED = 40; // px per second
  let autoScrollPaused = false;
  let projectsActive = false;
  let resumeTimer = null;
  function pauseAutoScroll() {
    autoScrollPaused = true;
    clearTimeout(resumeTimer);
  }
  function resumeAutoScrollSoon(delay = 600) {
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => { autoScrollPaused = false; }, delay);
  }
  if (!reduceMotion) {
    // Pause only while the pointer is over an actual card (so the user can
    // aim and click) — not over the whole rail, which spans most of the
    // viewport and would leave the drift paused almost permanently.
    let cardHover = false;
    railTrack.addEventListener('pointerover', (e) => {
      cardHover = !!e.target.closest('.card');
    });
    railTrack.addEventListener('pointerout', (e) => {
      if (e.target.closest('.card') && !(e.relatedTarget && e.relatedTarget.closest('.card'))) {
        cardHover = false;
      }
    });
   rail.addEventListener('pointerleave', () => {
        cardHover = false;
      });

    // Drift position is accumulated in a float of our own: browsers round
    // scrollLeft to whole pixels on standard-DPI displays, so a
    // read-add-write of +0.37px per frame gets swallowed by rounding and
    // the rail never moves. dt comes from performance.now() because GSAP's
    // deltaRatio() lag smoothing flattens the delta after paint gaps.
    let lastTickTime = null;
    let autoPos = null;
    gsap.ticker.add(() => {
      const now = performance.now();
      if (lastTickTime === null) { lastTickTime = now; return; }
      const dt = Math.min(now - lastTickTime, 250) / 1000;
      lastTickTime = now;
      if (autoScrollPaused || cardHover || dragging || !projectsActive || wrapWidth <= 0) {
        autoPos = null; // resync with scrollLeft when the drift resumes
        return;
      }
      if (autoPos === null) autoPos = rail.scrollLeft;
      autoPos += AUTO_SCROLL_SPEED * dt;
      if (autoPos >= wrapWidth) autoPos -= wrapWidth;
      rail.scrollLeft = autoPos;
    });
  }

  // Cards fade in as they enter the horizontal viewport
  function initRailReveal() {
    if (reduceMotion) return;
    railTrack.querySelectorAll('.card:not(.card-clone)').forEach((card) => {
      if (card.dataset.revealed) return;
      card.dataset.revealed = '1';
      gsap.from(card, {
        autoAlpha: 0,
        y: 40,
        duration: 0.8,
        scrollTrigger: {
          trigger: card,
          scroller: rail,
          horizontal: true,
          start: 'left 95%',
        },
      });
    });
  }

  /* ============================================================
     Work detail
     ============================================================ */
  const workEls = {
    num: $('#workNum'),
    title: $('#workTitle'),
    desc: $('#workDesc'),
    meta: $('#workMeta'),
    img: $('#workImg'),
    imgWrap: $('#workImgWrap'),
    dots: $('#workImgDots'),
    thumbs: $('#workThumbs'),
  };

  function renderWork(index) {
    const w = WORKS[index];
    if (!w) return;
    let imgIndex = 0;

    workEls.num.textContent = String(index + 1).padStart(2, '0');
    workEls.title.textContent = w.title;

    const meta = [
      ['CATEGORY', w.categoryLabel],
      ['YEAR', w.year],
      ['MEDIUM', w.medium],
      ['SIZE', w.size],
    ].filter(([, v]) => v);
    workEls.meta.innerHTML = meta.map(([k, v]) => `
      <div class="meta-item">
        <p class="meta-label">${k}</p>
        <p class="meta-value">${v}</p>
      </div>`).join('');
     // Video link (only when the work has one)
let videoEl = document.getElementById('workVideo');
if (!videoEl) {
  videoEl = document.createElement('a');
  videoEl.id = 'workVideo';
  videoEl.className = 'work-video-link';
  videoEl.target = '_blank';
  videoEl.rel = 'noopener noreferrer';
  workEls.meta.insertAdjacentElement('afterend', videoEl);
}
if (w.videoUrl) {
  videoEl.href = w.videoUrl;
  videoEl.textContent = '▶ 觀看影片';
  videoEl.style.display = '';
} else {
  videoEl.style.display = 'none';
}

    function showImage(i) {
      imgIndex = i;
  const item = w.images[i];
  workEls.img.src = enc(imgSrc(item));
  workEls.img.alt = `${w.title} — ${i + 1}/${w.images.length}`;

  const desc = imgDesc(item) || w.longDesc || w.desc || '';
  workEls.desc.textContent = desc;
  workEls.desc.style.display = desc ? '' : 'none';

  workEls.dots.querySelectorAll('button').forEach((b, bi) => {
    b.classList.toggle('is-active', bi === i);
  });
  if (!reduceMotion) {
    gsap.fromTo(workEls.img, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4 });
    gsap.fromTo(workEls.desc, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4 });
      }
    }

    // Image dots (only when the work has multiple images)
    workEls.dots.innerHTML = '';
    if (w.images.length > 1) {
      w.images.forEach((_, i) => {
        const b = document.createElement('button');
        b.setAttribute('aria-label', `圖片 ${i + 1}`);
        b.addEventListener('click', () => showImage(i));
        workEls.dots.appendChild(b);
      });
      workEls.imgWrap.onclick = (e) => {
  const rect = workEls.imgWrap.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const isLeftHalf = clickX < rect.width / 2;
  if (isLeftHalf) {
    showImage((imgIndex - 1 + w.images.length) % w.images.length);
  } else {
    showImage((imgIndex + 1) % w.images.length);
  }
};
workEls.imgWrap.dataset.cursor = 'NEXT';
       workEls.imgWrap.onpointermove = (e) => {
    const rect = workEls.imgWrap.getBoundingClientRect();
    const isLeftHalf = (e.clientX - rect.left) < rect.width / 2;
  const label = isLeftHalf ? 'PREV' : 'NEXT';
  workEls.imgWrap.dataset.cursor = label;
  if (cursorLabel) cursorLabel.textContent = label;
  };
    } else {
      workEls.imgWrap.onclick = null;
      workEls.imgWrap.onpointermove = null;
      delete workEls.imgWrap.dataset.cursor;
    }
    showImage(0);

    // Other-works thumbnail strip
    workEls.thumbs.innerHTML = '';
    WORKS.forEach((ow, oi) => {
      const b = document.createElement('button');
      b.className = oi === index ? 'is-active' : '';
      b.setAttribute('aria-label', ow.title);
      b.innerHTML = `<img src="${enc(ow.cover)}" alt="" loading="lazy">`;
      b.addEventListener('click', () => { location.hash = `#/work/${oi}`; });
      workEls.thumbs.appendChild(b);
    });
    workEls.thumbs.querySelector('.is-active')?.scrollIntoView({ inline: 'center', block: 'nearest' });

    // Entrance animation
    if (!reduceMotion) {
      gsap.from(['.work-num', '.work-title', '.work-desc', '.work-meta .meta-item'], {
        autoAlpha: 0, y: 24, stagger: 0.06, duration: 0.7, clearProps: 'all',
      });
      gsap.from('.work-imgwrap', { autoAlpha: 0, y: 30, duration: 0.8, delay: 0.1, clearProps: 'all' });
    }
  }

  /* ============================================================
     About — floating decorative elements
     ============================================================ */
  const aboutFloatTweens = new Map();
  function addAboutFloat(el, i) {
    if (reduceMotion || aboutFloatTweens.has(el)) return;
    aboutFloatTweens.set(el, gsap.to(el, {
      y: (i % 2 === 0 ? -1 : 1) * gsap.utils.random(6, 10),
      rotation: gsap.utils.random(-3, 3),
      duration: gsap.utils.random(2.5, 4),
      delay: gsap.utils.random(0, 0.6),
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
    }));
  }
  function startAboutFloat() {
    if (reduceMotion) return;
    document.querySelectorAll('.about-float').forEach((el, i) => addAboutFloat(el, i));
  }
  function stopAboutFloat() {
    aboutFloatTweens.forEach((t) => t.kill());
    aboutFloatTweens.clear();
    gsap.set('.about-float', { clearProps: 'transform' });
  }
  function killFloatFor(el) {
    const t = aboutFloatTweens.get(el);
    if (t) { t.kill(); aboutFloatTweens.delete(el); }
  }

  /* ============================================================
     About — progressive reveal (click a decorative object to
     bounce its associated text into view)
     ============================================================ */
  const REVEAL_GROUPS = {
    tagline: {
      trigger: () => $('.about-flower'),
      items: () => document.querySelectorAll('.about-tagline .reveal-item'),
      hiddenPose: { y: -36, scale: 1 },
      animating: false,
    },
    software: {
      trigger: () => $('.about-star'),
      items: () => document.querySelectorAll('.about-software-body .reveal-item'),
      hiddenPose: { y: -16, scale: 0.3 },
      animating: false,
    },
    intro: {
      trigger: () => $('.about-badge'),
      items: () => document.querySelectorAll('.about-intro .reveal-item'),
      hiddenPose: { y: -36, scale: 1 },
      animating: false,
    },
    contact: {
      trigger: () => $('.about-envelope'),
      items: () => document.querySelectorAll('.about-contact-body .reveal-item'),
      hiddenPose: { y: -36, scale: 1 },
      animating: false,
    },
  };

  function resetAboutReveal() {
    document.querySelectorAll('.about-trigger').forEach((t) => {
      t.classList.remove('is-revealed');
      gsap.set(t, { scale: 1 });
    });
    Object.values(REVEAL_GROUPS).forEach((group) => {
      group.animating = false;
      const items = group.items();
      if (reduceMotion) {
        gsap.set(items, { autoAlpha: 1, y: 0, scale: 1 });
      } else {
        gsap.set(items, { autoAlpha: 0, ...group.hiddenPose });
      }
    });
  }

  function toggleGroup(name) {
    const group = REVEAL_GROUPS[name];
    const trigger = group && group.trigger();
    if (!trigger || group.animating) return;

    const items = group.items();
    const expanding = !trigger.classList.contains('is-revealed');
    const expandEase = name === 'software' ? 'back.out(2.2)' : 'bounce.out';
    const expandDuration = name === 'software' ? 0.55 : 0.7;

    if (reduceMotion) {
      trigger.classList.toggle('is-revealed', expanding);
      if (expanding) {
        gsap.set(items, { autoAlpha: 1, y: 0, scale: 1 });
      } else {
        gsap.set(items, { autoAlpha: 0, ...group.hiddenPose });
      }
      return;
    }

    group.animating = true;

    if (expanding) {
      trigger.classList.add('is-revealed');
      killFloatFor(trigger);
      gsap.to(trigger, { scale: 1, duration: 0.3, ease: 'power2.out' });
      gsap.to(items, {
        autoAlpha: 1, y: 0, scale: 1,
        duration: expandDuration, ease: expandEase, stagger: 0.12, overwrite: true,
        onComplete: () => { group.animating = false; },
      });
    } else {
      trigger.classList.remove('is-revealed');
      addAboutFloat(trigger, 0);
      gsap.to(items, {
        autoAlpha: 0, ...group.hiddenPose,
        duration: 0.4, ease: 'back.in(2.5)', stagger: 0.05, overwrite: true,
        onComplete: () => { group.animating = false; },
      });
    }
  }

  document.querySelectorAll('.about-trigger').forEach((trigger) => {
    const name = trigger.dataset.reveal;
    trigger.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleGroup(name); }
    });
    if (finePointer && !reduceMotion) {
      trigger.addEventListener('pointerover', () => {
        if (trigger.classList.contains('is-revealed')) return;
        gsap.to(trigger, { scale: 1.08, duration: 0.3, ease: 'power2.out', overwrite: 'auto' });
      });
      trigger.addEventListener('pointerout', () => {
        if (trigger.classList.contains('is-revealed')) return;
        gsap.to(trigger, { scale: 1, duration: 0.3, ease: 'power2.out', overwrite: 'auto' });
      });
    }
  });

  /* ============================================================
     About — shared drag mechanism for the polaroid + the four
     decorative objects. `handleEl` receives pointer events (and is
     what a click/tap toggles); `targetEl` is what actually gets
     translated — for flower/star/envelope that's the wrapper div
     that also holds their reveal text, so dragging the icon carries
     its text along for free, with zero separate sync logic. The
     badge's targetEl is itself, so intro/exp (which live elsewhere
     in the DOM) never move with it — the anchor behavior the spec
     asks for falls out naturally from not sharing a container.
     ============================================================ */
  const ABOUT_DRAG_THRESHOLD = 6;
  const aboutDraggables = [];

  function initAboutDrag(handleEl, targetEl, onTap) {
    if (!handleEl || !targetEl) return;
    const state = { x: 0, y: 0 };
    let dragging = false, moved = false, wasFloating = false;
    let startX = 0, startY = 0, baseX = 0, baseY = 0, restRect = null;

    handleEl.addEventListener('dragstart', (e) => e.preventDefault());

    handleEl.addEventListener('pointerdown', (e) => {
      dragging = true;
      moved = false;
      try { handleEl.setPointerCapture(e.pointerId); } catch (err) { /* no active pointer to capture */ }
      startX = e.clientX; startY = e.clientY;
      baseX = state.x; baseY = state.y;
      const r = targetEl.getBoundingClientRect();
      restRect = {
        left: r.left - state.x, right: r.right - state.x,
        top: r.top - state.y, bottom: r.bottom - state.y,
      };
      targetEl.classList.add('is-dragging');
      wasFloating = aboutFloatTweens.has(handleEl);
      if (wasFloating) killFloatFor(handleEl);
      if (!reduceMotion) gsap.to(handleEl, { scale: 1.06, duration: 0.2, ease: 'power2.out', overwrite: 'auto' });
    });

    handleEl.addEventListener('pointermove', (e) => {
      if (!dragging || !restRect) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > ABOUT_DRAG_THRESHOLD || Math.abs(dy) > ABOUT_DRAG_THRESHOLD) moved = true;
      const nx = baseX + dx;
      const ny = baseY + dy;
      const minX = -restRect.left;
      const maxX = window.innerWidth - restRect.right;
      const minY = -restRect.top;
      const maxY = window.innerHeight - restRect.bottom;
      state.x = Math.min(Math.max(nx, minX), maxX);
      state.y = Math.min(Math.max(ny, minY), maxY);
      gsap.set(targetEl, { x: state.x, y: state.y });
    });

    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      targetEl.classList.remove('is-dragging');
      if (reduceMotion) {
        gsap.set(handleEl, { scale: 1 });
      } else {
        gsap.to(handleEl, { scale: 1, duration: 0.5, ease: 'elastic.out(1, 0.5)', overwrite: 'auto' });
      }
      if (wasFloating && !handleEl.classList.contains('is-revealed')) addAboutFloat(handleEl, 0);
      if (!moved && onTap) onTap();
    };
    handleEl.addEventListener('pointerup', endDrag);
    handleEl.addEventListener('pointercancel', endDrag);

    aboutDraggables.push({
      reset() {
        state.x = 0; state.y = 0; dragging = false; moved = false;
        targetEl.classList.remove('is-dragging');
        gsap.set(targetEl, { x: 0, y: 0 });
        gsap.set(handleEl, { scale: 1 });
      },
    });
  }

  initAboutDrag($('.about-flower'), $('.about-tagline'), () => toggleGroup('tagline'));
  initAboutDrag($('.about-star'), $('.about-software'), () => toggleGroup('software'));
  initAboutDrag($('.about-badge'), $('.about-badge'), () => toggleGroup('intro'));
  initAboutDrag($('.about-envelope'), $('.about-contact'), () => toggleGroup('contact'));

  function resetAllAboutDrags() {
    aboutDraggables.forEach((d) => d.reset());
  }

  /* ============================================================
     View entrance animations
     ============================================================ */
  function animateViewIn(name) {
    if (reduceMotion) return;
    if (name === 'home') {
      window.Bow.scatter();
      gsap.from(['.home-eyebrow', '.home-title'], { autoAlpha: 0, y: 30, stagger: 0.1, clearProps: 'all' });
      gsap.from('.foot-item', { autoAlpha: 0, y: 20, stagger: 0.08, delay: 0.2, clearProps: 'all' });
    } else if (name === 'projects') {
      gsap.from(['.section-eyebrow', '.projects-title'], { autoAlpha: 0, y: 30, stagger: 0.1, clearProps: 'all' });
      const cards = railTrack.querySelectorAll('.card:not(.card-clone)');
      gsap.from(cards, {
        autoAlpha: 0, y: 50, stagger: 0.06, duration: 0.8, delay: 0.15,
        onComplete: () => {
          cards.forEach((c) => { c.dataset.revealed = '1'; });
          initRailReveal();
        },
      });
    } else if (name === 'about') {
      gsap.from('.about-anim', { autoAlpha: 0, y: 28, stagger: 0.09, duration: 0.7, clearProps: 'all' });
    } else if (name === 'contact') {
      gsap.from(`.view-${name} .placeholder > *`, { autoAlpha: 0, y: 24, stagger: 0.1, clearProps: 'all' });
    }
  }

  /* ============================================================
     Router with wipe transition
     ============================================================ */
  function parseHash() {
    const h = location.hash.replace(/^#\/?/, '');
    if (h.startsWith('work/')) {
      const idx = parseInt(h.slice(5), 10);
      return { name: 'work', index: Number.isNaN(idx) ? 0 : idx };
    }
    return { name: ['projects', 'about', 'contact'].includes(h) ? h : 'home' };
  }

  function showView(route) {
    Object.values(views).forEach((v) => v.classList.remove('is-active'));
    views[route.name].classList.add('is-active');
    window.scrollTo(0, 0);

    const navName = route.name === 'work' ? 'projects' : route.name;
    setNavActive(navName);

    const showBack = route.name !== 'home';
    gsap.to(backBtn, {
      autoAlpha: showBack ? 1 : 0,
      duration: 0.3,
      onStart: () => { if (showBack) backBtn.style.visibility = 'visible'; },
    });

    if (route.name === 'home') window.Bow.start();
    else window.Bow.stop();

    if (route.name === 'about') {
      resetAboutReveal();
      resetAllAboutDrags();
      startAboutFloat();
    } else {
      stopAboutFloat();
    }

    projectsActive = route.name === 'projects';
    if (projectsActive) requestAnimationFrame(measureWrap);

    if (route.name === 'work') renderWork(route.index);
    animateViewIn(route.name);
    ScrollTrigger.refresh();
  }

  let transitioning = false;
  function navigate(route) {
    const sameName = currentView && currentView.name === route.name;
    const sameWork = sameName && route.name === 'work' && currentView.index === route.index;
    if (sameWork || (sameName && route.name !== 'work')) return;

    // Work → work: crossfade only, no wipe
    if (sameName && route.name === 'work') {
      currentView = route;
      renderWork(route.index);
      return;
    }

    if (!currentView || reduceMotion) {
      currentView = route;
      showView(route);
      return;
    }

    if (transitioning) return;
    transitioning = true;
    currentView = route;

    const tl = gsap.timeline({ onComplete: () => { transitioning = false; } });
    tl.set(wipe, { transformOrigin: '50% 100%' })
      .to(wipe, { scaleY: 1, duration: 0.45, ease: 'power3.inOut' })
      .add(() => showView(route))
      .set(wipe, { transformOrigin: '50% 0%' })
      .to(wipe, { scaleY: 0, duration: 0.45, ease: 'power3.inOut' }, '+=0.05');
  }

  window.addEventListener('hashchange', () => navigate(parseHash()));

  backBtn.addEventListener('click', () => {
    const route = parseHash();
    location.hash = route.name === 'work' ? '#/projects' : '#/';
  });

  /* ============================================================
     Loader sequence
     ============================================================ */
  function runLoader() {
    const loader = $('#loader');
    const nameEl = loader.querySelector('.loader-name');
    const countEl = $('#loaderCount');
    'WEN YI CHOU'.split('').forEach((ch) => {
      const s = document.createElement('span');
      if (ch === ' ') s.className = 'sp';
      else s.textContent = ch;
      nameEl.appendChild(s);
    });

    const route = parseHash();
    currentView = route;

    if (reduceMotion) {
      loader.remove();
      showView(route);
      return;
    }

    const count = { v: 0 };
    const tl = gsap.timeline();
    tl.to(nameEl.querySelectorAll('span'), {
      y: 0, duration: 0.7, stagger: 0.045, ease: 'power3.out',
    })
      .to(count, {
        v: 100,
        duration: 1.1,
        ease: 'power1.inOut',
        onUpdate: () => { countEl.textContent = Math.round(count.v); },
      }, 0)
      .to(nameEl.querySelectorAll('span'), {
        y: '-110%', duration: 0.55, stagger: 0.03, ease: 'power3.in',
      }, '+=0.25')
      .to(loader, { autoAlpha: 0, duration: 0.5, ease: 'power2.inOut' }, '-=0.2')
      .add(() => {
        loader.remove();
        showView(route);
        gsap.from(nav.querySelectorAll('a'), {
          autoAlpha: 0, x: 20, stagger: 0.07, duration: 0.6, clearProps: 'opacity,visibility,transform',
          onComplete: () => setNavActive(route.name === 'work' ? 'projects' : route.name),
        });
      });
  }

  runLoader();
})();
