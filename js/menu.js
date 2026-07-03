/* =========================================================================
   無音 MUON — js/menu.js  (S7 · immersive full-screen menu)
   A single overlay used on every width: giant mincho links that rise on open,
   and hovering a link bleeds that section's poster into the background. Built
   in JS so a load failure leaves main.js's plain drawer as the fallback.

   Public API (read by main.js's burger + closeMenu):
     window.MUON_MENU = { open, close, toggle, isOpen }
   ========================================================================= */
(() => {
  'use strict';
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, c = document) => c.querySelector(s);

  // section → poster preview (posters already ship for the background videos)
  const ITEMS = [
    { href: '#contrast',   jp: '物理法則',   en: 'Physics',    poster: 'assets/video/reef-orange.jpg' },
    { href: '#descent',    jp: '潜降',       en: 'Descent',    poster: 'assets/video/reef-teal.jpg' },
    { href: '#experience', jp: '体験',       en: 'Experience', poster: 'assets/video/reef-portrait.jpg' },
    { href: '#offers',     jp: 'プラン',     en: 'Plans',      poster: 'assets/video/table-coral.jpg' },
    { href: '#access',     jp: 'アクセス',   en: 'Access',     poster: 'assets/video/hero-montage.jpg' },
    { href: '#trust',      jp: '安全',       en: 'Safety',     poster: 'assets/video/reef-orange.jpg' },
    { href: '#cta',        jp: '予約する',   en: 'Book',       poster: 'assets/video/reef-teal.jpg' },
  ];

  let overlay, bg, trigger, burger, open = false, lastFocus = null;

  function build() {
    overlay = document.createElement('div');
    overlay.className = 'immersive';
    overlay.id = 'immersive';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML =
      '<div class="immersive__bg" id="immBg" aria-hidden="true"></div>' +
      '<div class="immersive__scrim" aria-hidden="true"></div>' +
      '<nav class="immersive__nav" aria-label="全画面メニュー">' +
      ITEMS.map((it, i) =>
        '<a class="imm-link" href="' + it.href + '" data-poster="' + it.poster + '" style="--i:' + i + '" tabindex="-1">' +
          '<span class="imm-link__idx">0' + (i + 1) + '</span>' +
          '<span class="imm-link__jp" data-l="ja">' + it.jp + '</span>' +
          '<span class="imm-link__en" data-l="en">' + it.en + '</span>' +
        '</a>'
      ).join('') +
      '</nav>' +
      '<div class="immersive__foot"><span>無音 MUON — SILENT DIVE</span><span>MANILA ↝ THE OTHER SIDE</span></div>';
    document.body.appendChild(overlay);
    bg = $('#immBg', overlay);

    // desktop trigger (mobile keeps main.js's burger, which calls us via toggle)
    const actions = $('.nav__actions');
    burger = $('#burger');
    if (actions) {
      trigger = document.createElement('button');
      trigger.className = 'nav__menu';
      trigger.type = 'button';
      trigger.setAttribute('aria-label', 'メニューを開く');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.setAttribute('aria-controls', 'immersive');
      trigger.innerHTML = '<span></span><span></span><span></span>';
      actions.insertBefore(trigger, burger || null);
      trigger.addEventListener('click', toggle);
    }

    // link behaviour: preview on hover/focus, smart-scroll + close on activate
    overlay.querySelectorAll('.imm-link').forEach((a) => {
      const preview = () => {
        const src = a.getAttribute('data-poster');
        if (src && bg) bg.style.backgroundImage = 'url("' + src + '")';
        overlay.classList.add('has-preview');
      };
      a.addEventListener('mouseenter', preview);
      a.addEventListener('focus', preview);
      a.addEventListener('mouseleave', () => overlay.classList.remove('has-preview'));
      a.addEventListener('click', (e) => {
        const id = a.getAttribute('href');
        const target = id && id.length > 1 ? $(id) : null;
        close();
        const lenis = window.__MUON && window.__MUON.lenis;
        if (target && lenis) {
          e.preventDefault();
          // let the close begin, then glide down
          setTimeout(() => lenis.scrollTo(target, { offset: 0, duration: 1.4, easing: (x) => 1 - Math.pow(1 - x, 4) }), 60);
        }
        // else: native anchor jump after close
      });
    });

    // dismiss: Esc, or clicking the empty background (not a link)
    overlay.addEventListener('click', (e) => { if (e.target === overlay || e.target.classList.contains('immersive__scrim')) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) close(); });
  }

  const links = () => Array.from(overlay.querySelectorAll('.imm-link'));

  function setOpen(state) {
    open = state;
    root.classList.toggle('imm-open', state);
    overlay.setAttribute('aria-hidden', String(!state));
    links().forEach((a) => a.setAttribute('tabindex', state ? '0' : '-1'));
    if (trigger) { trigger.setAttribute('aria-expanded', String(state)); trigger.setAttribute('aria-label', state ? 'メニューを閉じる' : 'メニューを開く'); }
    if (burger) burger.setAttribute('aria-expanded', String(state));
    const lenis = window.__MUON && window.__MUON.lenis;
    if (state) lenis && lenis.stop(); else lenis && lenis.start();
  }

  function doOpen() {
    if (open) return;
    lastFocus = document.activeElement;
    setOpen(true);
    overlay.classList.remove('has-preview');
    if (bg) bg.style.backgroundImage = '';
    // move focus in (first link) once the panel is interactive
    const first = links()[0];
    if (first) setTimeout(() => first.focus({ preventScroll: true }), reduced ? 0 : 260);
  }
  function doClose() {
    if (!open) return;
    setOpen(false);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  function toggle() { open ? doClose() : doOpen(); }

  // simple focus containment: Tab cycles within the open menu
  function trap(e) {
    if (!open || e.key !== 'Tab') return;
    const f = links();
    if (trigger) f.push(trigger);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function init() {
    if (document.getElementById('immersive')) return;
    build();
    document.addEventListener('keydown', trap);
    window.MUON_MENU = { open: doOpen, close: doClose, toggle, isOpen: () => open };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
