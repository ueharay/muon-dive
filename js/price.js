/* =====================================================================
   Price simulator — one all-in number for the Open Water weekend.

   WHY A SIMULATOR AND NOT A SINGLE PRICE
   An earlier attempt at "all inclusive, one price" was abandoned because the
   booking has two different billing units: the course is charged per PERSON
   and the room per ROOM. Any single figure had to assume an occupancy, and was
   wrong for everyone who didn't match it. Letting the visitor pick the
   combination is what makes one honest number possible.

   EVERY NUMBER BELOW HAS A SOURCE. Do not add one that doesn't.
   ===================================================================== */

export const PRICING = {
  /* Course fee, per person. Published on this site today. */
  course: {
    ow:  30000,   // Open Water
    aow: 30000,   // Advanced Open Water
  },

  /* Per person, for the whole two days. Published on this site today as
     "not included": gear rental + tanks, and the boat / fuel / dive pass.
     2,500 is the midpoint of the 2,000-3,000 range shown for the latter. */
  perDiver: {
    gear: 5000,
    boatAndPass: 2500,
  },

  /* Solo loading.
     Derived, not invented: the boat (₱6,000) and the jeepney (₱1,750 each way,
     ₱3,500 return) are billed PER VEHICLE and do not scale with headcount.
     Two divers split them; one diver carries them alone. The difference is
     6,000/2 + 3,500/2 = 4,750; rounded up to a round number by the owner.
     Recorded costs are in Learning.md.

     This is folded into the per-diver RATE rather than shown as its own line.
     As a line item called "diving alone" it read as a mystery charge that also
     vanished when a second person was added — two confusing events for one
     simple fact. As a rate, the breakdown keeps the same shape at every
     headcount and the story it tells is the true one: the boat is a fixed
     cost, so the more people share it, the less each pays. */
  soloLoading: 5000,

  /* Rooms, per room per night.
     Standard is the REAL figure from the resort's statement of 27-28 Jun 2026:
     ₱8,250 accommodation less the ₱2,750 early check-in = ₱5,500 a night.
     Deluxe and Suite are still ESTIMATES — that statement covers a Standard
     only, so their ratios come from the resort's public listing
     (5,211 / 8,294 / 11,059 -> 1.00 / 1.59 / 2.12) anchored on the confirmed
     ₱5,500. Replace them the moment a statement for either grade appears.
     Rooms above double occupancy cost more at the resort too (Deluxe 8,294 ->
     10,137 at four adults, +22%); extraPerHead carries that. */
  rooms: [
    { id: 'standard', maxOccupancy: 2, nightly: 5500,  extraPerHead: 0    },
    { id: 'deluxe',   maxOccupancy: 4, nightly: 8750,  extraPerHead: 900  },
    { id: 'suite',    maxOccupancy: 4, nightly: 11650, extraPerHead: 900  },
  ],

  /* Group discount, off the diving rate only — a room does not get cheaper
     because more people came.

     The boat, the divemaster, the fuel and the transfer are billed per booking
     (₱15,000) and do not grow with headcount, so a bigger party genuinely
     costs less per head. Handing that back is arithmetic, not generosity.

     The ladder is deliberately uneven. A flat 5% per extra head made the THIRD
     diver the most expensive one to add — ₱30,000 against ₱28,750 for the
     second, because the solo loading falls away at two and gives the second
     head a boost the third never gets. That is backwards: a party of four is
     rare, a third friend is the one recruitment that actually happens. The
     jump is at three now, and the fourth costs the group the same as the
     third rather than more.

     Four is close to free in expectation precisely because it is rare, and it
     buys the headline. Two stays small: couples and friend-pairs have already
     decided to come as a pair, so a deeper cut there changes no behaviour and
     simply gives money away on the most common booking.

     Stated in pesos, not percent, for two reasons. A percentage of a rate the
     visitor has not been shown is not a number anyone can feel — "5% OFF"
     against "₱2,000 OFF" is the same money and reads half as loud. And the
     two courses list at different rates, so one percentage produced two
     different amounts (₱1,875 on Open Water, ₱1,775 on Advanced) — untidy the
     moment the amount is what's printed. A flat peso figure is the same
     promise on both. */
  groupDiscountByDivers: { 1: 0, 2: 2000, 3: 6000, 4: 8000 },

  /* On the resort's statement every time. The Saturday itinerary leaves Manila
     before dawn and reaches the room long before check-in opens, so this is not
     an upgrade anyone declines — it was simply being absorbed instead of
     quoted, at ₱2,750 a room on every booking. */
  earlyCheckIn: 2750,

  nights: 1,          // the weekend is one night, two days
};

