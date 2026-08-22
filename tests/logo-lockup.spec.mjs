import { test, expect } from '@playwright/test';

/**
 * THE BRAND LOCKUP CONTRACT
 *
 * The ring + "ZEN DIVE" + "M A N I L A" lockup appears twice: in the nav and in
 * the footer, at different sizes. The requirement from the owner is literal —
 * "make the footer logo the same SHAPE as the header logo".
 *
 * Why this file exists
 * --------------------
 * The footer's MANILA once rendered 2.06x the width of ZEN DIVE while the nav's
 * rendered 1.00x, and it shipped to production twice. Nothing caught it, because
 * the only checks were "does the JS parse / does the page return 200", and the
 * appearance was signed off by eye.
 *
 * It also survived a measurement that *looked* rigorous: comparing
 * getBoundingClientRect() of .foot__word and .foot__city said 232.9 vs 232.8 —
 * "matched" — while the ink inside those boxes was 112px vs 231px. The box was
 * never the thing anyone looks at.
 *
 * So this file asserts on INK: the union of Range.getClientRects() over the text
 * nodes, which is the glyph extent a human actually sees.
 *
 * Two layers, on purpose
 * ----------------------
 * 1. SHAPE FINGERPRINT (below) — scale-invariant ratios and normalised letter
 *    positions. Robust across font rendering, viewport, and machine, and it says
 *    exactly what "same shape" means instead of hoping a human notices.
 * 2. PIXEL BASELINES (logo-baseline.spec.mjs) — catches everything the
 *    fingerprint doesn't model: stroke weight, colour, the ring's gap angle.
 *
 * Neither is sufficient alone. The fingerprint can't see colour; the baseline
 * can't tell you *why* it changed.
 */

/** Inked extent of an element's text — what the eye sees, not the box. */
const INK = `(sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = document.createRange();
  r.selectNodeContents(el);
  const rects = Array.from(r.getClientRects()).filter(x => x.width > 0 && x.height > 0);
  if (!rects.length) return null;
  return {
    left:   Math.min(...rects.map(x => x.left)),
    right:  Math.max(...rects.map(x => x.right)),
    top:    Math.min(...rects.map(x => x.top)),
    bottom: Math.max(...rects.map(x => x.bottom)),
  };
}`;

/**
 * Reduce one lockup to a set of scale-invariant numbers. Two lockups that are
 * "the same shape at different sizes" produce the same fingerprint.
 */
async function fingerprint(page, { ring, word, city, letters }) {
  return page.evaluate(
    ([ringSel, wordSel, citySel, lettersSel, inkSrc]) => {
      const ink = eval(inkSrc);
      const w = ink(wordSel);
      const c = ink(citySel);
      const ringEl = document.querySelector(ringSel);
      if (!w || !c || !ringEl) return null;

      const ringBox = ringEl.getBoundingClientRect();
      const wordW = w.right - w.left;

      // Normalised centre of each city letter along the city's own ink span.
      // This is the part that actually encodes "the letters are spread the same
      // way" — a ratio alone would miss uneven distribution.
      const cityW = c.right - c.left;
      const letterCentres = Array.from(document.querySelectorAll(lettersSel)).map((el) => {
        const b = el.getBoundingClientRect();
        return +(((b.left + b.right) / 2 - c.left) / cityW).toFixed(4);
      });

      return {
        cityToWord:     +((c.right - c.left) / wordW).toFixed(4),
        // Height, not just width. .foot__city is justify-content:space-between,
        // so its ink WIDTH is pinned to the container no matter what size the
        // letters are — halving the city font-size left every width ratio here
        // unchanged and the whole suite green. Height is the only measure that
        // notices the type shrinking.
        cityToWordSize: +((c.bottom - c.top) / (w.bottom - w.top)).toFixed(4),
        ringToWord:     +(ringBox.width / wordW).toFixed(4),
        wordAspect:     +((w.bottom - w.top) / wordW).toFixed(4),
        // gap between the two tiers, normalised
        tierGap:        +((c.top - w.bottom) / wordW).toFixed(4),
        // left edges of the two tiers must agree (0 = flush)
        leftAlign:      +((c.left - w.left) / wordW).toFixed(4),
        // ring's vertical centre relative to the lockup's centre
        ringOffsetY:    +((((ringBox.top + ringBox.bottom) / 2) - ((w.top + c.bottom) / 2)) / wordW).toFixed(4),
        letterCentres,
      };
    },
    [ring, word, city, letters, INK]
  );
}

const NAV  = { ring: '.nav__maru',  word: '.nav__word',  city: '.nav__city',  letters: '.nav__city i' };
const FOOT = { ring: '.foot__maru', word: '.foot__word', city: '.foot__city', letters: '.foot__city i' };

test.beforeEach(async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  // The footer only lays out correctly once it has been reached; scrolling also
  // settles any reveal-on-scroll transforms before anything is measured.
  await page.evaluate(() => document.querySelector('.foot__brand')?.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(500);
});

test('footer lockup is the same shape as the nav lockup', async ({ page }) => {
  const nav = await fingerprint(page, NAV);
  const foot = await fingerprint(page, FOOT);

  expect(nav, 'nav lockup must be measurable').not.toBeNull();
  expect(foot, 'footer lockup must be measurable').not.toBeNull();

  // Tolerances are tight enough to catch a real design drift and loose enough to
  // survive subpixel text layout. The bug that shipped was 2.06 vs 1.00 here.
  expect(foot.cityToWord,  'MANILA width relative to ZEN DIVE').toBeCloseTo(nav.cityToWord, 1);
  expect(foot.cityToWordSize, 'MANILA type size relative to ZEN DIVE').toBeCloseTo(nav.cityToWordSize, 1);
  expect(foot.ringToWord,  'ring diameter relative to ZEN DIVE').toBeCloseTo(nav.ringToWord, 1);
  expect(foot.wordAspect,  'ZEN DIVE height:width').toBeCloseTo(nav.wordAspect, 1);
  expect(foot.leftAlign,   'the two tiers share a left edge').toBeCloseTo(nav.leftAlign, 1);
  expect(foot.tierGap,     'gap between the two tiers').toBeCloseTo(nav.tierGap, 1);
  expect(foot.ringOffsetY, 'ring centred against the lockup').toBeCloseTo(nav.ringOffsetY, 1);

  // Letter distribution: M A N I L A must sit in the same relative places.
  expect(foot.letterCentres).toHaveLength(nav.letterCentres.length);
  for (let i = 0; i < nav.letterCentres.length; i++) {
    expect(foot.letterCentres[i], `MANILA letter ${i} position`).toBeCloseTo(nav.letterCentres[i], 1);
  }
});

test('neither lockup lets the city line outgrow the wordmark', async ({ page }) => {
  // The specific failure mode, stated directly: the city tier is spread by
  // justify-content:space-between across whatever width its parent happens to
  // be, so if the parent is ever sized by something other than the wordmark
  // (a stretched grid item, a stray flex-grow), MANILA runs wide.
  for (const [name, sel] of [['nav', NAV], ['footer', FOOT]]) {
    const fp = await fingerprint(page, sel);
    expect(fp.cityToWord, `${name}: MANILA must not exceed ZEN DIVE's width`).toBeLessThanOrEqual(1.02);
    expect(fp.cityToWord, `${name}: MANILA must not collapse`).toBeGreaterThan(0.8);
  }
});
