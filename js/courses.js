/* =====================================================================
   ZEN DIVE Manila — course accordion
   Native <details> keeps the no-JS and screen-reader behaviour intact;
   here we only take over the open/close so the panel unfolds with the
   same water-drag easing as the rest of the page.
   ===================================================================== */
(() => {
  'use strict';

  const rows = document.querySelectorAll('.courses details.course');
  if (!rows.length) return;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const EASE_IN = 'cubic-bezier(.16,1,.30,1)';   // --e-drift
  const EASE_OUT = 'cubic-bezier(.65,0,.35,1)';  // --e-sink

  // The page height changes on every fold, so pinned/scroll-driven bits
  // need to re-measure once the motion has settled.
  const settle = () => {
    if (window.ScrollTrigger) window.ScrollTrigger.refresh();
  };

  rows.forEach((row) => {
    const head = row.querySelector('.course__head');
    const panel = row.querySelector('.course__panel');
    if (!head || !panel) return;

    let anim = null;

    head.addEventListener('click', (e) => {
      e.preventDefault();

      if (reduced || typeof panel.animate !== 'function') {
        row.open = !row.open;
        settle();
        return;
      }

      if (anim) anim.cancel();

      if (!row.open) {
        row.open = true;
        const h = panel.scrollHeight;
        anim = panel.animate(
          { height: ['0px', h + 'px'], opacity: [0, 1] },
          { duration: 560, easing: EASE_IN }
        );
        anim.onfinish = () => { anim = null; settle(); };
      } else {
        const h = panel.scrollHeight;
        anim = panel.animate(
          { height: [h + 'px', '0px'], opacity: [1, 0] },
          { duration: 380, easing: EASE_OUT }
        );
        anim.onfinish = () => { row.open = false; anim = null; settle(); };
      }
    });

    // Deep link (#courses/…) or a find-in-page hit can force it open —
    // keep our animation state from fighting the browser.
    row.addEventListener('toggle', () => { if (!row.open && anim) { anim.cancel(); anim = null; } });
  });
})();
