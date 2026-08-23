import { test, expect } from '@playwright/test';
import { openSite } from './helpers.mjs';

/* ---------------------------------------------------------------------------
   Synthetic weight.

   A font-weight the family does not ship is not an error anywhere: the browser
   quietly fabricates it by fattening the outline it does have. Strokes thicken
   evenly, joins fill in, and the result is a face nobody drew. It passes every
   check that reads CSS — the computed style says 500 because that is what was
   asked for — and it is only visible to an eye.

   The total was set in Marcellus 500. Marcellus ships 400 alone, so every price
   on the site's most important line was rendered in a fake. Measured: 250.3px
   at the real 400, 257.6px at "500", and 257.6px again at 700 — one smeared
   outline standing in for both.

   This walks the loaded faces, so it holds for any element and any family added
   later, not just the one that went wrong.
   --------------------------------------------------------------------------- */

/** Selectors whose typeface is load-bearing enough to be worth pinning. */
const WATCHED = [
  '.sim__total', '.sim__per', '.sim__label', '.sim__lines b',
  '.seg__n', '.seg__sub', '.sim__roomdelta',
  '.nav__word', '.foot__word', '.btn',
];

test('no element asks for a weight its font family does not ship', async ({ page }) => {
  await openSite(page);
  await page.locator('#sim').scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.fonts.status === 'loaded' || document.fonts.size > 0);
  await page.waitForTimeout(800);

  const findings = await page.evaluate((selectors) => {
    // family -> the weights actually delivered. Variable fonts report a range
    // ("300 500"); both ends are kept so anything between counts as real.
    const shipped = new Map();
    for (const f of document.fonts) {
      if (f.status !== 'loaded') continue;
      const key = f.family.replace(/['"]/g, '').toLowerCase();
      const parts = String(f.weight).split(/\s+/).map(Number).filter((n) => !Number.isNaN(n));
      if (!parts.length) continue;
      const cur = shipped.get(key) || [];
      cur.push([Math.min(...parts), Math.max(...parts)]);
      shipped.set(key, cur);
    }

    const out = [];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (!el) continue;                       // section may not exist on a page
      const cs = getComputedStyle(el);
      if (!el.textContent.trim()) continue;    // nothing being painted
      const first = cs.fontFamily.split(',')[0].replace(/['"]/g, '').trim().toLowerCase();
      const ranges = shipped.get(first);
      if (!ranges) continue;                   // a system font — nothing to fake
      const w = Number(cs.fontWeight);
      const real = ranges.some(([lo, hi]) => w >= lo && w <= hi);
      if (!real) {
        out.push(`${sel}: ${cs.fontFamily.split(',')[0]} @ ${w} — ships only ` +
          ranges.map(([lo, hi]) => (lo === hi ? lo : `${lo}-${hi}`)).join(', '));
      }
    }
    return out;
  }, WATCHED);

  expect(findings, 'the browser would have to invent these weights').toEqual([]);
});

test('the total is set like the other prices, and its digits do not reflow', async ({ page }) => {
  await openSite(page);
  await page.locator('#sim').scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);

  // Every other money figure on the card uses --label. The total wearing a
  // different face made the page's most-read number the least consistent one.
  const fam = (sel) => page.locator(sel).first()
    .evaluate((el) => getComputedStyle(el).fontFamily);
  expect(await fam('.sim__total'), 'the total matches the other prices')
    .toBe(await fam('.sim__roomdelta'));

  // Proportional digits make the total twitch sideways on every click, which
  // reads as the figure being unstable rather than the choice being applied.
  const num = await page.locator('.sim__total')
    .evaluate((el) => getComputedStyle(el).fontVariantNumeric);
  expect(num, 'tabular figures').toContain('tabular-nums');
});
