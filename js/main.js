/* =========================================================================
   ZEN DIVE Manila — interaction layer
   Lenis smooth-scroll ⇄ GSAP ScrollTrigger, one master "depth" that drives the
   WebGL water, the colour grade and the depth meter — the whole page is one dive.
   ========================================================================= */
(() => {
  'use strict';

  const root = document.documentElement;
  root.classList.add('js');

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(pointer: fine)').matches;
  const hasGSAP = !!(window.gsap && window.ScrollTrigger);
  const gsap = window.gsap;

  // Skip the full-screen WebGL shader on phones / low-end devices — the CSS
  // --abyss + .grade gradient is a clean fallback, and the shader would cook
  // battery and thermally throttle Lenis/ScrollTrigger.
  const lowEnd = matchMedia('(pointer: coarse)').matches
    || (navigator.deviceMemory && navigator.deviceMemory <= 4)
    || ((navigator.hardwareConcurrency || 8) <= 4);

  const $  = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  // the preloader gate decodes the hero poster (the video streams in afterwards)
  const HERO_SRC = 'assets/video/hero-montage.jpg';

  // brighter, living teal even at the "deep" end — the user is thalassophobic,
  // so the water must never read as a dark abyss
  const PALETTE = { surface: '#8ff0e6', deep: '#0a4f8f', light: '#eafffb' };

  /* If GSAP failed to load, degrade gracefully: reveal everything, keep basics. */
  if (!hasGSAP) root.classList.remove('js');

  let booted = false;
  function boot() {
    if (booted) return; booted = true;
    try {
      const yearEl = $('#year'); if (yearEl) yearEl.textContent = new Date().getFullYear();

      // apply saved language BEFORE splitting, so reveals/animation run on the active copy
      collectI18n();
      curLang = storedLang();
      applyLang(curLang);
      setLangAttrs(curLang);

      splitLines();
      // GSAP owns the hidden state of every masked char (avoids the CSS-%→px matrix trap)
      if (hasGSAP && !reduced) gsap.set('.lines .ch', { yPercent: 120, rotate: 3 });
      initCursor();
      initNav();
      initScramble();
      initForm();
      initHold();
      initVideos();

      if (!reduced && !lowEnd) { initOcean(); root.classList.add('has-ocean'); }

      if (hasGSAP && !reduced) {
        gsap.registerPlugin(window.ScrollTrigger);
        initLenis();
        initReveals();
        initParallax();
        initDepthEngine();
        initCrossing();
        initMarquee();
        initFlow();
      } else {
        // reduced / no-lib: static depth so the grade + meter still read nicely
        setDepthVars(0.28);
        const dm = $('#depthmeter'); if (dm) dm.classList.remove('is-on');
      }
    } catch (err) {
      console.error('[ZEN DIVE] init error:', err);
    } finally {
      // ALWAYS lift the preloader — a thrown init above must never trap the
      // page behind the opaque overlay (a CSS keyframe is the final failsafe).
      initPreloader();
      window.__ZEN = { get lenis() { return lenis; }, get ocean() { return ocean; }, reduced, hasGSAP, lowEnd };
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
  if (document.readyState !== 'loading') boot();

  /* =====================================================================
     PRELOADER — dive-computer boot, hands off into the first "sink"
     ===================================================================== */
  function initPreloader() {
    const pre = $('#preloader');
    if (!pre) { revealHero(); return; }
    if (reduced) { pre.style.display = 'none'; revealHero(); return; }

    const depthEl = $('#preDepth');
    const barEl = $('#preBar');
    const target = 18.0;
    const state = { v: 0 };

    const paint = () => {
      if (depthEl) depthEl.textContent = (state.v * target).toFixed(1);
      if (barEl) barEl.style.width = (state.v * 100) + '%';
    };

    if (hasGSAP) {
      gsap.to(state, { v: 1, duration: 1.7, ease: 'power2.inOut', onUpdate: paint });
    } else {
      const t0 = performance.now();
      const tick = (t) => { state.v = clamp((t - t0) / 1700); paint(); if (state.v < 1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }

    const decode = new Promise((res) => {
      const img = new Image();
      img.onload = () => (img.decode ? img.decode().then(res, res) : res());
      img.onerror = res;
      img.src = HERO_SRC;
    });
    const fonts = document.fonts ? document.fonts.ready.catch(() => {}) : Promise.resolve();

    // never let a slow CDN image hold the gate: cap asset wait, keep a min "descent" time
    const assets = Promise.all([decode, fonts]);
    Promise.all([Promise.race([assets, wait(2600)]), wait(1650)]).then(exit);

    let exited = false;
    function exit() {
      if (exited) return; exited = true;
      state.v = 1; paint();
      revealHero();
      const dm = $('#depthmeter'); if (dm) dm.classList.add('is-on');

      if (hasGSAP) {
        const tl = gsap.timeline({ onComplete: () => {
          pre.style.display = 'none';
          if (window.ScrollTrigger) window.ScrollTrigger.refresh();
        }});
        tl.to('#preloader .preloader__hint', { opacity: 0, y: -8, duration: .5, ease: 'power2.in' })
          .to('#preloader .preloader__inner', { y: -30, opacity: 0, duration: .9, ease: 'power2.inOut' }, '-=.2')
          .to(pre, { clipPath: 'inset(0 0 100% 0)', duration: 1.15, ease: 'power3.inOut' }, '-=.6');
      } else {
        pre.style.transition = 'opacity .8s ease';
        pre.style.opacity = '0';
        setTimeout(() => { pre.style.display = 'none'; }, 850);
      }
    }
  }

  function revealHero() {
    if (!hasGSAP || reduced) return;
    const tl = gsap.timeline({ delay: .15 });
    // the Japanese headline leads; the English kicker rides in alongside it, so
    // the first thing on screen is never a lone line of English
    tl.fromTo('#hero .hero__title .ch', { yPercent: 120, rotate: 3 },
        { yPercent: 0, rotate: 0, duration: 1.25, ease: 'expo.out', stagger: { each: .026, from: 'start' } })
      .to('#hero .kicker', { opacity: 1, y: 0, duration: .9, ease: 'power3.out' }, '-=1.05')
      .to('#hero .hero__lead', { opacity: 1, y: 0, duration: 1, ease: 'power3.out' }, '-=.8')
      .to('#hero .hero__actions', { opacity: 1, y: 0, duration: 1, ease: 'power3.out' }, '-=.8')
      .fromTo('#hero .hero__media img', { scale: 1.16 }, { scale: 1, duration: 2.4, ease: 'power2.out' }, 0)
      .fromTo(['.hero__scroll', '.hero__meta'], { opacity: 0 }, { opacity: 1, duration: 1.2 }, '-=.6');
  }

  /* =====================================================================
     LENIS smooth scroll ⇄ GSAP
     ===================================================================== */
  let lenis = null;
  function initLenis() {
    if (typeof Lenis === 'undefined') return;
    lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 1.0, smoothWheel: true, touchMultiplier: 1.4 });
    lenis.on('scroll', window.ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  // Anchor navigation — bound unconditionally (in initNav) so the mobile menu
  // always closes and scroll works even without Lenis (reduced-motion / CDN fail).
  function initAnchors() {
    $$('a[href^="#"]').forEach((a) => {
      a.addEventListener('click', (e) => {
        const id = a.getAttribute('href');
        if (id.length < 2) return;
        const el = $(id);
        if (!el) return;
        closeMenu();
        if (lenis) {
          e.preventDefault();
          lenis.scrollTo(el, { offset: 0, duration: 1.4, easing: (x) => 1 - Math.pow(1 - x, 4) });
        } // else: let the browser do a native anchor jump
      });
    });
  }

  /* =====================================================================
     LINE SPLIT — JP-safe: split on authored <br>, wrap for masked reveal
     ===================================================================== */
  // Wrap a heading fragment into per-character spans for the buoyant reveal.
  // JP-safe: Latin runs stay whole words (never break mid-word), CJK splits per
  // glyph, and kinsoku glue (。、small kana …) sticks to the previous glyph so a
  // char-span never starts a line with punctuation. Inline elements (.glow) are
  // preserved and their text is split in place.
  const LATIN = /[0-9A-Za-z'’.,&%@—–\-/]/;
  const GLUE  = /[。、，．！!？?：；」』）\)】》〉』ぁぃぅぇぉっゃゅょゎ・…‥ー]/;
  function wrapChars(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const walk = (node) => {
      Array.from(node.childNodes).forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          let buf = '', last = null;
          const flush = () => {
            if (!buf) return;
            const s = document.createElement('span');
            s.className = 'ch'; s.textContent = buf;
            frag.appendChild(s); last = s; buf = '';
          };
          for (const ch of n.nodeValue) {
            if (ch === ' ') { flush(); frag.appendChild(document.createTextNode(' ')); last = null; continue; }
            if (LATIN.test(ch)) { buf += ch; continue; }
            if (GLUE.test(ch) && (buf || last)) { if (buf) buf += ch; else last.textContent += ch; continue; }
            flush();
            const s = document.createElement('span');
            s.className = 'ch'; s.textContent = ch;
            frag.appendChild(s); last = s;
          }
          flush();
          n.replaceWith(frag);
        } else if (n.nodeType === 1) {
          walk(n);
        }
      });
    };
    walk(tmp);
    return tmp.innerHTML;
  }
  function splitOne(el) {
    const segs = el.innerHTML.split(/<br\s*\/?>/i);
    el.innerHTML = segs
      .map((s) => `<span class="line"><span class="line-inner">${wrapChars(s.trim())}</span></span>`)
      .join('');
  }
  function splitLines() { $$('.lines').forEach(splitOne); }
  const CHARS = (scope) => (scope || document).querySelectorAll('.ch');

  /* =====================================================================
     i18n — JP ⇄ EN. Translations keyed by JP source (window.ZEN_I18N).
     Body copy swaps at the text-node level (mixed markup like "01…" or "→"
     is preserved); display headings swap innerHTML and re-split.
     ===================================================================== */
  const I18N = { map: {}, headings: [], nodes: [] };
  const normI = (s) => (s || '').replace(/\s+/g, '');
  let curLang = 'ja';

  function collectI18n() {
    (window.ZEN_I18N || []).forEach((t) => { I18N.map[normI(t.jp)] = t; });
    $$('.lines').forEach((el) => {
      const t = I18N.map[normI(el.textContent)];
      if (t) I18N.headings.push({ el, jpHtml: el.innerHTML, t });
    });
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const p = n.parentElement;
        if (!p || p.closest('.lines, script, style, noscript, .preloader')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let n;
    while ((n = tw.nextNode())) {
      const t = I18N.map[normI(n.nodeValue)];
      if (t) I18N.nodes.push({ node: n, jp: n.nodeValue, en: t.en });
    }
  }
  function headingHtml(t) {
    let h = t.en;
    if (t.glowEn) h = h.replace(t.glowEn, `<span class="glow">${t.glowEn}</span>`);
    return h;
  }
  function applyLang(lang) {
    const en = lang === 'en';
    I18N.nodes.forEach((o) => { o.node.nodeValue = en ? o.en : o.jp; });
    I18N.headings.forEach((o) => { o.el.innerHTML = en ? headingHtml(o.t) : o.jpHtml; });
  }
  function setLangAttrs(lang) {
    root.lang = lang === 'en' ? 'en' : 'ja';
    root.setAttribute('data-lang', lang);
  }
  function storedLang() {
    try { return localStorage.getItem('zen-lang') === 'en' ? 'en' : 'ja'; } catch (e) { return 'ja'; }
  }
  function switchLang(lang) {
    if (lang === curLang) return;
    curLang = lang;
    applyLang(lang);
    setLangAttrs(lang);
    I18N.headings.forEach((o) => {
      splitOne(o.el);
      if (hasGSAP && !reduced) gsap.set(o.el.querySelectorAll('.ch'), { yPercent: 0, rotate: 0, opacity: 1, clearProps: 'transform' });
    });
    try { localStorage.setItem('zen-lang', lang); } catch (e) {}
    if (window.ScrollTrigger) window.ScrollTrigger.refresh();
  }

  /* =====================================================================
     REVEALS — headlines rise from a mask, copy settles like sediment,
     images unveil via clip-path
     ===================================================================== */
  function initReveals() {
    const ST = window.ScrollTrigger;

    // headline char masks (except hero — handled on load): each glyph rises with
    // a touch of rotation, like it's finding its buoyancy. Deeper sections settle
    // a hair slower (S8 tempo), reinforcing the descent.
    $$('.lines').forEach((el) => {
      if (el.closest('#hero')) return;
      const chars = el.querySelectorAll('.ch');
      const depth = parseFloat((el.closest('.section') || {}).getAttribute?.('data-depth')) || 0;
      const dur = 1.05 + depth * 0.9;
      gsap.set(chars, { yPercent: 120, rotate: 3 });
      ST.create({
        trigger: el, start: 'top 82%', once: true,
        onEnter: () => gsap.to(chars,
          { yPercent: 0, rotate: 0, duration: dur, ease: 'expo.out', stagger: { each: .024, from: 'start' } }),
      });
    });

    // generic fades
    $$('[data-reveal="fade"]').forEach((el) => {
      if (el.closest('#hero')) return;
      gsap.set(el, { opacity: 0, y: 26 });
      ST.create({
        trigger: el, start: 'top 88%', once: true,
        onEnter: () => gsap.to(el, { opacity: 1, y: 0, duration: 1.1, ease: 'power3.out' }),
      });
    });

    // offer cards — staggered buoyant rise
    $$('.offer').forEach((el) => gsap.set(el, { opacity: 0, y: 44 }));
    ST.batch('.offer', {
      start: 'top 85%',
      onEnter: (els) => gsap.to(els, { opacity: 1, y: 0, duration: 1.1, ease: 'power3.out', stagger: .1 }),
      once: true,
    });

    // image / video clip reveals
    $$('[data-clip]').forEach((fig) => {
      const media = fig.querySelector('img, video');
      if (!media) return;
      gsap.set(media, { scale: 1.24, clipPath: 'inset(0 0 100% 0)' });
      ST.create({
        trigger: fig, start: 'top 84%', once: true,
        onEnter: () => gsap.to(media, { scale: 1, clipPath: 'inset(0 0 0% 0)', duration: 1.5, ease: 'power3.out' }),
      });
    });
  }

  /* =====================================================================
     PARALLAX — depth layers drift at different speeds
     ===================================================================== */
  function initParallax() {
    $$('[data-parallax]').forEach((el) => {
      const speed = parseFloat(el.getAttribute('data-parallax')) || 0.1;
      const mover = el.matches('.hero__media, .descent__media') ? el.querySelector('img, video') : el;
      if (!mover) return;
      gsap.to(mover, {
        yPercent: speed * 100,
        ease: 'none',
        scrollTrigger: {
          trigger: el.closest('.section') || el,
          start: 'top bottom', end: 'bottom top', scrub: true,
        },
      });
    });
  }

  /* =====================================================================
     S1 — THRESHOLD CROSSING. Fire the ocean's water-breach sweep once, as the
     first section after the hero arrives — the surface passing overhead as the
     page leaves the opening and goes under.
     One-shot; the shader envelope fades the band at both ends → resets clean.
     ===================================================================== */
  function initCrossing() {
    const sec = $('#gear');
    if (!sec || !ocean || !ocean.setCross) return;
    const proxy = { v: 0 };
    window.ScrollTrigger.create({
      trigger: sec, start: 'top 42%', once: true,
      onEnter: () => gsap.fromTo(proxy, { v: 0 }, {
        v: 1, duration: 1.35, ease: 'power2.inOut',
        onUpdate: () => ocean.setCross(proxy.v),
        onComplete: () => ocean.setCross(0),
      }),
    });
  }

  /* =====================================================================
     DEPTH ENGINE — one value from scroll position drives water + grade + meter
     Interpolates each section's authored data-depth by scroll.
     ===================================================================== */
  let ocean = null;
  function initOcean() {
    const canvas = $('#ocean');
    if (!canvas || typeof Ocean === 'undefined') return;
    ocean = Ocean.mount(canvas, { colors: PALETTE });
  }

  let lastDepthQ = -1, lastRead = '';
  const depthReadEl = () => document.getElementById('depthRead');
  function setDepthVars(d) {
    const graded = clamp(d * 0.6);
    const q = Math.round(graded * 100) / 100;               // quantise → skip redundant repaints
    if (q !== lastDepthQ) {
      root.style.setProperty('--depth', q.toFixed(2));
      if (ocean) ocean.setDepth(graded);
      // S8 tempo gradient is applied directly where it reads best — each heading's
      // reveal duration scales with its section depth in initReveals (deeper =
      // slower). --flow (scroll velocity) is the live ambient driver below.
      lastDepthQ = q;
    }
  }

  /* The gauge is deliberately NOT driven by data-depth: those values rise again
     past the silence so the water can return to the light, and a depth reading
     that climbs while you keep scrolling down reads as broken. The gauge tracks
     scroll position instead — one continuous descent, 0m to 40m (the authored
     tick range), never going back up. */
  const METER_MAX = 40;
  function setMeter(p) {
    root.style.setProperty('--dive', p.toFixed(3));
    const meters = (p * METER_MAX).toFixed(1);
    if (meters !== lastRead) { const el = depthReadEl(); if (el) el.textContent = meters; lastRead = meters; }
  }
  function scrollProgress() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    return max > 0 ? clamp(window.scrollY / max) : 0;
  }

  function initDepthEngine() {
    const secs = $$('.section[data-depth]').map((el) => ({ el, depth: parseFloat(el.getAttribute('data-depth')) }));
    if (!secs.length) return;

    // Cache absolute section centres — they change only on layout/resize/pin,
    // NOT on scroll. Recompute on ScrollTrigger 'refresh' (fires after the
    // pin spacer settles and with pins reverted, so rects are natural).
    let centers = [];
    function measure() {
      const sy = window.scrollY;
      centers = secs.map((s) => {
        const r = s.el.getBoundingClientRect();
        return r.top + sy + r.height * 0.5;
      });
    }
    measure();
    window.ScrollTrigger.addEventListener('refresh', measure);
    window.addEventListener('resize', measure);

    let current = secs[0].depth;
    function targetDepth() {
      const vp = window.scrollY + window.innerHeight * 0.5;
      if (vp <= centers[0]) return secs[0].depth;
      if (vp >= centers[centers.length - 1]) return secs[secs.length - 1].depth;
      for (let i = 0; i < centers.length - 1; i++) {
        if (vp >= centers[i] && vp <= centers[i + 1]) {
          const span = centers[i + 1] - centers[i] || 1;
          return lerp(secs[i].depth, secs[i + 1].depth, (vp - centers[i]) / span);
        }
      }
      return current;
    }

    let meter = scrollProgress();
    gsap.ticker.add(() => {
      const mt = scrollProgress();
      if (Math.abs(mt - meter) >= 0.0002) {
        meter += (mt - meter) * 0.08;
        setMeter(meter);
      }
      const target = targetDepth();
      if (Math.abs(target - current) < 0.0004) return;      // idle → stop writing
      current += (target - current) * 0.06;
      setDepthVars(current);
    });
    setDepthVars(current);
    setMeter(meter);
  }

  /* =====================================================================
     CUSTOM CURSOR + MAGNETIC — desktop only
     ===================================================================== */
  function initCursor() {
    const cur = $('#cursor');
    if (!cur || !finePointer || reduced) { if (cur) cur.remove(); return; }
    root.classList.add('has-cursor');

    let x = innerWidth / 2, y = innerHeight / 2, tx = x, ty = y;
    const loop = () => { x = lerp(x, tx, 0.2); y = lerp(y, ty, 0.2); cur.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%)`; requestAnimationFrame(loop); };
    requestAnimationFrame(loop);

    // S2 — trail ripples into the background water as the pointer moves
    window.addEventListener('mousemove', (e) => {
      tx = e.clientX; ty = e.clientY;
      cur.style.opacity = '1';
      // the light source drifts with the pointer; the water is not disturbed by it
      if (ocean) ocean.setPointer(e.clientX / innerWidth, 1 - e.clientY / innerHeight);
    }, { passive: true });
    window.addEventListener('mouseleave', () => (cur.style.opacity = '0'));
    window.addEventListener('mousedown', () => cur.classList.add('is-down'));
    window.addEventListener('mouseup', () => cur.classList.remove('is-down'));

    const hoverSel = 'a, button, [data-cursor], [data-magnetic], .offer, input, select';
    $$(hoverSel).forEach((el) => {
      const type = el.getAttribute('data-cursor');
      el.addEventListener('mouseenter', () => {
        cur.classList.add('is-hover');
        if (type === 'drag') cur.classList.add('is-drag');
        if (type === 'explore') cur.classList.add('is-explore');
      });
      el.addEventListener('mouseleave', () => cur.classList.remove('is-hover', 'is-drag', 'is-explore'));
    });

    // magnetic pull
    $$('[data-magnetic]').forEach((el) => {
      const strength = 0.4;
      el.addEventListener('mousemove', (e) => {
        const r = el.getBoundingClientRect();
        const mx = e.clientX - (r.left + r.width / 2);
        const my = e.clientY - (r.top + r.height / 2);
        el.style.transform = `translate(${mx * strength}px, ${my * strength}px)`;
      });
      el.addEventListener('mouseleave', () => { el.style.transform = ''; });
    });
  }

  /* =====================================================================
     BACKGROUND VIDEO — lazy, viewport-gated, honours reduced-motion / save-data.
     Markup: <video data-bg data-src="…" poster="…" muted loop playsinline>.
     Only fetches + plays while near the viewport; poster is the fallback frame.
     ===================================================================== */
  function initVideos() {
    const vids = $$('video[data-bg]');
    if (!vids.length) return;
    const saveData = navigator.connection && navigator.connection.saveData;
    // reduced-motion or data-saver → never load the clip; the poster stays
    if (reduced || saveData) return;

    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        const v = e.target;
        if (e.isIntersecting) {
          if (!v.getAttribute('src') && v.dataset.src) v.setAttribute('src', v.dataset.src);
          const p = v.play();
          if (p && p.catch) p.catch(() => {});
        } else {
          v.pause();
        }
      });
    }, { rootMargin: '250px 0px', threshold: 0.01 });

    vids.forEach((v) => {
      v.muted = true; v.loop = true; v.playsInline = true;
      v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
      io.observe(v);
    });
  }

  /* =====================================================================
     NAV — condense on scroll, hide on scroll-down, mobile menu
     ===================================================================== */
  let menuOpen = false;
  function closeMenu() {
    if (window.ZEN_MENU && window.ZEN_MENU.isOpen()) window.ZEN_MENU.close();
    if (!menuOpen) return;
    menuOpen = false;
    $('#nav')?.classList.remove('is-open');
    $('.nav__links')?.classList.remove('is-open');
    $('#burger')?.setAttribute('aria-expanded', 'false');
    lenis?.start();
  }
  function initNav() {
    const nav = $('#nav');
    const burger = $('#burger');
    const links = $('.nav__links');
    initAnchors();
    if (!nav) return;

    let last = 0;
    const onScroll = () => {
      const y = window.scrollY;
      nav.classList.toggle('is-scrolled', y > 40);
      if (y > last && y > 600 && !menuOpen) nav.classList.add('is-hidden');
      else nav.classList.remove('is-hidden');
      last = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // never hide the nav while a link inside it has keyboard focus
    nav.addEventListener('focusin', () => nav.classList.remove('is-hidden'));

    $$('.nav__lang').forEach((btn) => {
      btn.addEventListener('click', () => switchLang(curLang === 'en' ? 'ja' : 'en'));
    });

    burger?.addEventListener('click', () => {
      // S7: hand off to the immersive full-screen menu when it's mounted;
      // fall back to the plain drawer if menu.js failed to load.
      if (window.ZEN_MENU) { window.ZEN_MENU.toggle(); return; }
      menuOpen = !menuOpen;
      nav.classList.toggle('is-open', menuOpen);
      links?.classList.toggle('is-open', menuOpen);
      burger.setAttribute('aria-expanded', String(menuOpen));
      if (menuOpen) lenis?.stop(); else lenis?.start();
    });

    // leaving mobile width must never leave the menu open + scroll locked
    const mq = matchMedia('(max-width: 1024px)');
    (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))((e) => {
      if (!e.matches) closeMenu();
    });
  }

  /* =====================================================================
     FORM — front-end only (no backend wired); honest success state
     ===================================================================== */
  function initForm() {
    const form = $('#bookForm');
    const note = $('#formNote');
    if (!form) return;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = $('#fName').value.trim();
      const mail = $('#fMail').value.trim();
      const plan = $('#fPlan').value;
      const okMail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail);
      note.classList.remove('is-ok', 'is-err');
      if (!name || !okMail || !plan) {
        note.textContent = 'お名前・メールアドレス・プランをご確認ください。';
        note.classList.add('is-err');
        return;
      }
      note.textContent = `${name} さん、受け付けました。折り返し、日本語でご連絡します。`;
      note.classList.add('is-ok');
      form.reset();
    });
  }

  /* =====================================================================
     S4 — HOLD TO DIVE. Press-and-hold "charges" a button: water rises inside
     it and a ring fills, like drawing a breath before you sink. Purely a
     feedback layer — the native click/submit is untouched, so it never blocks
     the booking path (release fires the real action, as any button does).
     ===================================================================== */
  function initHold() {
    if (reduced) return;
    $$('[data-hold]').forEach((el) => {
      el.classList.add('has-hold');
      const fill = document.createElement('span'); fill.className = 'hold-fill'; el.appendChild(fill);
      const ring = document.createElement('span'); ring.className = 'hold-ring';
      ring.innerHTML = '<svg viewBox="0 0 40 40" aria-hidden="true"><circle class="hr-t" cx="20" cy="20" r="18"></circle><circle class="hr-p" cx="20" cy="20" r="18"></circle></svg>';
      el.appendChild(ring);
      const p = ring.querySelector('.hr-p');
      const C = 2 * Math.PI * 18;
      p.style.strokeDasharray = C; p.style.strokeDashoffset = C;
      let raf = 0, prog = 0, holding = false;
      const HOLD = 700;
      const frame = () => {
        raf = requestAnimationFrame(frame);
        prog = clamp(prog + (holding ? 16 / HOLD : -0.07), 0, 1);
        p.style.strokeDashoffset = (C * (1 - prog)).toFixed(1);
        el.style.setProperty('--fill', prog.toFixed(3));
        el.classList.toggle('is-charged', prog >= 1);
        if (prog <= 0 && !holding) { cancelAnimationFrame(raf); raf = 0; }
      };
      const start = () => { holding = true; el.classList.add('is-holding'); if (!raf) raf = requestAnimationFrame(frame); };
      const stop = () => { holding = false; el.classList.remove('is-holding'); if (!raf) raf = requestAnimationFrame(frame); };
      el.addEventListener('pointerdown', start);
      el.addEventListener('pointerup', stop);
      el.addEventListener('pointerleave', stop);
      el.addEventListener('pointercancel', stop);
    });
  }

  /* =====================================================================
     S3 — NAV GLYPH SCRAMBLE (desktop). Mutates the link's text NODE, not
     textContent, so the i18n node references survive. A per-link guard keeps
     the pristine value intact between runs.
     ===================================================================== */
  function initScramble() {
    if (reduced || !finePointer) return;
    const GLYPHS = 'アイウエオカキクケコサシスセソタチツテトナニヌ0123456789∴·—＋ZEN禅';

    // The header hides on scroll-down and slides back on scroll-up. When it
    // returns under a cursor that never moved, the browser fires mouseenter and
    // the scramble runs — Japanese labels flick through Latin glyphs and read as
    // the page changing language. Only scramble when the pointer actually moved.
    let lastMove = 0;
    window.addEventListener('mousemove', () => { lastMove = performance.now(); }, { passive: true });
    const moved = () => performance.now() - lastMove < 300;
    $$('.nav__links a').forEach((a) => {
      const tn = Array.from(a.childNodes).find((n) => n.nodeType === 3);
      if (!tn) return;
      let timer = 0, busy = false;
      const run = () => {
        if (busy) return;
        busy = true;
        const target = tn.nodeValue;
        const arr = Array.from(target);
        let frame = 0;
        const total = Math.max(7, arr.length * 3);
        clearInterval(timer);
        timer = setInterval(() => {
          frame++;
          const done = Math.floor((frame / total) * arr.length);
          tn.nodeValue = arr.map((c, i) => (i < done || c === ' ') ? c : GLYPHS[(Math.random() * GLYPHS.length) | 0]).join('');
          if (frame >= total) { clearInterval(timer); tn.nodeValue = target; busy = false; }
        }, 34);
      };
      a.addEventListener('mouseenter', () => { if (moved()) run(); });
      a.addEventListener('focus', run);      // keyboard focus is always intent
    });
  }

  /* =====================================================================
     S3/S8 — VELOCITY-REACTIVE MARQUEE. Takes over from the CSS keyframe so it
     can drift at a base speed and then accelerate + skew with scroll velocity
     (the drag of water). Populated here; actually driven by the flow ticker.
     ===================================================================== */
  let marqRows = [];
  function initMarquee() {
    marqRows = $$('.marquee__row').map((row) => {
      row.style.animation = 'none';
      const st = { row, dir: parseFloat(row.getAttribute('data-marquee')) || 1, x: 0, half: 0, skew: 0 };
      const measure = () => { st.half = row.scrollWidth / 2 || 0; };
      measure();
      window.addEventListener('resize', measure);
      if (window.ScrollTrigger) window.ScrollTrigger.addEventListener('refresh', measure);
      return st;
    });
  }

  /* =====================================================================
     S8 — SCROLL FLOW. Smoothed |velocity| → --flow (0..1) for ambient layers,
     and it powers the marquee drift/skew + (Phase 2) an ocean stir. One ticker.
     ===================================================================== */
  function initFlow() {
    let flow = 0, lastFlow = -1, lastDescent = 0;
    gsap.ticker.add(() => {
      const vRaw = lenis ? (lenis.velocity || 0) : 0;
      const mag = Math.min(Math.abs(vRaw) / 42, 1);
      flow += (mag - flow) * 0.12;
      const fq = flow < 0.001 ? 0 : Math.round(flow * 1000) / 1000;   // quantise → skip idle repaints
      if (fq !== lastFlow) {
        root.style.setProperty('--flow', fq.toFixed(3));
        if (ocean && ocean.setFlow) ocean.setFlow(fq);
        lastFlow = fq;
      }

      // DESCENT — how far we have sunk, in viewports, plus how hard we are
      // sinking right now. Taken from real scroll position rather than Lenis'
      // velocity so the water still responds if Lenis never loaded.
      if (ocean && ocean.setDescent) {
        const d = window.scrollY / Math.max(1, window.innerHeight);
        const dd = d - lastDescent;                       // > 0 while going down
        lastDescent = d;
        ocean.setDescent(d);
        ocean.setBubble(Math.min(1, Math.abs(dd) * 26) * (dd > 0 ? 1 : 0.25));
      }
      for (const st of marqRows) {
        if (!st.half) { st.half = st.row.scrollWidth / 2 || 0; continue; }
        st.x -= (0.55 + flow * 6) * st.dir;
        if (st.x <= -st.half) st.x += st.half;
        else if (st.x > 0) st.x -= st.half;
        const targetSkew = clamp(vRaw * st.dir * 0.045, -9, 9);
        st.skew += (targetSkew - st.skew) * 0.1;
        st.row.style.transform = `translateX(${st.x.toFixed(2)}px) skewX(${st.skew.toFixed(2)}deg)`;
      }
    });
  }
})();
