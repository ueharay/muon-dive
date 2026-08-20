/* =====================================================================
   ZEN DIVE Manila — gallery marquee
   The CSS animation translates the track by exactly -50%, so the strip
   has to hold two identical copies of the set. Cloning here (rather than
   duplicating the markup) keeps one source of truth for the captions and
   the alt text. Video clones become their poster image: the lazy loader
   in main.js only observes the elements that existed at init, and a second
   decoding video buys nothing visually.
   ===================================================================== */
(() => {
  'use strict';

  const track = document.querySelector('.gallery__track');
  if (!track || track.dataset.looped) return;

  const originals = [...track.children];
  if (!originals.length) return;

  originals.forEach((node) => {
    const clone = node.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');

    clone.querySelectorAll('video').forEach((video) => {
      const img = document.createElement('img');
      img.src = video.getAttribute('poster') || '';
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      video.replaceWith(img);
    });

    track.appendChild(clone);
  });

  track.dataset.looped = '1';

  // A drifting strip is motion the viewer never asked for — honour the OS switch.
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    track.style.animation = 'none';
    track.parentElement.style.overflowX = 'auto';
  }
})();
