import { test, expect } from '@playwright/test';
import { PRICING, quote, groupDiscount } from '../js/price.js';

/**
 * The quote is the number a visitor decides on, so it is checked as arithmetic
 * rather than by looking at the page. Every expectation below is written out
 * longhand — recomputing the total with the same expression the code uses would
 * only prove the code agrees with itself.
 */

const OW = PRICING.course.ow;                              // 30,000
const PER = OW + PRICING.perDiver.gear + PRICING.perDiver.boatAndPass; // 37,500

test('one diver, cheapest room — the default the page opens on', () => {
  const q = quote({ divers: 1, roomId: 'standard', rooms: 1, course: 'ow' });
  // 37,500 course + 5,000 solo + (5,500 room + 2,750 early check-in)
  expect(q.total).toBe(50750);
  expect(q.perPerson).toBe(50750);
  expect(q.fitsCapacity).toBe(true);
});

test('diving alone costs more per head, and says so in the rate, not a mystery line', () => {
  const solo = quote({ divers: 1, roomId: 'standard', rooms: 1, course: 'ow' });
  const pair = quote({ divers: 2, roomId: 'standard', rooms: 1, course: 'ow' });

  // The loading used to be its own line called "diving alone", which read as an
  // unexplained charge and then disappeared when a second diver was added. It
  // belongs in the rate: the boat is a fixed cost, so sharing it is the story.
  expect(solo.lines.map(l => l.key), 'the breakdown keeps its shape at any headcount')
    .toEqual(pair.lines.map(l => l.key));

  const rate = (q) => q.lines.find(l => l.key === 'course').unit;
  expect(rate(solo), 'the solo rate carries the whole boat').toBe(42500);
  expect(rate(pair), 'two divers split it, less the ₱2,000 group discount').toBe(35500);

  // 35,500 x2 + (5,500 room + 2,750 early check-in)
  expect(pair.total).toBe(79250);
  expect(pair.perPerson).toBeLessThan(solo.perPerson);
});

test('a room is charged per room, not per person', () => {
  const one = quote({ divers: 2, roomId: 'standard', rooms: 1, course: 'ow' });
  const two = quote({ divers: 2, roomId: 'standard', rooms: 2, course: 'ow' });
  // Early check-in is billed per room too — the resort charges it on each key.
  expect(two.total - one.total).toBe(PRICING.rooms[0].nightly + PRICING.earlyCheckIn);
});

test('every room quote carries the early check-in the resort always bills', () => {
  // It appears on the statement every time and used to be absorbed silently,
  // which cost ₱2,750 a room on every booking.
  for (const rooms of [1, 2]) {
    const q = quote({ divers: 2, roomId: 'standard', rooms, course: 'ow' });
    const room = q.lines.find((l) => l.key === 'room');
    expect(room.unit, 'the per-room unit includes the early check-in')
      .toBe(PRICING.rooms[0].nightly + PRICING.earlyCheckIn);
    expect(room.amount).toBe(room.unit * rooms);
  }
});

test('the room rates are the ones on the resort statement', () => {
  // Standard is measured, not derived: ₱8,250 accommodation − ₱2,750 early
  // check-in. If this ever drifts back to a rounded guess, the margin goes with it.
  expect(PRICING.rooms.find((r) => r.id === 'standard').nightly).toBe(5500);
  expect(PRICING.earlyCheckIn).toBe(2750);
});

test('third and fourth heads in a room cost the resort surcharge', () => {
  const two   = quote({ divers: 2, roomId: 'deluxe', rooms: 1, course: 'ow' });
  const three = quote({ divers: 3, roomId: 'deluxe', rooms: 1, course: 'ow' });
  const four  = quote({ divers: 4, roomId: 'deluxe', rooms: 1, course: 'ow' });

  const rate = (n) => PER - groupDiscount(n);
  const room = (extraHeads) => 8750 + 900 * extraHeads + PRICING.earlyCheckIn;
  expect(two.total).toBe(rate(2) * 2 + room(0));
  expect(three.total).toBe(rate(3) * 3 + room(1));   // one head above double
  expect(four.total).toBe(rate(4) * 4 + room(2));    // two heads above double
});

test('capacity is reported, never silently exceeded', () => {
  const overfull = quote({ divers: 3, roomId: 'standard', rooms: 1, course: 'ow' });
  expect(overfull.capacity).toBe(2);
  expect(overfull.fitsCapacity, 'three people do not fit one standard room').toBe(false);

  const ok = quote({ divers: 3, roomId: 'standard', rooms: 2, course: 'ow' });
  expect(ok.fitsCapacity).toBe(true);
});

test('grades are ordered and the ratios match the resort listing', () => {
  const [std, dlx, suite] = PRICING.rooms;
  expect(std.nightly).toBeLessThan(dlx.nightly);
  expect(dlx.nightly).toBeLessThan(suite.nightly);
  // Casa Escondida listing: 5,211 / 8,294 / 11,059 -> 1.00 / 1.59 / 2.12,
  // anchored on the Standard rate the statement actually confirms.
  expect(dlx.nightly / std.nightly).toBeCloseTo(1.59, 1);
  expect(suite.nightly / std.nightly).toBeCloseTo(2.12, 1);
});

