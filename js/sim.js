/* =====================================================================
   Price simulator widget.

   Text here is NOT translated by the i18n pass in main.js: that runs once at
   load and walks static text nodes, and everything below is written after it
   and rewritten on every click. So the widget renders its own labels for the
   current language and re-renders when the language changes.
   ===================================================================== */
import { PRICING, quote, groupDiscount } from './price.js';

const ROOM_ART = {
  standard: { src: 'assets/img/stay-standard.jpg', alt: { ja: '間接照明のきいた、ベッドが一台の落ち着いた客室', en: 'A calm room with one bed and soft lighting' } },
  deluxe:   { src: 'assets/img/stay-room.jpg',     alt: { ja: '海に面したバルコニー付きの、ベッドが二台並んだ客室', en: 'A room with two beds and a balcony facing the sea' } },
  suite:    { src: 'assets/img/stay-suite.jpg',    alt: { ja: '大きな窓の向こうに海とヤシの木が見える、広めの客室', en: 'A larger room, sea and palms beyond a wide window' } },
};

const L = {
  ja: {
    heading: '料金シミュレーター',
    total: '合計（1泊2日・すべて込み）',
    per: (n) => `お一人あたり ${money(n)}`,
    divers: '講習を受ける人数',
    room: '部屋',
    rooms: '借りる部屋の数',
    people: (n) => `${n}名`,
    roomCount: (n) => `${n}室`,
    caps: { standard: 'スタンダード', deluxe: 'デラックス', suite: 'スイート 海側' },
    capacity: (n) => `定員${n}名`,
    perNight: '／泊',
    each: (n) => `${money(n)}／人`,
    overCapacity: (cap) => `この組み合わせでは${cap}名までです。部屋数を増やしてください。`,
    lines: {
      course: 'ダイビング（講習・器材・ボート・送迎・食事）',
      room: '宿泊',
    },
    unitEach: (q, u) => `${q} × ${money(u)}`,
    summary: (d, r, n) => `${d}名・${r}${n}室・すべて込み`,
    off: (pct) => `${pct}%OFF`,
    baseRate: '基本料金',
    perRoom: (parts) => parts.join('+'),
    saved: (n) => `${money(n)} おトク`,
    inclTitle: '潜るのに必要なものは、すべて込み',
    exclTitle: '含まれないもの',
    excl: ['お酒などのドリンク', '個人的なお買い物'],
    incl: ['PADI講習料・教材・認定申請料',
           '器材一式のレンタル',
           'タンク',
           'ボート・燃料・ダイブパス',
           'マニラ⇄アニラオの往復送迎',
           '朝・昼・晩の食事',
           '宿泊（選んだ部屋）'],
    note: '潜るために必要なものは、この金額にすべて入っています。現地でのお支払いは、お酒などご自身のぶんだけです。',
  },
  en: {
    heading: 'Price simulator',
    total: 'Total — two days, everything in',
    per: (n) => `${money(n)} each`,
    divers: 'People taking the course',
    room: 'Room',
    rooms: 'Number of rooms',
    people: (n) => `${n}`,
    roomCount: (n) => `${n}`,
    caps: { standard: 'Standard', deluxe: 'Deluxe', suite: 'Suite, sea view' },
    capacity: (n) => `Up to ${n} people`,
    perNight: '/night',
    each: (n) => `${money(n)} each`,
    overCapacity: (cap) => `That combination sleeps ${cap}. Add a room.`,
    lines: {
      course: 'Diving — tuition, gear, boat, transfers, meals',
      room: 'Room',
    },
    unitEach: (q, u) => `${q} × ${money(u)}`,
    summary: (d, r, n) => `${d} · ${r} x${n} · all in`,
    off: (pct) => `${pct}% off`,
    baseRate: 'Base rate',
    perRoom: (parts) => parts.join('+'),
    saved: (n) => `${money(n)} saved`,
    inclTitle: 'Everything the diving needs — included',
    exclTitle: 'Not included',
    excl: ['Drinks at the bar', 'Anything personal'],
    incl: ['PADI tuition, materials and the certification fee',
           'Full gear rental',
           'Tanks',
           'Boat, fuel and the dive pass',
           'Manila ⇄ Anilao transfers',
           'Breakfast, lunch and dinner',
           'The room you picked'],
    note: 'Everything the diving needs is in this figure. The only thing you pay for on site is your own bar tab.',
  },
};

function money(n) { return '₱' + n.toLocaleString('en-US'); }
function lang() { return document.documentElement.getAttribute('data-lang') === 'en' ? 'en' : 'ja'; }