/** Pesos off each diver's rate. 0 for a solo diver; flat past the largest party. */
export function groupDiscount(divers) {
  const table = PRICING.groupDiscountByDivers;
  const largest = Math.max(...Object.keys(table).map(Number));
  return table[Math.min(Math.max(divers, 1), largest)] ?? 0;
}

/**
 * @param {object} sel
 * @param {number} sel.divers      how many people take the course
 * @param {string} sel.roomId      which grade
 * @param {number} sel.rooms       how many of that room
 * @param {string} sel.course      'ow' | 'aow'
 */
export function quote(sel) {
  const roomId = sel.roomId || 'standard';
  const roomsCount = sel.rooms || 1;
  const room = PRICING.rooms.find(r => r.id === roomId);
  if (!room) throw new Error(`unknown room: ${roomId}`);

  const capacity = room.maxOccupancy * roomsCount;
  const listRate = PRICING.course[sel.course] + PRICING.perDiver.gear + PRICING.perDiver.boatAndPass
                 + (sel.divers === 1 ? PRICING.soloLoading : 0);
  const discount = groupDiscount(sel.divers);          // pesos off each diver
  const perDiver = listRate - discount;

  const courseTotal = perDiver * sel.divers;

  // Heads above two in a room cost extra at the resort. Spread the divers as
  // evenly as the rooms allow, then charge for whoever is the third or fourth
  // in a room — matching how the resort prices occupancy, not per body.
  const perRoom = Math.ceil(sel.divers / roomsCount);
  const extraHeadsPerRoom = Math.max(0, Math.min(perRoom, room.maxOccupancy) - 2);
  const roomNightly = room.nightly + room.extraPerHead * extraHeadsPerRoom;
  const roomTotal = (roomNightly * PRICING.nights + PRICING.earlyCheckIn) * roomsCount;

  const total = courseTotal + roomTotal;

  const otherUnit = PRICING.perDiver.gear + PRICING.perDiver.boatAndPass
                  + (sel.divers === 1 ? PRICING.soloLoading : 0);
  const tuitionUnit = perDiver - otherUnit;
  const tuitionTotal = tuitionUnit * sel.divers;
  const otherTotal = otherUnit * sel.divers;

  return {
    fitsCapacity: sel.divers <= capacity,
    capacity,
    tuitionUnit,
    tuitionTotal,
    otherUnit,
    otherTotal,
    lines: [
      { key: 'course', qty: sel.divers, unit: perDiver,       amount: courseTotal },
      { key: 'room',   qty: roomsCount, unit: roomNightly + PRICING.earlyCheckIn, amount: roomTotal },
    ],
    breakdown: [
      { key: 'tuition', qty: sel.divers, unit: tuitionUnit, amount: tuitionTotal },
      { key: 'other',   qty: sel.divers, unit: otherUnit,   amount: otherTotal },
      { key: 'room',    qty: roomsCount, unit: roomNightly + PRICING.earlyCheckIn, amount: roomTotal },
    ],
    discount,
    listRate,
    saved: (listRate - perDiver) * sel.divers,
    total,
    perPerson: Math.round(total / sel.divers),
  };
}

// Also hung on window so the widget in main.js can reach it without being a
// module itself. The package is type:module, so this file is ESM either way.
if (typeof window !== 'undefined') { window.ZEN_PRICING = PRICING; window.ZEN_QUOTE = quote; }
