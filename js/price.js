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
    aow: 28000,   // Advanced Open Water
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

  /* Group discount: 5% off the diving rate for each diver past the first.
     Not generosity — arithmetic. The boat, the divemaster and the fuel are
     billed per booking (₱12,000) and do not grow with headcount, so a bigger
     party genuinely costs less per head. This hands that saving back at
     roughly the rate it appears, which is why the margin per diver stays flat
     (₱19-21k) while the total climbs. Rooms are excluded: a room does not get
     cheaper because more people came. */
  groupDiscountPerExtraDiver: 0.05,
  maxGroupDiscount: 0.15,

  /* On the resort's statement every time. The Saturday itinerary leaves Manila
     before dawn and reaches the room long before check-in opens, so this is not
     an upgrade anyone declines — it was simply being absorbed instead of
     quoted, at ₱2,750 a room on every booking. */
  earlyCheckIn: 2750,

  nights: 1,          // the weekend is one night, two days
};

/** 0 for a solo diver, then 5% per extra head up to the cap. */
export function groupDiscount(divers) {
  return Math.min(Math.max(divers - 1, 0) * PRICING.groupDiscountPerExtraDiver,
                  PRICING.maxGroupDiscount);
}

/**
 * @param {object} sel
 * @param {number} sel.divers      how many people take the course
 * @param {string} sel.roomId      which grade
 * @param {number} sel.rooms       how many of that room
 * @param {string} sel.course      'ow' | 'aow'
 */
export function quote(sel) {
  const room = PRICING.rooms.find(r => r.id === sel.roomId);
  if (!room) throw new Error(`unknown room: ${sel.roomId}`);

  const capacity = room.maxOccupancy * sel.rooms;
  const listRate = PRICING.course[sel.course] + PRICING.perDiver.gear + PRICING.perDiver.boatAndPass
                 + (sel.divers === 1 ? PRICING.soloLoading : 0);
  const discount = groupDiscount(sel.divers);
  const perDiver = Math.round(listRate * (1 - discount));

  const courseTotal = perDiver * sel.divers;

  // Heads above two in a room cost extra at the resort. Spread the divers as
  // evenly as the rooms allow, then charge for whoever is the third or fourth
  // in a room — matching how the resort prices occupancy, not per body.
  const perRoom = Math.ceil(sel.divers / sel.rooms);
  const extraHeadsPerRoom = Math.max(0, Math.min(perRoom, room.maxOccupancy) - 2);
  const roomNightly = room.nightly + room.extraPerHead * extraHeadsPerRoom;
  const roomTotal = (roomNightly * PRICING.nights + PRICING.earlyCheckIn) * sel.rooms;

  const total = courseTotal + roomTotal;

  return {
    fitsCapacity: sel.divers <= capacity,
    capacity,
    lines: [
      { key: 'course', qty: sel.divers, unit: perDiver,       amount: courseTotal },
      { key: 'room',   qty: sel.rooms,  unit: roomNightly + PRICING.earlyCheckIn, amount: roomTotal },
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
