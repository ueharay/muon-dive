import { test, expect } from '@playwright/test';
import { fontsSettled, openSite } from './helpers.mjs';

/**
 * The widget is exercised by clicking it, not by reading its source. The maths
 * has its own tests in price.spec.mjs; what is checked here is that the controls
 * are wired to that maths, that impossible combinations cannot be reached, and
 * that the room count behaves the way a booking site's does.
 */

const money = (s) => Number(String(s).replace(/[^0-9]/g, ''));

async function openSim(page, lang = 'ja') {
  await openSite(page, { lang });
  // Wait for the widget to render before doing anything with it. Scrolling to
  // #simDivers while it was still empty aimed at a zero-height box, and the
  // total assertion then timed out against the ₱0 placeholder.
  await expect(page.locator('#sim .sim__total')).not.toHaveText('₱0');
  await expect(page.locator('#simDivers .seg')).toHaveCount(4);

  // The simulator is taller than a laptop viewport, so the controls sit above
  // the fold when the section is centred. scrollIntoViewIfNeeded is Playwright's
  // own retry-aware version — a hand-rolled scrollIntoView plus a toBeInViewport
  // assertion just raced the smooth-scroll library and timed out.
  await page.locator('#simDivers').scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
}

const total = (page) => page.locator('#sim .sim__total').innerText().then(money);



test('the simulator renders the tuition total, not the placeholder', async ({ page }) => {
  await openSim(page);
  expect(await total(page)).toBe(30000);
  await expect(page.locator('#simDivers .seg')).toHaveCount(4);
});

test('room selection is not in the pricing section — lodging is an on-site guide price', async ({ page }) => {
  await openSim(page);
  await expect(page.locator('#simRoom')).toHaveCount(0);
  await expect(page.locator('#simRooms')).toHaveCount(0);
  const sim = await page.locator('#sim').innerText();
  expect(sim).toContain('宿泊');
});

test('the discount is visible before you click, and adds up on the card', async ({ page }) => {
  await openSim(page);

  // The owner's whole point: bringing people should look cheaper from the
  // outside, not only after you have selected them.
  const subs = await page.locator('#simDivers .seg__sub').allInnerTexts();
  expect(subs, 'every segment carries a second line, so the row cannot go ragged')
    .toHaveLength(4);
  expect(subs[0], 'the base option says what it is rather than sitting empty').not.toMatch(/₱/);
  expect(subs[0].trim().length, 'and it is not blank').toBeGreaterThan(0);

  // Money, not percent. "5% OFF" and "₱2,000 OFF" are the same discount and
  // only one of them is a figure the reader can feel — and one percentage
  // printed two different amounts across the two courses.
  // What the BOOKING saves, matching the badge on the card. Per-head figures
  // here meant "₱2,000 OFF" on the segment and "₱4,000 お得" on the card for
  // one and the same discount, with nothing on screen to tell them apart.
  const offs = subs.slice(1).map(money);
  expect(offs, 'the discount is the whole party\'s, stated in pesos')
    .toEqual([2000 * 2, 6000 * 3, 8000 * 4]);
  for (const sub of subs.slice(1)) expect(sub, `stated as money off: "${sub}"`).toMatch(/₱[\d,]+\s*OFF/i);


  // Assert the content, not CSS visibility: the phone layout deliberately drops
  // this badge from the booking bar, and testing visibility would fail there on
  // a design decision rather than a defect.
  const savedText = () => page.locator('.sim__saved').evaluate((el) => ({
    hidden: el.hidden,
    text: el.textContent.trim(),
    painted: getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0,
  }));

  const solo = await savedText();
  expect(solo.hidden, 'a solo diver has saved nothing').toBe(true);
  // [hidden] loses to an explicit display value, which left an empty coloured
  // pill on the card. Check what is painted, not just the attribute.
  expect(solo.painted, 'a hidden badge must not still be drawn').toBe(false);
  await page.locator('#simDivers .seg').nth(3).click();
  await page.waitForTimeout(300);
  const after = await savedText();
  expect(after.hidden, 'four divers have saved something').toBe(false);
  expect(money(after.text), 'the saving is stated in money too').toBeGreaterThan(0);
});

