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

/** Target a room count by its value. Indexes broke the moment impossible
 *  counts stopped rendering — with three divers the first segment is "2". */
const roomSeg = (page, n) => page.locator(`#simRooms .seg:has(input[value="${n}"])`);
const pickRooms = (page, n) => roomSeg(page, n).click();


test('the simulator renders a real total, not the placeholder', async ({ page }) => {
  await openSim(page);
  expect(await total(page)).toBeGreaterThan(10000);
  await expect(page.locator('#simDivers .seg')).toHaveCount(4);
  await expect(page.locator('#simRoom .sim__room')).toHaveCount(3);
});

test('every room shows a photo and what upgrading to it costs', async ({ page }) => {
  await openSim(page);

  // The photograph is the point of the card; a broken one silently turns this
  // back into a list of three words.
  const loaded = await page.locator('#simRoom .sim__roomart').evaluateAll(
    (imgs) => imgs.map((i) => ({ src: i.getAttribute('src'), w: i.naturalWidth })));
  expect(loaded).toHaveLength(3);
  for (const im of loaded) expect(im.w, `image failed to load: ${im.src}`).toBeGreaterThan(0);

  // Every card states its own nightly rate, ascending. Absolute rather than a
  // difference, so the cheapest card is not left describing itself as nothing.
  const rates = await page.locator('#simRoom .sim__roomdelta').allInnerTexts();
  expect(rates).toHaveLength(3);
  for (const r of rates) expect(r, `room must carry its rate: "${r}"`).toMatch(/₱[\d,]+/);
  const nums = rates.map(money);
  expect(nums.every((n) => n > 0), 'a room with no price is a room nobody can choose').toBe(true);
  expect(nums).toEqual([...nums].sort((a, b) => a - b));

  // Capacity decides whether a room can hold the party at all, so it is not
  // decoration to be dropped when the cards get smaller — which is how it went
  // missing once already.
  const caps = await page.locator('#simRoom .sim__roommeta').allInnerTexts();
  expect(caps, 'every room must state how many it sleeps').toHaveLength(3);
  for (const c of caps) expect(c, `capacity missing: "${c}"`).toMatch(/\d/);
});