test('the total is the sum of its own breakdown', () => {
  for (const roomId of ['standard', 'deluxe', 'suite']) {
    for (const divers of [1, 2, 3, 4]) {
      const q = quote({ divers, roomId, rooms: 2, course: 'ow' });
      const summed = q.lines.reduce((s, l) => s + l.amount, 0);
      expect(summed, `${roomId} / ${divers} divers`).toBe(q.total);
    }
  }
});

test('the price never goes down when you add a person or a room', () => {
  for (const roomId of ['standard', 'deluxe', 'suite']) {
    let prev = 0;
    for (const divers of [1, 2, 3, 4]) {
      const q = quote({ divers, roomId, rooms: 2, course: 'ow' });
      // Solo carries a surcharge, so 1 -> 2 is the one step allowed to fall.
      if (divers > 2) expect(q.total, `${roomId} ${divers}`).toBeGreaterThan(prev);
      prev = q.total;
    }
  }
});

test('the group discount is money, not a percentage', () => {
  // Percent was replaced by pesos so the two courses stop printing two amounts
  // for one promise: 5% of the Open Water rate is ₱1,875 and of Advanced
  // ₱1,775, and the amount is what the page now shows.
  expect(groupDiscount(1), 'a solo diver has nobody to share with').toBe(0);
  expect(groupDiscount(2)).toBe(2000);
  expect(groupDiscount(3)).toBe(6000);
  expect(groupDiscount(4)).toBe(8000);
  expect(groupDiscount(9), 'past the largest party it goes flat, never further').toBe(8000);

  // Same money off whichever course is selected.
  const off = (course, divers) => {
    const q = quote({ divers, roomId: 'deluxe', rooms: 1, course });
    return PRICING.course[course] + PRICING.perDiver.gear + PRICING.perDiver.boatAndPass
         - q.lines.find((l) => l.key === 'course').unit;
  };
  for (const n of [2, 3, 4]) expect(off('aow', n), `₱ off is the same on both courses at ${n}`)
    .toBe(off('ow', n));
});

test('recruiting one more friend never costs the group more than the last one did', () => {
  // The defect this exists for shipped and was found by hand, not by a test.
  // Under a flat 5%-per-head ladder the THIRD diver was the most expensive one
  // to add — ₱30,000 against ₱28,750 for the second — because the solo loading
  // falls away at two and hands the second head a boost the third never gets.
  // A ladder that makes each additional friend dearer than the last is arguing
  // against the thing it was built to encourage, and nothing was watching.
  const groupPays = (n) => quote({ divers: n, roomId: 'deluxe', rooms: 1, course: 'ow' })
    .lines.find((l) => l.key === 'course').amount;

  let previous = Infinity;
  for (const n of [2, 3, 4]) {
    const marginal = groupPays(n) - groupPays(n - 1);
    expect(marginal, `adding diver ${n} must not cost more than adding ${n - 1}`)
      .toBeLessThanOrEqual(previous);
    previous = marginal;
  }
});

test('every extra diver still earns money at the real costs', () => {
  // From the Casa Escondida statement, corrected by the owner on 2026-08-26:
  // the Anilao transfer is ₱6,000 return rather than ₱3,000 of fuel, and every
  // meal sits inside the room rate rather than being charged per head.
  // ₱9,050 follows each diver, ₱15,000 is charged once per booking however
  // many go. A discount that outruns those is a discount that loses money.
  const PER_DIVER_COST = 9050;
  const PER_BOOKING_COST = 15000;

  let prevMargin = -Infinity;
  for (const divers of [1, 2, 3, 4]) {
    const q = quote({ divers, roomId: 'standard', rooms: Math.ceil(divers / 2), course: 'ow' });
    const diving = q.lines.find((l) => l.key === 'course').amount;
    const margin = diving - (PER_DIVER_COST * divers + PER_BOOKING_COST);

    expect(margin, `${divers} divers must not lose money`).toBeGreaterThan(0);
    expect(margin, `${divers} divers must beat ${divers - 1}`).toBeGreaterThan(prevMargin);
    prevMargin = margin;
  }
});

test('the discount never touches the room', () => {
  // Rooms do not get cheaper because more people came; only the shared boat,
  // divemaster and fuel do.
  const one = quote({ divers: 1, roomId: 'deluxe', rooms: 1, course: 'ow' });
  const four = quote({ divers: 4, roomId: 'deluxe', rooms: 1, course: 'ow' });
  const room = (q) => q.lines.find((l) => l.key === 'room');
  expect(four.discount).toBeGreaterThan(0);
  expect(room(four).unit, 'the nightly rate is not discounted')
    .toBeGreaterThanOrEqual(room(one).unit);
});
