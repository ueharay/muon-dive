import { test, expect } from '@playwright/test';
import { fontsSettled } from './helpers.mjs';

/**
 * The pixel baselines are taken in tests/fixtures/lockups.html rather than on
 * the page, because the page cannot hold the mark still. That trade only holds
 * while the fixture is an honest copy: the moment index.html's lockup changes
 * and the fixture doesn't, the baselines are guarding a logo nobody ships.
 *
 * This is the check that keeps the trade honest.
 */

const norm = (s) => s.replace(/\s+/g, ' ').trim();

async function lockupMarkup(page, url, sel) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await fontsSettled(page);
  return norm(await page.locator(sel).first().innerHTML());
}

test('the fixture nav lockup is the same markup as the page', async ({ page }) => {
  const live = await lockupMarkup(page, '/index.html', '.nav__brand');
  const fixture = await lockupMarkup(page, '/tests/fixtures/lockups.html', '#navLockup');
  expect(fixture, 'tests/fixtures/lockups.html has drifted from index.html').toBe(live);
});

test('the fixture footer lockup is the same markup as the page', async ({ page }) => {
  // .foot__tag is page-only (it is translated); the fixture carries the ring
  // and the wordmark, which is exactly what the baselines capture.
  const live = norm(await (await page.goto('/index.html'), page).evaluate(() => {
    const b = document.querySelector('.foot__brand').cloneNode(true);
    b.querySelector('.foot__tag')?.remove();
    return b.innerHTML;
  }));
  const fixture = await lockupMarkup(page, '/tests/fixtures/lockups.html', '#footLockup');
  expect(fixture, 'tests/fixtures/lockups.html has drifted from index.html').toBe(live);
});

test('the fixture loads the real stylesheet, not a copy', async ({ page }) => {
  await page.goto('/tests/fixtures/lockups.html', { waitUntil: 'domcontentloaded' });
  const hrefs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('link[rel=stylesheet]')).map((l) => l.getAttribute('href')));
  expect(hrefs.some((h) => h && h.endsWith('css/style.css')),
    'the fixture must load the site stylesheet so a CSS change is caught').toBe(true);

  // and the styles must actually have applied
  const stroke = await page.evaluate(() =>
    getComputedStyle(document.querySelector('#footLockup .foot__maru circle')).strokeWidth);
  expect(stroke, 'style.css did not apply in the fixture').not.toBe('1px');
});
