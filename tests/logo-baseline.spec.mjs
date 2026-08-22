import { test, expect } from '@playwright/test';

/**
 * PIXEL BASELINES for the two brand lockups.
 *
 * The shape fingerprint in logo-lockup.spec.mjs models geometry only. It cannot
 * see stroke weight, colour, or the angle of the ring's gap. This file pins the
 * actual pixels so any of those changing is a failure that has to be looked at
 * and consciously accepted (`npx playwright test --update-snapshots`).
 *
 * Baselines live in tests/__screenshots__/ and are COMMITTED. Reviewing a change
 * to one of those PNGs in a diff is the point — it is the moment somebody sees
 * the logo change on purpose instead of finding out in production.
 *
 * Only the lockups are captured, never the page. Full-page screenshots of this
 * site would diff on the ocean gradient, the parallax offsets, and the chat
 * widget, and would be muted within a week.
 *
 * assertHasInk() below is not ceremony. The first run of this file recorded the
 * nav baseline while the nav was scrolled away under `.nav.is-hidden`, so the
 * "baseline" was a blank rectangle — which would then have passed forever
 * against any future nav, including a broken one. A snapshot of nothing is
 * worse than no snapshot, so every capture proves it caught something first.
 */

/** Fails unless the element actually has visible text/graphics in the viewport. */
async function assertHasInk(page, selector) {
  const info = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { found: false };
    const b = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return {
      found: true,
      w: b.width,
      h: b.height,
      inViewport: b.top < innerHeight && b.bottom > 0 && b.left < innerWidth && b.right > 0,
      visible: style.visibility !== 'hidden' && style.display !== 'none' && +style.opacity > 0.01,
      // an ancestor may be translated off-screen (the nav does this on scroll)
      onScreenY: b.top,
    };
  }, selector);

  expect(info.found, `${selector} must exist`).toBe(true);
  expect(info.w, `${selector} must have width`).toBeGreaterThan(8);
  expect(info.h, `${selector} must have height`).toBeGreaterThan(8);
  expect(info.visible, `${selector} must be visible`).toBe(true);
  expect(info.inViewport, `${selector} must be inside the viewport when captured`).toBe(true);
}

async function load(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
}

/**
 * Element screenshots of these lockups are 1px-flaky: the ring's box is
 * 37.6px tall (2.35rem), so whether it rasterises to 38 or 39 rows depends on
 * the fraction in its y position — which moves whenever anything above it
 * changes height. toHaveScreenshot treats a 38x39 vs 38x38 as a hard failure,
 * and the tempting "fix" is to re-record the baseline, i.e. to update the test
 * until it passes. That is the one move this suite exists to prevent.
 *
 * So the capture is made deterministic instead: snap the origin to whole
 * pixels and clip a fixed-size box. Same pixels every run, at any page height.
 */
const CLIP = {
  'nav-lockup':    { w: 132, h: 36 },
  'footer-ring':   { w: 44,  h: 44 },
  'footer-lockup': { w: 124, h: 44 },
};

/**
 * Snapping only the clip origin is not enough: the element itself can sit at
 * y = 100.3 in one run and y = 100.7 in the next (anything above it changing
 * height is enough), and the glyph edges antialias differently at each. The
 * clip is identical, the pixels are not, and the diff looks like a design
 * regression when nothing about the design moved.
 *
 * So the element is nudged onto whole pixels first, then clipped at whole
 * pixels. Same rasterisation every run, at any page height. The nudge is
 * removed afterwards so it cannot leak into another assertion.
 */
async function shootStable(page, selector, name) {
  await assertHasInk(page, selector);

  const before = await page.locator(selector).boundingBox();
  const dx = Math.round(before.x) - before.x;
  const dy = Math.round(before.y) - before.y;
  await page.evaluate(([sel, x, y]) => {
    const el = document.querySelector(sel);
    el.dataset.prevTransform = el.style.transform || '';
    el.style.transform = `translate(${x}px, ${y}px)`;
  }, [selector, dx, dy]);

  const box = await page.locator(selector).boundingBox();
  const { w, h } = CLIP[name];
  try {
    await expect(page).toHaveScreenshot(`${name}.png`, {
      clip: { x: Math.round(box.x), y: Math.round(box.y), width: w, height: h },
    });
  } finally {
    await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      el.style.transform = el.dataset.prevTransform || '';
      delete el.dataset.prevTransform;
    }, selector);
  }
}

test('nav lockup matches its baseline', async ({ page }) => {
  await load(page);
  // Stay at the top: the nav translates itself out of view once the page is
  // scrolled, and capturing it there yields an empty image.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);
  await expect(page.locator('.nav')).not.toHaveClass(/is-hidden/);
  await shootStable(page, '.nav__brand', 'nav-lockup');
});

test('footer lockup matches its baseline', async ({ page }) => {
  await load(page);
  await page.evaluate(() => document.querySelector('.foot__brand')?.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(600);
  // The ring and the wordmark, without .foot__tag — the tagline is translated,
  // so including it would make this test fail on a language switch.
  await shootStable(page, '.foot__kanji', 'footer-ring');
  await shootStable(page, '.foot__lockup', 'footer-lockup');
});
