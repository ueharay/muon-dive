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

test('nav lockup matches its baseline', async ({ page }) => {
  await load(page);
  // Stay at the top: the nav translates itself out of view once the page is
  // scrolled, and capturing it there yields an empty image.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);
  await expect(page.locator('.nav')).not.toHaveClass(/is-hidden/);
  await assertHasInk(page, '.nav__brand');
  await expect(page.locator('.nav__brand')).toHaveScreenshot('nav-lockup.png');
});

test('footer lockup matches its baseline', async ({ page }) => {
  await load(page);
  await page.evaluate(() => document.querySelector('.foot__brand')?.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(600);
  // .foot__lockup + the ring, without .foot__tag — the tagline is translated,
  // so including it would make this test fail on a language switch.
  await assertHasInk(page, '.foot__kanji');
  await assertHasInk(page, '.foot__lockup');
  await expect(page.locator('.foot__kanji')).toHaveScreenshot('footer-ring.png');
  await expect(page.locator('.foot__lockup')).toHaveScreenshot('footer-lockup.png');
});
