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

/* The two courses, and everything on the card that has to agree with the one
   being priced. Advanced was a separate card quoting tuition only; folding it
   into the simulator means the title, the tagline and the spec sheet all have
   to follow the choice, or the page ends up promising 18m beside an Advanced
   price. */
const COURSES = [
  { id: 'ow',  level: 'LEVEL 1',
               ja: { seg: 'オープンウォーター', step: 'はじめての人へ', name: 'オープンウォーター・ダイバー',
                     why: 'はじめて潜る人が取る、世界共通のライセンス',
                     spec: [['日程', '1泊2日'], ['深さ', '18mまで'], ['年齢', '10歳以上']] },
               en: { seg: 'Open Water', step: 'START HERE', name: 'Open Water Diver',
                     why: 'The licence divers everywhere start with',
                     spec: [['Length', '2 days'], ['Depth', 'to 18m'], ['Age', '10+']] } },
  { id: 'aow', level: 'LEVEL 2',
               ja: { seg: 'アドバンス', step: 'つぎの一歩', name: 'アドバンス・オープンウォーター',
                     why: '沈没船も、30mの地形も',
                     spec: [['日程', '1泊2日'], ['深さ', '30mまで'], ['年齢', '12歳以上'], ['前提', 'オープンウォーター']] },
               en: { seg: 'Advanced', step: 'NEXT STEP', name: 'Advanced Open Water',
                     why: 'Wrecks, and the shape of the reef at 30m',
                     spec: [['Length', '2 days'], ['Depth', 'to 30m'], ['Age', '12+'], ['Needs', 'Open Water']] } },
];

