/* =====================================================================
   Price simulator widget.

   Text here is NOT translated by the i18n pass in main.js: that runs once at
   load and walks static text nodes, and everything below is written after it
   and rewritten on every click. So the widget renders its own labels for the
   current language and re-renders when the language changes.
   ===================================================================== */
import { PRICING, quote, groupDiscount } from './price.js';

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
    total: '講習費用',
    per: (n) => `お一人あたり ${money(n)}`,
    divers: '講習を受ける人数',
    people: (n) => `${n}名`,
    off: (n) => `${money(n)} OFF`,
    baseRate: '基本料金',
    saved: (n) => `${money(n)} お得`,
    soloNote: '単独割増込',
    tuitionSub: 'お一人あたり・講習料',
    lines: {
      tuition: '講習費用（PADI講習料・教材・申請料）',
      onsite: '現地実費の目安（器材・ボート等）',
      room: '宿泊の目安（1室 ₱6,000〜）',
      roomPrice: '₱6,000〜',
    },
    unitEach: (q, u) => `${q} × ${money(u)}`,
    summary: (d) => `${d}名・講習費用`,
    perBar: (d, n) => d === 1 ? '<i>講習費用</i>' : `1人 ${money(n)}<i>・講習費用</i>`,
    exclTitle: '講習費用に含まれないもの（現地支払い・実費目安）',
    excl: [
      'マニラ⇄アニラオの往復送迎（実費目安／人数でシェア可）',
      '朝・昼・晩の食事（1日 ₱1,000〜1,500前後）',
      '器材一式のレンタルとタンク（₱5,000前後）',
      'ボート・燃料・ダイブパス（₱2,000〜3,000）',
      '宿泊（1室 ₱6,000〜8,000前後／手配サポートあり）',
    ],
    note: '※ZEN DIVEにお支払いいただくのは講習費用のみです。送迎・食事・器材・ボート・宿泊などの現地実費は、現地で直接リゾート側にお支払いいただきます。',
  },
  en: {
    heading: 'Price calculator',
    course: 'Course',
    total: 'Course Tuition',
    per: (n) => `${money(n)} each`,
    divers: 'People taking the course',
    people: (n) => `${n}`,
    off: (n) => `${money(n)} off`,
    baseRate: 'Base rate',
    saved: (n) => `${money(n)} saved`,
    soloNote: 'solo charter surcharge included',
    tuitionSub: 'per person · tuition',
    lines: {
      tuition: 'Tuition (course materials & cert fee)',
      onsite: 'Estimated on-site costs (gear, boat, etc.)',
      room: 'Estimated lodging (from ₱6,000 / room)',
      roomPrice: 'from ₱6,000',
    },
    unitEach: (q, u) => `${q} × ${money(u)}`,
    summary: (d) => `${d} diver${d > 1 ? 's' : ''} · tuition`,
    perBar: (d, n) => d === 1 ? '<i>tuition</i>' : `${money(n)} each<i> · tuition</i>`,
    exclTitle: 'Not included in course tuition (paid directly on site)',
    excl: [
      'Manila ⇄ Anilao transfers (shared by group)',
      'Breakfast, lunch & dinner (approx. ₱1,000–1,500/day)',
      'Full gear rental & tanks (approx. ₱5,000)',
      'Boat, fuel and dive pass (approx. ₱2,000–3,000)',
      'Lodging (approx. ₱6,000–8,000 / room, booking support provided)',
    ],
    note: 'The amount paid to ZEN DIVE is only the course tuition. Transfers, meals, gear rental, boat fees, and lodging are paid directly to the resort on site.',
  },
};

function money(n) { return '₱' + n.toLocaleString('en-US'); }
function lang() { return document.documentElement.getAttribute('data-lang') === 'en' ? 'en' : 'ja'; }

const state = { divers: 1, roomId: 'standard', rooms: 1, course: 'ow' };

let renderedLang = null;