test('the discount is visible before you click, and adds up on the card', async ({ page }) => {
  await openSim(page);

  // The owner's whole point: bringing people should look cheaper from the
  // outside, not only after you have selected them.
  const subs = await page.locator('#simDivers .seg__sub').allInnerTexts();
  expect(subs, 'every segment carries a second line, so the row cannot go ragged')
    .toHaveLength(4);
  expect(subs[0], 'the base option says what it is rather than sitting empty').not.toMatch(/%/);
  expect(subs[0].trim().length, 'and it is not blank').toBeGreaterThan(0);
  const pcts = subs.slice(1).map((c) => Number(c.match(/(\d+)\s*%/)?.[1]));
  expect(pcts, 'the discount must grow with the party').toEqual([5, 10, 15]);

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
  const segs = await page.locator('#simDivers .seg').allInnerTexts();
  expect(segs).toHaveLength(4);
  for (const c of segs) expect(c, `headcount segment must carry no price: "${c}"`).not.toMatch(/₱/);
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

test('impossible room counts are not offered at all', async ({ page }) => {
  await openSim(page);
  await page.locator('#simDivers .seg').nth(2).click();   // 3 divers, Standard sleeps 2
  await page.waitForTimeout(300);

  // Greyed-out options with a dash under them told the visitor nothing. Three
  // people cannot use one Standard room, so that count is simply absent.
  const counts = await page.locator('#simRooms .seg__n').allInnerTexts();
  expect(counts.map((c) => c.replace(/\D/g, '')), 'only counts that work').toEqual(['2', '3']);
  await expect(page.locator('#simRooms .seg.is-off')).toHaveCount(0);
  await expect(page.locator('#sim .sim__warn')).toBeHidden();
});

test('a choice with one answer is not presented as a choice', async ({ page }) => {
  await openSim(page);
  // One diver can only take one room. Showing a control with a single live
  // option and two dead ones asked a question that had no alternatives.
  await expect(page.locator('.sim__roomsgroup')).toBeHidden();

  await page.locator('#simDivers .seg').nth(1).click();   // 2 divers — 1 or 2 rooms
  await page.waitForTimeout(300);
  await expect(page.locator('.sim__roomsgroup')).toBeVisible();
});

test('the room count follows the party until it is chosen by hand', async ({ page }) => {
  await openSim(page);

  await page.locator('#simDivers .seg').nth(2).click();   // 3 divers -> Standard needs 2 rooms
  await page.waitForTimeout(250);
  await expect(roomSeg(page, 2)).toHaveClass(/is-on/);
  const twoStandardRooms = await total(page);

  await page.locator('#simRoom .sim__room').nth(1).click();   // Deluxe sleeps 4 — one room is enough
  await page.waitForTimeout(250);
  await expect(
    roomSeg(page, 1),
    'a room that is no longer needed must not stay in the price'
  ).toHaveClass(/is-on/);
  expect(await total(page)).toBeLessThan(twoStandardRooms);

  // But a count the visitor picked themselves is theirs to keep.
  await pickRooms(page, 2);
  await page.waitForTimeout(250);
  await page.locator('#simDivers .seg').nth(1).click();   // 2 divers
  await page.waitForTimeout(250);
  await expect(roomSeg(page, 2)).toHaveClass(/is-on/);
});

test('the breakdown adds up to the total shown', async ({ page }) => {
  await openSim(page);
  await page.locator('#simDivers .seg').nth(3).click();  // 4 divers
  await page.locator('#simRoom .sim__room').nth(2).click();    // suite
  await page.waitForTimeout(300);

  const amounts = await page.locator('#sim .sim__lines b').allInnerTexts();
  const summed = amounts.map(money).reduce((a, b) => a + b, 0);
  expect(summed, 'a total that disagrees with its own breakdown is worse than no breakdown')
    .toBe(await total(page));
});

test('the simulator speaks English on the English page', async ({ page }) => {
  await openSim(page, 'en');
  const text = await page.locator('#sim').innerText();
  expect(text, 'the widget writes its own labels after the i18n pass has run')
    .not.toMatch(/[぀-ヿ㐀-䶿一-鿿]/);

  // Not asserting on "Total": the phone layout drops that label for a booking
  // bar and would fail on wording that is correct. These are present in both
  // layouts and would each be a real defect if they went missing.
  expect(text, 'the control labels must be translated').toMatch(/People taking the course/);
  expect(text, 'the room grades must be translated').toMatch(/Up to \d+ people/);
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
  // Both controls are fieldsets now, so this must not assume a single legend.
  const legends = page.locator('#sim fieldset legend');
  await expect(legends).toHaveCount(2);
  for (let i = 0; i < 2; i++) await expect(legends.nth(i)).toHaveText(/\S/);
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

test('each room count shows how the party actually splits', async ({ page }) => {
  await openSim(page);
  await page.locator('#simDivers .seg').nth(2).click();   // 3 divers
  await page.waitForTimeout(300);

  // This replaced a two-line sentence explaining that a couple takes one room
  // and three friends might want three. Three people over two rooms is 2+1 —
  // showable, and it survives translation.
  // Only 2 and 3 can hold three people, and each states its own split.
  await expect(roomSeg(page, 2).locator('.seg__sub')).toHaveText('2+1');
  await expect(roomSeg(page, 3).locator('.seg__sub')).toHaveText('1+1+1');

  // And a room nobody sleeps in is never offered.
  await page.locator('#simDivers .seg').nth(1).click();   // 2 divers
  await page.waitForTimeout(300);
  await expect(page.locator('#simRooms .seg'),
    'two people cannot fill three rooms, so only 1 and 2 appear').toHaveCount(2);
});

test('both controls speak the same visual language', async ({ page }) => {
  await openSim(page);
  await page.locator('#simDivers .seg').nth(1).click();   // 2 divers, so rooms is a real choice
  await page.waitForTimeout(300);
  // They ask the same kind of question. Two different treatments for that was
  // the giveaway that the pair had never been designed together.
  const shape = (sel) => page.locator(sel).first().evaluate((el) => {
    const cs = getComputedStyle(el.closest('.seg__row'));
    return { cols: cs.gridTemplateColumns.split(' ').length, radius: cs.borderRadius };
  });
  const a = await shape('#simDivers .seg');
  const b = await shape('#simRooms .seg');
  expect(b.radius, 'same corner treatment').toBe(a.radius);
  expect(await page.locator('#simRooms .seg').count(), 'rooms render as segments too').toBe(2);
});
