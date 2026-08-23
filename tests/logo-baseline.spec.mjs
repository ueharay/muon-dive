import { test, expect } from '@playwright/test';
import { fontsSettled } from './helpers.mjs';

/**
 * These run against a local fixture, so they are meaningless when the suite is
 * pointed at production with TARGET_URL — the deployed site has no reason to
 * serve a test file, and asserting that it does was checking the wrong thing.
 * What matters on production is the real page, which the other specs cover.
 */
test.skip(!!process.env.TARGET_URL, 'fixture-based; not applicable to a deployed URL');

/**
 * PIXEL BASELINES for the two brand lockups.
 *
 * WHY THIS RUNS AGAINST A FIXTURE AND NOT THE LIVE PAGE
 * The lockups sit over a scroll-driven gradient and inside parallax layers, so
 * their pixels shifted whenever anything above them changed height. This
 * baseline broke four times in a row on edits nowhere near the logo — a
 * schedule gap, a deleted table row, the price simulator landing — and each
 * round I fixed the proximate cause: settle longer, snap the clip, snap the svg
 * rather than its wrapper, wait for scroll to go quiet, force the backdrop.
 * The next unrelated edit broke it again.
 *
 * A check that fails on unrelated changes is worse than no check: it teaches
 * everyone to re-record until green, and the day it catches something real,
 * nobody believes it. So the pixels are compared where they can be held still —
 * tests/fixtures/lockups.html, which loads the same stylesheet and the same
 * markup on a flat background. This is the split component visual-regression
 * tools land on: geometry against the real thing, pixels in isolation.
 *
 *   logo-lockup.spec.mjs  — proportions, alignment, letter spread, ON THE PAGE
 *   this file             — stroke weight, colour, the ring's gap, IN ISOLATION
 *   lockup-fixture.spec.mjs — proves the fixture still matches the page
 *
 * Baselines are COMMITTED. Reviewing a changed PNG in a diff is the point: it
 * is the moment somebody sees the logo change on purpose rather than finding
 * out in production.
 */

/** Fails unless the element actually has visible graphics — a snapshot of an
 *  empty box would match any future render forever. The first run of this file
 *  recorded the nav while it was scrolled away under `.nav.is-hidden`, so the
 *  "baseline" was a blank rectangle. */
async function assertHasInk(page, selector) {
  const info = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { found: false };
    const b = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return {
      found: true, w: b.width, h: b.height,
      inViewport: b.top < innerHeight && b.bottom > 0 && b.left < innerWidth && b.right > 0,
      visible: style.visibility !== 'hidden' && style.display !== 'none' && +style.opacity > 0.01,
    };
  }, selector);

  expect(info.found, `${selector} must exist`).toBe(true);
  expect(info.w, `${selector} must have width`).toBeGreaterThan(8);
  expect(info.h, `${selector} must have height`).toBeGreaterThan(8);
  expect(info.visible, `${selector} must be visible`).toBe(true);
  expect(info.inViewport, `${selector} must be inside the viewport when captured`).toBe(true);
}

/** Fixed-size clips so a fractional element size can never change the frame. */
const CLIP = {
  'nav-lockup':    { w: 132, h: 36 },
  'footer-ring':   { w: 44,  h: 44 },
  'footer-lockup': { w: 124, h: 44 },
};

async function shoot(page, selector, name) {
  await assertHasInk(page, selector);
  const box = await page.locator(selector).boundingBox();
  const { w, h } = CLIP[name];
  await expect(page).toHaveScreenshot(`${name}.png`, {
    clip: { x: Math.round(box.x), y: Math.round(box.y), width: w, height: h },
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/fixtures/lockups.html', { waitUntil: 'domcontentloaded' });
  await fontsSettled(page);
  await page.waitForTimeout(300);
});

test('nav lockup matches its baseline', async ({ page }) => {
  await shoot(page, '#navLockup', 'nav-lockup');
});

test('footer lockup matches its baseline', async ({ page }) => {
  await shoot(page, '#footLockup .foot__maru', 'footer-ring');
  await shoot(page, '#footLockup .foot__lockup', 'footer-lockup');
});