function render(root) {
  const currentLang = lang();
  const langChanged = renderedLang !== null && renderedLang !== currentLang;
  renderedLang = currentLang;

  const t = L[currentLang];
  const q = quote(state);

  root.querySelector('.sim__label').textContent = t.total;

  const totalEl = root.querySelector('.sim__total');
  const prevText = totalEl.textContent;
  const nextText = money(q.tuitionTotal);
  totalEl.textContent = nextText;
  if (prevText && prevText !== nextText && !langChanged) {
    totalEl.classList.remove('is-changed');
    void totalEl.offsetWidth;
    totalEl.classList.add('is-changed');
  }

  root.querySelector('.sim__per').textContent = t.per(q.tuitionUnit);
  const savedEl = root.querySelector('.sim__saved');
  savedEl.textContent = q.saved ? t.saved(q.saved) : '';
  savedEl.hidden = !q.saved;
  root.querySelector('.sim__note').textContent = t.note;
  root.querySelector('.sim__short').textContent = t.summary(state.divers);
  root.querySelector('.sim__perbar').innerHTML = t.perBar(state.divers, q.tuitionUnit);

  const diversLegend = root.querySelector('.sim__legend');
  if (diversLegend) diversLegend.textContent = t.divers;

  const c = COURSES.find((x) => x.id === state.course)[lang()];
  const put = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  put('simStep', c.step);
  put('simCourseName', c.name);
  put('simCourseWhy', c.why);
  const priceEl = document.getElementById('simCoursePrice');
  if (priceEl) {
    const cost = PRICING.course[state.course];
    priceEl.innerHTML = `${money(cost)}<i>${t.tuitionSub}</i>`;
  }
  const spec = document.getElementById('simSpec');
  if (spec) spec.replaceChildren(...c.spec.map(([k, v]) => {
    const row = document.createElement('div');
    row.className = 'spec__row';
    row.innerHTML = `<dt>${k}</dt><dd>${v}</dd>`;
    return row;
  }));

  const fill = (sel, nodes) => {
    const box = root.querySelector(sel);
    if (!box) return;
    const old = Array.from(box.children);
    const sameShape = old.length === nodes.length &&
      old.every((el, i) => el.tagName === nodes[i].tagName);
    if (!sameShape) { box.replaceChildren(...nodes); return; }
    old.forEach((el, i) => {
      const nextNode = nodes[i];
      if (el.className !== nextNode.className) el.className = nextNode.className;
      const a = el.querySelector('input'), b = nextNode.querySelector('input');
      if (a && b) {
        if (a.value !== b.value) { box.replaceChildren(...nodes); return; }
        a.checked = b.checked;
        a.disabled = b.disabled;
      }
      el.querySelectorAll('span').forEach((span, j) => {
        const src = nextNode.querySelectorAll('span')[j];
        if (src && span.textContent !== src.textContent) span.textContent = src.textContent;
      });
    });
  };

  fill('#simDivers', [1, 2, 3, 4].map(n => {
    const off = groupDiscount(n) * n;
    const on = state.divers === n;
    const label = document.createElement('label');
    label.className = 'seg' + (on ? ' is-on' : '');
    label.innerHTML =
      `<input type="radio" name="simDivers" value="${n}"${on ? ' checked' : ''}>` +
      `<span class="seg__n">${t.people(n)}</span>` +
      `<span class="seg__sub">${off ? t.off(off) : t.baseRate}</span>`;
    label.querySelector('input').addEventListener('change', () => {
      state.divers = n; render(root);
    });
    return label;
  }));

  const lines = root.querySelector('.sim__lines');
  if (lines) {
    const items = [
      { label: t.lines.tuition, unit: t.unitEach(state.divers, q.tuitionUnit), amount: money(q.tuitionTotal) },
    ];
    lines.replaceChildren(...items.map(l => {
      const li = document.createElement('li');
      const unitHtml = l.unit ? `<i>${l.unit}</i>` : '';
      li.innerHTML = `<span>${l.label}</span>${unitHtml}<b>${l.amount}</b>`;
      return li;
    }));
  }

  const excl = root.querySelector('.sim__excl');
  if (excl) {
    excl.replaceChildren(...[
      Object.assign(document.createElement('li'), { className: 'sim__incltitle', textContent: t.exclTitle }),
      ...t.excl.map((x) => Object.assign(document.createElement('li'), { textContent: x })),
    ]);
  }
}

export function initSim(root = document.getElementById('sim')) {
  if (!root) return;
  render(root);

  const sync = () => render(root);
  window.addEventListener('zen:lang', sync);
  new MutationObserver(sync).observe(document.documentElement, {
    attributes: true, attributeFilter: ['data-lang'],
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initSim());
} else {
  initSim();
}