test('the headcount chips carry no price of their own', async ({ page }) => {
  await openSim(page);
  // They used to. Three divers need two standard rooms, so "3" showed a higher
  // per-head figure than "4" and looked like a bug; the numbers also moved when
  // the room grade changed. The per-person price belongs where it is true: on
  // the card, for the combination actually selected.
  // The rate is what must not appear. Three divers need two standard rooms, so
  // "3" showed a higher per-head figure than "4" and looked like a bug; the
  // numbers also moved when the room grade changed. The discount may appear —
  // it is the same money at every room grade — but never the rate itself.
  const segs = await page.locator('#simDivers .seg').allInnerTexts();
  expect(segs).toHaveLength(4);
  const perDiverRate = money(await page.locator('#sim .sim__lines i').first().innerText());
  const grandTotal = await total(page);
  expect(perDiverRate, 'sanity: the breakdown does quote a rate').toBeGreaterThan(20000);
  for (const c of segs) {
    for (const amt of (c.match(/₱[\d,]+/g) || []).map(money)) {
      expect(amt, `a segment must not quote the rate: "${c}"`).not.toBe(perDiverRate);
      expect(amt, `nor the total: "${c}"`).not.toBe(grandTotal);
    }
    if (/₱/.test(c)) expect(c, `an amount on a segment is a saving, and says so: "${c}"`)
      .toMatch(/OFF/i);
  }
  await expect(page.locator('.sim__card .sim__per')).toContainText('₱');
});

test('the price and the booking button stay together', async ({ page }) => {
  await openSim(page);
  // A visitor who has just settled on a number should not have to hunt for the
  // way to act on it.
  await expect(page.locator('.sim__card .sim__total')).toBeVisible();
  await expect(page.locator('.sim__card .sim__cta')).toBeVisible();
});

test('adding a diver raises the total; the per-head price falls after the first', async ({ page }) => {
  await openSim(page);
  const one = await total(page);
  const onePer = money(await page.locator('#sim .sim__per').innerText());

  await page.locator('#simDivers .seg').nth(1).click();  // 2 divers
  await page.waitForTimeout(250);
  const two = await total(page);
  const twoPer = money(await page.locator('#sim .sim__per').innerText());

  expect(two).toBeGreaterThan(one);
  expect(twoPer, 'sharing the boat must show up as a lower per-head price').toBeLessThan(onePer);
});

test('the breakdown displays tuition calculation', async ({ page }) => {
  await openSim(page);
  await page.locator('#simDivers .seg').nth(1).click(); // 2 divers
  await page.waitForTimeout(300);

  const amounts = await page.locator('#sim .sim__lines b').allInnerTexts();
  expect(amounts.length).toBeGreaterThanOrEqual(1);
  expect(money(amounts[0])).toBe(56000); // 2 divers tuition with discount (28000 each)
});

test('the simulator speaks English on the English page', async ({ page }) => {
  await openSim(page, 'en');
  const text = await page.locator('#sim').innerText();
  expect(text, 'the widget writes its own labels after the i18n pass has run')
    .not.toMatch(/[぀-ヿ㐀-䶿一-鿿]/);

  expect(text, 'the control labels must be translated').toMatch(/People taking the course/);
  expect(text, 'the booking button must be translated').toMatch(/Book/i);
});