const state = { divers: 1, roomId: 'standard', rooms: 1, course: 'ow' };
// Until the visitor picks a room count themselves, it follows the party and the
// room grade. Without this, choosing 3 divers in a Standard forces 2 rooms, and
// then switching to a Deluxe that sleeps 4 leaves the second room — and its
// price — sitting there for no reason anyone asked for.
let roomsPinned = false;

function chip(label, sub, active, onClick, disabled) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'sim__chip' + (active ? ' is-on' : '') + (disabled ? ' is-off' : '');
  b.setAttribute('aria-pressed', String(active));
  if (disabled) b.disabled = true;
  b.innerHTML = sub ? `${label}<i>${sub}</i>` : label;
  if (!disabled) b.addEventListener('click', onClick);
  return b;
}

function render(root) {
  const t = L[lang()];
  const q = quote(state);

  root.querySelector('.sim__label').textContent = t.total;
  const totalEl = root.querySelector('.sim__total');
  const next = money(q.total);
  if (totalEl.textContent !== next) {
    totalEl.textContent = next;
    // Restart the flash: without removing the class first the animation only
    // ever plays once, and a total that changes silently reads as a page that
    // didn't register the click.
    totalEl.classList.remove('is-changed');
    void totalEl.offsetWidth;
    totalEl.classList.add('is-changed');
  }
  root.querySelector('.sim__per').textContent = t.per(q.perPerson);
  const savedEl = root.querySelector('.sim__saved');
  savedEl.textContent = q.saved ? t.saved(q.saved) : '';
  savedEl.hidden = !q.saved;
  root.querySelector('.sim__note').textContent = t.note;
  root.querySelector('.sim__short').textContent =
    t.summary(state.divers, t.caps[state.roomId], state.rooms);

  const legends = root.querySelectorAll('.sim__legend');
  legends[0].textContent = t.divers;
  legends[1].textContent = t.room;
  legends[2].textContent = t.rooms;

  const fill = (sel, nodes) => {
    const box = root.querySelector(sel);
    box.replaceChildren(...nodes);
  };

  // Just the number. Per-head prices on these chips read as errors: three
  // divers need two standard rooms, so 3 showed a HIGHER per-head figure than
  // 4, and the whole row shifted whenever the room grade changed. The card
  // states the per-person price for what is actually selected, which is the
  // only one that is ever true.
  // A segmented control, built as a radio group. Apple's HIG names the bug this
  // replaces directly: "it doesn't look good if content fills some segments but
  // not others" — the discount label was deciding each segment's width, so "1"
  // collapsed to an egg beside three wide pills. Every segment now renders both
  // lines and the base option says what it is rather than sitting empty.
  fill('#simDivers', [1, 2, 3, 4].map(n => {
    const pct = Math.round(groupDiscount(n) * 100);
    const on = state.divers === n;
    const label = document.createElement('label');
    label.className = 'seg' + (on ? ' is-on' : '');
    label.innerHTML =
      `<input type="radio" name="simDivers" value="${n}"${on ? ' checked' : ''}>` +
      `<span class="seg__n">${t.people(n)}</span>` +
      `<span class="seg__sub">${pct ? t.off(pct) : t.baseRate}</span>`;
    label.querySelector('input').addEventListener('change', () => {
      state.divers = n; autoRooms(); render(root);
    });
    return label;
  }));

  // Rooms are cards with the actual photograph and their own nightly rate.
  // Absolute prices, the way a hotel list shows them: a delta reads fine on the
  // upgrades but forces the cheapest card to describe itself as an absence.
  fill('#simRoom', PRICING.rooms.map(r => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sim__room' + (state.roomId === r.id ? ' is-on' : '');
    b.setAttribute('aria-pressed', String(state.roomId === r.id));
    const art = ROOM_ART[r.id];

    b.innerHTML =
      `<img class="sim__roomart" src="${art.src}" alt="${art.alt[lang()]}" loading="lazy" decoding="async">` +
      `<span class="sim__roomname">${t.caps[r.id]}</span>` +
      `<span class="sim__roommeta">${t.capacity(r.maxOccupancy)}</span>` +
      `<span class="sim__roomdelta">${money(r.nightly)}${t.perNight}</span>`;
    b.addEventListener('click', () => { state.roomId = r.id; autoRooms(); render(root); });
    return b;
  }));

  // Counts that cannot hold the party are disabled rather than left clickable
  // and then scolded — the same thing a hotel site does with a sold-out room.
  const maxOcc = PRICING.rooms.find(r => r.id === state.roomId).maxOccupancy;
  const minRooms = Math.ceil(state.divers / maxOcc);
  fill('#simRooms', [1, 2, 3].map(n => {
    // Spread the party the way the price already assumes: evenly, remainder to
    // the earlier rooms. A room nobody sleeps in is not an option worth paying
    // for, so those combinations are disabled rather than priced.
    const base = Math.floor(state.divers / n), rem = state.divers % n;
    const parts = Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
    const empty = parts.some((x) => x === 0);
    const off = n < minRooms || empty;

    const on = state.rooms === n;
    const label = document.createElement('label');
    label.className = 'seg' + (on ? ' is-on' : '') + (off ? ' is-off' : '');
    label.innerHTML =
      `<input type="radio" name="simRooms" value="${n}"${on ? ' checked' : ''}${off ? ' disabled' : ''}>` +
      `<span class="seg__n">${t.roomCount(n)}</span>` +
      `<span class="seg__sub">${off ? '—' : t.perRoom(parts)}</span>`;
    if (!off) label.querySelector('input').addEventListener('change', () => {
      state.rooms = n; roomsPinned = true; render(root);
    });
    return label;
  }));

  // Breakdown. Shown, not hidden behind a toggle — the whole point of one
  // number is that the visitor can see what is inside it.
  const lines = root.querySelector('.sim__lines');
  lines.replaceChildren(...q.lines.map(l => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${t.lines[l.key]}</span><i>${t.unitEach(l.qty, l.unit)}</i><b>${money(l.amount)}</b>`;
    return li;
  }));

  // The preview is the thing being configured. It changes the moment the
  // choice does, which is what makes a configurator feel like it is showing
  // you your booking rather than quoting you a list.
  const room = PRICING.rooms.find(r => r.id === state.roomId);
  const art = ROOM_ART[state.roomId];
  const pv = root.querySelector('.sim__previewart');
  if (pv.getAttribute('src') !== art.src) pv.setAttribute('src', art.src);
  pv.setAttribute('alt', art.alt[lang()]);
  root.querySelector('.sim__previewname').textContent = t.caps[room.id];
  root.querySelector('.sim__previewmeta').textContent = t.capacity(room.maxOccupancy);
  root.querySelector('.sim__previewrate').textContent = money(room.nightly) + t.perNight;

  const incl = root.querySelector('.sim__incl');
  incl.replaceChildren(...[
    Object.assign(document.createElement('li'), { className: 'sim__incltitle', textContent: t.inclTitle }),
    ...t.incl.map((x) => Object.assign(document.createElement('li'), { textContent: x })),
  ]);

  const excl = root.querySelector('.sim__excl');
  excl.replaceChildren(...[
    Object.assign(document.createElement('li'), { className: 'sim__incltitle', textContent: t.exclTitle }),
    ...t.excl.map((x) => Object.assign(document.createElement('li'), { textContent: x })),
  ]);

  const warn = root.querySelector('.sim__warn');
  warn.textContent = q.fitsCapacity ? '' : t.overCapacity(q.capacity);
  warn.hidden = q.fitsCapacity;
  root.classList.toggle('is-invalid', !q.fitsCapacity);
}

/** Keep the room count viable when the party grows, so the total is never a lie. */
function autoRooms() {
  const room = PRICING.rooms.find(r => r.id === state.roomId);
  const needed = Math.min(Math.ceil(state.divers / room.maxOccupancy), 3);
  // Pinned: only ever raise it, so a deliberate choice is never overwritten by
  // a smaller requirement. Unpinned: track the requirement exactly.
  state.rooms = roomsPinned ? Math.max(state.rooms, needed) : needed;
}

function init() {
  const root = document.getElementById('sim');
  if (!root) return;
  render(root);

  // On a phone the summary becomes a bar pinned to the bottom edge — the same
  // corner the chat bubble is fixed to. Flag the document while it is showing
  // so the bubble can step aside instead of sitting on the booking button.
  const summary = root.querySelector('.sim__summary');
  if (summary && 'IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => {
      document.documentElement.classList.toggle('sim-bar-up', e.isIntersecting);
    }, { threshold: 0 }).observe(summary);
  }

  // main.js swaps the language by setting data-lang on <html>; there is no
  // event, so watch the attribute rather than reaching into its internals.
  new MutationObserver(() => render(root))
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-lang'] });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
