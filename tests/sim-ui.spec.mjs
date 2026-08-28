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

test('the rooms show what an upgrade costs, never a hotel nightly rate', async ({ page }) => {
  await openSim(page);

  // The photograph is the point of the card; a broken one silently turns this
  // back into a list of three words.
  const loaded = await page.locator('#simRoom .sim__roomart').evaluateAll(
    (imgs) => imgs.map((i) => ({ src: i.getAttribute('src'), w: i.naturalWidth })));
  expect(loaded).toHaveLength(3);
  for (const im of loaded) expect(im.w, `image failed to load: ${im.src}`).toBeGreaterThan(0);

  // This is a package. A per-night hotel rate on the page is a figure the
  // reader can look up elsewhere and a reason to price the room separately —
  // and two of the three are estimates, so printing them states someone else's
  // rates as fact. The cards carry the cost of the upgrade instead.
  const sim = await page.locator('#sim').innerText();
  expect(sim, 'no nightly rate anywhere in the simulator').not.toMatch(/／泊|\/night|per night/i);

  const labels = await page.locator('#simRoom .sim__roomdelta').allInnerTexts();
  expect(labels).toHaveLength(3);
  // The cheapest says what it is rather than "—" or "₱0", which told the
  // reader nothing and read as a missing value.
  expect(labels[0].trim(), 'the base room names itself').toMatch(/\S/);
  expect(labels[0], 'and quotes no amount').not.toMatch(/₱/);
  for (const l of labels.slice(1)) expect(l, `an upgrade must be priced: "${l}"`).toMatch(/\+₱[\d,]+/);
  const ups = labels.slice(1).map(money);
  expect(ups.every((n) => n > 0), 'an upgrade that costs nothing is not an upgrade').toBe(true);
  expect(ups, 'dearer rooms cost more to upgrade to').toEqual([...ups].sort((a, b) => a - b));

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

  // The same promise on both courses, which is the reason it is not a percentage.
  await page.locator('#simCourse .seg:has(input[value="aow"])').click();
  await page.waitForTimeout(300);
  expect((await page.locator('#simDivers .seg__sub').allInnerTexts()).slice(1).map(money),
    'Advanced lists at a different rate but the discount is the same money')
    .toEqual(offs);
  await page.locator('#simCourse .seg:has(input[value="ow"])').click();
  await page.waitForTimeout(300);

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

test('a count the party cannot use is disabled, never removed', async ({ page }) => {
  await openSim(page);
  await page.locator('#simDivers .seg').nth(2).click();   // 3 divers, Standard sleeps 2
  await page.waitForTimeout(300);

  // An earlier version deleted the counts it judged unusable, and the row
  // silently changed length under the visitor. Booking.com and Expedia both
  // grey out at the bound instead; the row keeps its shape and the limit is
  // legible. Every count is always present.
  const counts = await page.locator('#simRooms .seg__n').allInnerTexts();
  expect(counts.map((c) => c.replace(/\D/g, '')), 'every count stays').toEqual(['1', '2', '3', '4']);
  await expect(roomSeg(page, 1), 'one Standard room cannot hold three').toHaveClass(/is-off/);
  await expect(roomSeg(page, 1).locator('input')).toBeDisabled();
  await expect(page.locator('#sim .sim__warn')).toBeHidden();

  // Disabled has to be visible, not just semantic. Until this was checked the
  // dead "1室" was pixel-identical to the live "3室".
  const dim = (n) => roomSeg(page, n).evaluate((el) => parseFloat(getComputedStyle(el).opacity));
  expect(await dim(1), 'the dead count must read as dead').toBeLessThan(await dim(3) - 0.3);
});

test('a room nobody would sleep in cannot be booked', async ({ page }) => {
  await openSim(page);

  // Every room needs an occupant. One diver in four rooms was reachable and
  // quoted ₱75,500 for one person to sleep in four beds — no booking product
  // permits it: Booking clamps rooms to the party size, Expedia creates each
  // room with a guest already in it.
  //
  // The control still appears, and every count is still drawn. Removing it was
  // the earlier mistake and this is not that: the question stays on the page,
  // the answers that cannot happen are greyed at the bound, exactly as the
  // too-small ones already were.
  await expect(page.locator('.sim__roomsgroup')).toBeVisible();
  await expect(page.locator('#simRooms .seg')).toHaveCount(4);
  await expect(roomSeg(page, 1), 'one diver, one room').toHaveClass(/is-on/);
  for (const n of [2, 3, 4]) {
    await expect(roomSeg(page, n), `${n} rooms for one diver is not a booking`)
      .toHaveClass(/is-off/);
    await expect(roomSeg(page, n).locator('input')).toBeDisabled();
  }

  // And a party that shrinks takes its room count down with it, rather than
  // leaving rooms it chose earlier sitting in the price.
  await page.locator('#simDivers .seg').nth(3).click();      // 4 divers
  await page.waitForTimeout(300);
  await pickRooms(page, 4);
  await page.waitForTimeout(300);
  const four = await total(page);
  await expect(roomSeg(page, 4)).toHaveClass(/is-on/);

  await page.locator('#simDivers .seg').nth(0).click();      // back to 1
  await page.waitForTimeout(300);
  await expect(roomSeg(page, 1), 'the count follows the party down').toHaveClass(/is-on/);
  expect(await total(page), 'and the rooms leave the price with it').toBeLessThan(four);
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
  // The count is deliberately not pinned: this test has now been broken twice by
  // adding a control, which says nothing about accessibility. What matters is
  // that every group has a label, however many groups there are.
  const legends = page.locator('#sim fieldset legend');
  const n = await legends.count();
  expect(n, 'the simulator asks at least one labelled question').toBeGreaterThan(0);
  for (let i = 0; i < n; i++) await expect(legends.nth(i)).toHaveText(/\S/);
  // Every radio group must be reachable as a group, not a loose row of inputs.
  for (const id of ['#simCourse', '#simDivers', '#simRooms']) {
    await expect(page.locator(`${id} input[type=radio]`).first(),
      `${id} is a radio group`).toHaveCount(1);
    await expect(page.locator(`${id}`).locator('xpath=ancestor::fieldset[1]/legend'),
      `${id} carries a legend`).toHaveText(/\S/);
  }
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

test('the room segments carry a number and nothing else', async ({ page }) => {
  await openSim(page);
  await page.locator('#simDivers .seg').nth(2).click();   // 3 divers
  await page.waitForTimeout(300);

  // The second line here used to hold a derived value — the party split, and
  // for an unoccupied room the invented phrase "1室あまり". No booking product
  // anywhere annotates an empty room, because they all prevent the state
  // instead; and Carbon reserves the slot under a number input for constraints,
  // not for derived data. The slot is gone. The line below asserts that, and it
  // is the one thing that stops the label coming back.
  await expect(page.locator('#simRooms .seg__sub')).toHaveCount(0);
  for (const n of [1, 2, 3]) {
    await expect(roomSeg(page, n).locator('span')).toHaveCount(1);
  }

  // The summary line is still there, but which one depends on the viewport, and
  // pinning the desktop element made this fail on a phone for a reason that had
  // nothing to do with room segments. On a wide screen the card states the
  // configuration ("3名・スタンダード2室"); on the booking bar, where there is
  // room for one line and the reader is deciding, it states the per-head price
  // instead. Exactly one is on screen, and it carries a figure either way.
  const short = page.locator('#sim .sim__short');
  const perbar = page.locator('#sim .sim__perbar');
  const shown = (await short.isVisible()) ? short : perbar;
  await expect(shown, 'one summary line is always on screen').toBeVisible();
  await expect(await short.isVisible(), 'and only one of them').not.toBe(await perbar.isVisible());
  await expect(shown, 'the summary carries a number').toHaveText(/\d/);
});

test('both controls speak the same visual language', async ({ page }) => {
  await openSim(page);
  await page.locator('#simDivers .seg').nth(1).click();   // 2 divers, so rooms is a real choice
  await page.waitForTimeout(300);
  // They ask the same kind of question. Two different treatments for that was
  // the giveaway that the pair had never been designed together.
  const shape = (sel) => page.locator(sel).first().evaluate((el) => {
    const cs = getComputedStyle(el.closest('.seg__row'));
    return { cols: cs.gridTemplateColumns.split(' ').map(parseFloat), radius: cs.borderRadius };
  });
  const a = await shape('#simDivers .seg');
  const b = await shape('#simRooms .seg');
  expect(b.radius, 'same corner treatment').toBe(a.radius);

  // Each row must have exactly as many tracks as it has options. The rule was
  // hardcoded to repeat(4), so the three-option rooms row rendered a fourth,
  // empty track — which read as "3" being twice the width of "1". A row that
  // silently grows a phantom column is the same defect class as a control that
  // silently drops an option.
  for (const [sel, row] of [['#simDivers .seg', '#simDivers'], ['#simRooms .seg', '#simRooms']]) {
    const n = await page.locator(sel).count();
    const cols = (await shape(sel)).cols;
    expect(cols.length, `${row}: one track per option`).toBe(n);
    // Equal width, to within a rounding pixel — Carbon's rule for segmented rows.
    expect(Math.max(...cols) - Math.min(...cols), `${row}: tracks are equal`).toBeLessThan(1.5);
  }
});

test('the card describes the course it is quoting', async ({ page }) => {
  await openSim(page);

  // Advanced used to be a separate collapsed card. Folding it into the
  // simulator means the title, the tagline and the spec sheet are no longer
  // fixed text — and the failure that buys is silent and expensive: an
  // Advanced price sitting under "18mまで / 10歳以上", promising a shallower,
  // younger-eligible course than the one being sold.
  const course = (id) => page.locator(`#simCourse .seg:has(input[value="${id}"])`);
  await expect(course('ow'), 'Open Water is the default').toHaveClass(/is-on/);

  const spec = () => page.locator('#simSpec').innerText();
  const name = () => page.locator('#simCourseName').innerText();

  expect(await spec()).toContain('18m');
  expect(await name()).toContain('オープンウォーター');
  const owTotal = await total(page);

  await course('aow').click();
  await page.waitForTimeout(300);
  await expect(course('aow')).toHaveClass(/is-on/);

  const aowSpec = await spec();
  expect(aowSpec, 'the depth follows the course').toContain('30m');
  expect(aowSpec, 'the old depth must not linger').not.toContain('18m');
  expect(aowSpec, 'Advanced states its prerequisite').toContain('オープンウォーター');
  expect(await name()).toContain('アドバンス');
  expect(await total(page), 'Advanced is priced differently').not.toBe(owTotal);

  // And back, so the card is not a one-way door.
  await course('ow').click();
  await page.waitForTimeout(300);
  expect(await spec()).toContain('18m');
  expect(await total(page)).toBe(owTotal);
});

test('the group discount applies to Advanced too', async ({ page }) => {
  await openSim(page);
  await page.locator('#simCourse .seg:has(input[value="aow"])').click();
  await page.waitForTimeout(300);
  const one = await total(page);
  await page.locator('#simDivers .seg').nth(1).click();   // 2 divers
  await page.waitForTimeout(300);
  const two = await total(page);
  expect(two, 'two divers cost more in total').toBeGreaterThan(one);
  // The whole promise of the ladder: the second diver is cheaper than the first.
  expect(two - one, 'the second diver pays less than the first').toBeLessThan(one);
});