const L = {
  ja: {
    heading: '料金シミュレーター',
    course: 'コース',
    total: '合計（1泊2日・すべて込み）',
    per: (n) => `お一人あたり ${money(n)}`,
    divers: '講習を受ける人数',
    room: '部屋',
    rooms: '借りる部屋の数',
    people: (n) => `${n}名`,
    roomCount: (n) => `${n}室`,
    caps: { standard: 'スタンダード', deluxe: 'デラックス', suite: 'スイート' },
    view: { standard: '', deluxe: '海側', suite: '海側' },
    meta: (cap, view) => view ? `${cap}・${view}` : cap,
    capacity: (n) => `定員${n}名`,
    baseRoom: '基本',
    upgrade: (n) => `+${money(n)}`,
    each: (n) => `${money(n)}／人`,
    overCapacity: (cap) => `この組み合わせでは${cap}名までです。部屋数を増やしてください。`,
    lines: {
      course: 'ダイビング（講習・器材・ボート・送迎・食事）',
      room: '宿泊',
      // The room's unit price is the one number here a reader can look up on
      // Agoda, which is exactly why the cards stopped printing a nightly rate.
      // Leaving "4 × ₱8,250" in the breakdown published it anyway. The grade
      // and the count move into the label so nothing is actually lost.
      roomWith: (cap, n) => `宿泊（${cap}${n}室）`,
    },
    unitEach: (q, u) => `${q} × ${money(u)}`,
    summary: (d, r, n) => `${d}名・${r}${n}室・すべて込み`,
    // The phone's booking bar is the view that decides this, and it was showing
    // only the party total. Per head is the figure anyone compares with.
    // Short on purpose. "お一人あたり" is the clearer phrase but at 320px it
    // pushed the amount itself into an ellipsis — "₱37,00…" — which loses the
    // one thing the line exists to say.
    perBar: (d, n) => d === 1 ? '<i>すべて込み</i>'
      : `1人 ${money(n)}<i>・すべて込み</i>`,
    off: (n) => `${money(n)} OFF`,
    baseRate: '基本料金',
    saved: (n) => `${money(n)} お得`,
    inclTitle: '潜るのに必要なものは、すべて込み',
    exclTitle: '含まれないもの',
    excl: ['お酒、お菓子、ソフトドリンク', '個人的なお買い物'],
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
    course: 'Course',
    total: 'Total — two days, everything in',
    per: (n) => `${money(n)} each`,
    divers: 'People taking the course',
    room: 'Room',
    rooms: 'Number of rooms',
    people: (n) => `${n}`,
    roomCount: (n) => `${n}`,
    caps: { standard: 'Standard', deluxe: 'Deluxe', suite: 'Suite' },
    view: { standard: '', deluxe: 'sea view', suite: 'sea view' },
    meta: (cap, view) => view ? `${cap} · ${view}` : cap,
    capacity: (n) => `Up to ${n} people`,
    baseRoom: 'Base',
    upgrade: (n) => `+${money(n)}`,
    each: (n) => `${money(n)} each`,
    overCapacity: (cap) => `That combination sleeps ${cap}. Add a room.`,
    lines: {
      course: 'Diving — tuition, gear, boat, transfers, meals',
      room: 'Room',
      roomWith: (cap, n) => `Room (${cap} x${n})`,
    },
    unitEach: (q, u) => `${q} × ${money(u)}`,
    summary: (d, r, n) => `${d} · ${r} x${n} · all in`,
    perBar: (d, n) => d === 1 ? '<i>all in</i>' : `${money(n)} each<i> · all in</i>`,
    off: (n) => `${money(n)} off`,
    baseRate: 'Base rate',
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
  // innerHTML because the all-in tail is wrapped so a 320px screen can drop it.
  // The amount is the one thing that must never be the part that gets cut.
  root.querySelector('.sim__perbar').innerHTML = t.perBar(state.divers, q.perPerson);

  const legends = root.querySelectorAll('.sim__legend');
  legends[0].textContent = t.course;
  legends[1].textContent = t.divers;
  legends[2].textContent = t.room;
  legends[3].textContent = t.rooms;

  // The card around the simulator describes whichever course is selected. Left
  // static it would have offered an Advanced price under an Open Water title,
  // promising 18m and age 10 to someone buying the 30m course.
  const c = COURSES.find((x) => x.id === state.course)[lang()];
  const put = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  put('simStep', c.step);
  put('simCourseName', c.name);
  put('simCourseWhy', c.why);
  const spec = document.getElementById('simSpec');
  if (spec) spec.replaceChildren(...c.spec.map(([k, v]) => {
    const row = document.createElement('div');
    row.className = 'spec__row';
    row.innerHTML = `<dt>${k}</dt><dd>${v}</dd>`;
    return row;
  }));

  // Reuse the existing nodes when the option set is unchanged. replaceChildren
  // destroyed the element the pointer was on, which made clicks race the
  // re-render and the row flicker on every選択.
  const fill = (sel, nodes) => {
    const box = root.querySelector(sel);
    const old = Array.from(box.children);
    const sameShape = old.length === nodes.length &&
      old.every((el, i) => el.tagName === nodes[i].tagName);
    if (!sameShape) { box.replaceChildren(...nodes); return; }
    old.forEach((el, i) => {
      const next = nodes[i];
      if (el.className !== next.className) el.className = next.className;
      const a = el.querySelector('input'), b = next.querySelector('input');
      if (a && b) {
        if (a.value !== b.value) { box.replaceChildren(...nodes); return; }
        a.checked = b.checked;
        a.disabled = b.disabled;
      }
      // text spans only — leaving the input element itself in place
      el.querySelectorAll('span').forEach((span, j) => {
        const src = next.querySelectorAll('span')[j];
        if (src && span.textContent !== src.textContent) span.textContent = src.textContent;
      });
    });
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
  // Course first: it is the largest thing being chosen, and everything below it
  // — the discount ladder, the room, the total — is a modifier on it.
  fill('#simCourse', COURSES.map((c2) => {
    const on = state.course === c2.id;
    const label = document.createElement('label');
    label.className = 'seg' + (on ? ' is-on' : '');
    label.innerHTML =
      `<input type="radio" name="simCourse" value="${c2.id}"${on ? ' checked' : ''}>` +
      `<span class="seg__n">${c2[lang()].seg}</span>` +
      `<span class="seg__sub">${c2.level}</span>`;
    label.querySelector('input').addEventListener('change', () => {
      state.course = c2.id; render(root);
    });
    return label;
  }));

  fill('#simDivers', [1, 2, 3, 4].map(n => {
    // The money, not the percentage. "5%OFF" and "₱4,000 OFF" are the same
    // discount; only one of them is a number the reader can feel. It also
    // stops the two courses printing two different amounts for one rate.
    //
    // The BOOKING's saving, not each diver's. Per-head here put two different
    // figures for one discount on the same screen — "₱2,000 OFF" on the segment
    // and "₱4,000 お得" on the card — with nothing saying which was which. The
    // card is about the booking total, the badge sits under it, so the segment
    // speaks in the same unit. It is also the number that argues: ₱32,000 off
    // is a reason to bring three friends in a way that ₱8,000 is not.
    const off = groupDiscount(n) * n;
    const on = state.divers === n;
    const label = document.createElement('label');
    label.className = 'seg' + (on ? ' is-on' : '');
    label.innerHTML =
      `<input type="radio" name="simDivers" value="${n}"${on ? ' checked' : ''}>` +
      `<span class="seg__n">${t.people(n)}</span>` +
      `<span class="seg__sub">${off ? t.off(off) : t.baseRate}</span>`;
    label.querySelector('input').addEventListener('change', () => {
      state.divers = n; autoRooms(); render(root);
    });
    return label;
  }));

  // Rooms are cards with the actual photograph and what the upgrade costs —
  // NOT a nightly rate. This is a package, and a package that prints the hotel's
  // per-night price hands the reader something to look up on Agoda and a reason
  // to wonder whether booking the room themselves would be cheaper. The one
  // advantage of an all-in price is that it has no comparable; publishing the
  // components throws it away. Two of the three rates are estimates besides, and
  // an estimate printed as a hotel's rate is a claim about somebody else's
  // business.
  //
  // A delta is a price we set for an upgrade inside our own package, which is
  // both safer and the configurator convention — Tesla prices a wheel at
  // "+₱120,000", not at what the wheel is worth. The cheapest card says 基本
  // rather than "—" or "₱0": an em dash told the reader nothing, and the same
  // word already labels the base option in the headcount row.
  const baseNightly = Math.min(...PRICING.rooms.map((r) => r.nightly));
  fill('#simRoom', PRICING.rooms.map(r => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sim__room' + (state.roomId === r.id ? ' is-on' : '');
    b.setAttribute('aria-pressed', String(state.roomId === r.id));
    const art = ROOM_ART[r.id];

    b.innerHTML =
      `<img class="sim__roomart" src="${art.src}" alt="${art.alt[lang()]}" loading="lazy" decoding="async">` +
      `<span class="sim__roomname">${t.caps[r.id]}</span>` +
      `<span class="sim__roommeta">${t.meta(t.capacity(r.maxOccupancy), t.view[r.id])}</span>` +
      `<span class="sim__roomdelta">${r.nightly === baseNightly ? t.baseRoom : t.upgrade(r.nightly - baseNightly)}</span>`;
    b.addEventListener('click', () => { state.roomId = r.id; autoRooms(); render(root); });
    return b;
  }));

  // Two bounds, and both of them are occupancy rather than opinion:
  //   too small — four people do not fit in one room that sleeps two
  //   too many  — a room has to have somebody in it. One diver cannot occupy
  //               four rooms, and no booking product anywhere lets them try:
  //               Booking clamps rooms to the party size on submit, Expedia
  //               creates every room with a guest already inside so the state
  //               is unreachable.
  // Disabled, never hidden. The earlier mistake was removing the control, which
  // made the question vanish; greying out at the bound is what Booking and
  // Expedia both do and what the too-small case here already did.
  //
  // No second line. It described how the party would spread, and called an
  // unused room "1室あまり" — a phrase that appears in no booking product
  // anywhere, because the state it names is one they all prevent. Carbon is
  // explicit that the slot under a number input is for constraints, not for
  // derived values. The spread now reads once, in the summary, in Booking's
  // own shape: "1名・スタンダード2室".
  const maxOcc = PRICING.rooms.find(r => r.id === state.roomId).maxOccupancy;
  // Up to four, because four is the largest party and four rooms is the only
  // way four people each get their own. Capping at three quietly refused the
  // most valuable booking on the page.
  fill('#simRooms', [1, 2, 3, 4].map((n) => {
    const impossible = state.divers > maxOcc * n || n > state.divers;
    const on = state.rooms === n;
    const label = document.createElement('label');
    label.className = 'seg' + (on ? ' is-on' : '') + (impossible ? ' is-off' : '');
    label.innerHTML =
      `<input type="radio" name="simRooms" value="${n}"${on ? ' checked' : ''}${impossible ? ' disabled' : ''}>` +
      `<span class="seg__n">${t.roomCount(n)}</span>`;
    // Attached whether or not this count is currently reachable. fill() reuses
    // existing nodes when the option set keeps its shape, patching only class
    // and disabled — so a segment created while disabled kept no listener and
    // stayed dead after it became selectable again. A disabled input cannot
    // fire change, so binding unconditionally costs nothing and removes the
    // whole class of bug.
    label.querySelector('input').addEventListener('change', () => {
      state.rooms = n; roomsPinned = true; render(root);
    });
    return label;
  }));

  // Breakdown. Shown, not hidden behind a toggle — the whole point of one
  // number is that the visitor can see what is inside it.
  const lines = root.querySelector('.sim__lines');
  lines.replaceChildren(...q.lines.map(l => {
    const li = document.createElement('li');
    const isRoom = l.key === 'room';
    const label = isRoom ? t.lines.roomWith(t.caps[state.roomId], l.qty) : t.lines[l.key];
    const unit = isRoom ? '' : `<i>${t.unitEach(l.qty, l.unit)}</i>`;
    li.innerHTML = `<span>${label}</span>${unit}<b>${money(l.amount)}</b>`;
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
  root.querySelector('.sim__previewmeta').textContent =
    t.meta(t.capacity(room.maxOccupancy), t.view[room.id]);
  const prate = root.querySelector('.sim__previewrate');
  prate.textContent = room.nightly === baseNightly ? '' : t.upgrade(room.nightly - baseNightly);

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
  const needed = Math.min(Math.ceil(state.divers / room.maxOccupancy), 4);
  // Never more rooms than divers: every room needs an occupant. Without the
  // clamp a party that picked four rooms and then shrank to one diver kept all
  // four, and the card quoted ₱75,500 for one person to sleep in four beds.
  const most = state.divers;
  // Pinned: only ever raise it, so a deliberate choice is never overwritten by
  // a smaller requirement. Unpinned: track the requirement exactly.
  state.rooms = Math.min(roomsPinned ? Math.max(state.rooms, needed) : needed, most);
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