test('the headcount row is even — no segment sized by its own label', async ({ page }) => {
  await openSim(page);

  // Apple HIG: "it doesn't look good if content fills some segments but not
  // others." The first option had no discount, collapsed to a narrow egg, and
  // the row read as broken. Width must come from the grid, never from content.
  const widths = await page.locator('#simDivers .seg').evaluateAll(
    (els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
  expect(widths).toHaveLength(4);
  expect(Math.max(...widths) - Math.min(...widths),
    `segments must be equal width, got ${widths.join(' / ')}`).toBeLessThanOrEqual(1);

  const heights = await page.locator('#simDivers .seg').evaluateAll(
    (els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
  expect(Math.max(...heights) - Math.min(...heights),
    `segments must be equal height, got ${heights.join(' / ')}`).toBeLessThanOrEqual(1);
});

test('the headcount control is a radio group, not a row of buttons', async ({ page }) => {
  await openSim(page);

  // It sets a value, so W3C APG says radio group — native inputs give arrow-key
  // roving and "selected, 2 of 4" announcements for free.
  // The count is deliberately not pinned: this test has now been broken twice by
  // adding a control, which says nothing about accessibility. What matters is
  // that every group has a label, however many groups there are.
  const legends = page.locator('#sim fieldset legend');
  const n = await legends.count();
  expect(n, 'the simulator asks at least one labelled question').toBeGreaterThan(0);
  for (let i = 0; i < n; i++) await expect(legends.nth(i)).toHaveText(/\S/);
  // Every radio group must be reachable as a group, not a loose row of inputs.
  const id = '#simDivers';
  await expect(page.locator(`${id} input[type=radio]`).first(),
    `${id} is a radio group`).toHaveCount(1);
  await expect(page.locator(`${id}`).locator('xpath=ancestor::fieldset[1]/legend'),
    `${id} carries a legend`).toHaveText(/\S/);
  const radios = page.locator('#simDivers input[type=radio]');
  await expect(radios).toHaveCount(4);
  await expect(radios.nth(0)).toBeChecked();

  await page.locator('#simDivers .seg').nth(2).click();
  await page.waitForTimeout(250);
  await expect(page.locator('#simDivers input[type=radio]').nth(2)).toBeChecked();
});

test('the selected segment is filled, not merely outlined', async ({ page }) => {
  await openSim(page);
  // On a dark surface a border-only indicator is a hue shift on a 1px line —
  // almost no area, and it has to clear WCAG 1.4.11's 3:1 on a stroke that
  // anti-aliasing eats. The fill is what makes the selection readable.
  const bg = (i) => page.locator('#simDivers .seg').nth(i)
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  const alpha = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return 0;
    const p = m[1].split(',').map(Number); return p.length > 3 ? p[3] : 1; };

  expect(alpha(await bg(0)), 'the selected segment must be filled').toBeGreaterThan(0.05);
  expect(alpha(await bg(1)), 'unselected segments must not be').toBeLessThan(0.05);
});

test('a summary line is always on screen', async ({ page }) => {
  await openSim(page);
  await page.locator('#simDivers .seg').nth(2).click();   // 3 divers
  await page.waitForTimeout(300);

  // The summary line is still there, but which one depends on the viewport.
  // On a wide screen the card states the configuration ("3名・講習費用"); on
  // the booking bar, where there is room for one line and the reader is deciding,
  // it states the per-head price instead. Exactly one is on screen, and it carries
  // a figure either way.
  const short = page.locator('#sim .sim__short');
  const perbar = page.locator('#sim .sim__perbar');
  const shown = (await short.isVisible()) ? short : perbar;
  await expect(shown, 'one summary line is always on screen').toBeVisible();
  await expect(await short.isVisible(), 'and only one of them').not.toBe(await perbar.isVisible());
  await expect(shown, 'the summary carries a number').toHaveText(/\d/);
});

test('the headcount row has equal tracks and consistent shape', async ({ page }) => {
  await openSim(page);
  const shape = (sel) => page.locator(sel).first().evaluate((el) => {
    const cs = getComputedStyle(el.closest('.seg__row'));
    return { cols: cs.gridTemplateColumns.split(' ').map(parseFloat), radius: cs.borderRadius };
  });
  const a = await shape('#simDivers .seg');
  expect(parseFloat(a.radius), 'has rounded border').toBeGreaterThan(0);

  const n = await page.locator('#simDivers .seg').count();
  const cols = a.cols;
  expect(cols.length, '#simDivers: one track per option').toBe(n);
  // Equal width, to within a rounding pixel — Carbon's rule for segmented rows.
  expect(Math.max(...cols) - Math.min(...cols), '#simDivers: tracks are equal').toBeLessThan(1.5);
});

test('the card describes the course it is quoting', async ({ page }) => {
  await openSim(page);

  const spec = () => page.locator('#simSpec').innerText();
  const name = () => page.locator('#simCourseName').innerText();

  expect(await spec()).toContain('18m');
  expect(await name()).toContain('オープンウォーター');
  expect(await total(page)).toBe(30000);
});

test('the group discount applies to headcount', async ({ page }) => {
  await openSim(page);
  const one = await total(page);
  await page.locator('#simDivers .seg').nth(1).click();   // 2 divers
  await page.waitForTimeout(300);
  const two = await total(page);
  expect(two, 'two divers cost more in total').toBeGreaterThan(one);
  // The whole promise of the ladder: the second diver is cheaper than the first.
  expect(two - one, 'the second diver pays less than the first').toBeLessThan(one);
});
