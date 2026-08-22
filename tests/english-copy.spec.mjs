import { test, expect } from '@playwright/test';

/**
 * THE ENGLISH COPY CONTRACT
 *
 * The Japanese page sells "you are taught in Japanese" — for a Japanese reader
 * living in Manila that is the whole proposition. The English page was a literal
 * transcreation of it, which meant the English reader was being sold instruction
 * in a language they may not speak: meaningless at best, a barrier at worst.
 *
 * The rule this file enforces: on the English page, "Japanese" refers to the
 * standard of care or to the instructor, never to the language of instruction.
 *
 * It also refuses to let anyone add a claim about English-language teaching.
 * Nobody has confirmed that the instructor teaches in English, and a booking
 * made on an invented service claim is worse than one never made. If that
 * changes, someone can add it deliberately and update this test — which is
 * exactly the point of pinning it.
 */

const BANNED = [
  /\bin Japanese\b/i,          // "taught in Japanese", "ask in Japanese"
  /Japanese[- ]speaking/i,     // "a Japanese-speaking guide"
  /speaks? Japanese/i,
  /working in Japanese/i,
];

/** Claims about English instruction that nobody has verified. */
const UNVERIFIED = [
  /taught in English/i,
  /English[- ]speaking (instructor|guide|staff)/i,
  /instruction in English/i,
];

async function englishPage(page) {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.evaluate(() => localStorage.setItem('zen-lang', 'en'));
  await page.reload({ waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1200);
}

/**
 * Everything an English reader could be exposed to:
 *   - rendered text
 *   - attributes that surface as text (alt, aria-label, title, placeholder, meta)
 *   - every English value in the dictionary, including entries not currently
 *     rendered — three of those were found orphaned, and a banned claim sitting
 *     dormant in i18n.js is a landmine for the next copy revision.
 */
async function englishSurfaces(page) {
  return page.evaluate(() => {
    const out = [];
    out.push(['rendered text', document.body.innerText]);

    const ATTRS = ['alt', 'aria-label', 'title', 'placeholder', 'content'];
    for (const el of document.querySelectorAll('*')) {
      for (const a of ATTRS) {
        const v = el.getAttribute?.(a);
        if (v && v.trim()) out.push([`<${el.tagName.toLowerCase()} ${a}>`, v]);
      }
    }

    for (const [i, e] of (window.ZEN_I18N || []).entries()) {
      if (e && e.en) out.push([`i18n[${i}]`, e.en]);
    }
    return out;
  });
}

function assertNoMatch(surfaces, patterns, message) {
  const violations = [];
  for (const [where, text] of surfaces) {
    for (const p of patterns) {
      const m = text.match(p);
      if (m) violations.push(`${where}: "${m[0]}"  in  ${text.slice(0, 90)}`);
    }
  }
  expect(violations, `${message}\n${violations.join('\n')}`).toEqual([]);
}

test('the English page never sells the Japanese language', async ({ page }) => {
  await englishPage(page);
  const surfaces = await englishSurfaces(page);

  const rendered = surfaces.find(([w]) => w === 'rendered text')[1];
  expect(rendered, 'sanity: the page switched to English').toContain('YOUR INSTRUCTOR');
  expect(surfaces.length, 'sanity: surfaces were actually collected').toBeGreaterThan(50);

  assertNoMatch(
    surfaces, BANNED,
    'English copy must not sell the Japanese language. ' +
    'Sell the standard of care instead — see i18n "Japanese standards".'
  );
});

test('the English page claims no English-language instruction', async ({ page }) => {
  await englishPage(page);
  const surfaces = await englishSurfaces(page);

  assertNoMatch(
    surfaces, UNVERIFIED,
    'Unverified service claim. Confirm with the owner that the instructor ' +
    'teaches in English before promising it, then update this test.'
  );
});

/**
 * Japanese characters that are deliberately kept on the English page.
 * Anything NOT on this list is an untranslated string, i.e. a bug.
 *
 * "5:00頃" shipped to the English page because i18n keys on the JP source and
 * nobody had written an entry for those text nodes — silent, and invisible to
 * every check that existed. This test is the one that would have caught it.
 */
const INTENTIONAL_JP = [
  { sel: '.preloader',        why: 'loading screen — main.js excludes it from translation by design' },
  { sel: '.hero__scroll-jp',  why: '潜降 is a graphic element, not copy' },
  { sel: '.gallery figcaption', why: 'captions are bilingual on purpose: "Sea Turtle · 静寂の住人"' },
  { sel: '#chatWidget',       why: 'the assistant answers in Japanese; its UI stays Japanese' },
  { sel: 'meta',              why: 'one HTML document, one set of meta tags — JP is the primary market' },
  { sel: 'title',             why: 'as above' },
];

test('no untranslated Japanese leaks onto the English page', async ({ page }) => {
  await englishPage(page);

  const leaks = await page.evaluate((allow) => {
    const CJK = /[぀-ヿ㐀-䶿一-鿿ｦ-ﾟ々〆〜～]/;
    const out = [];

    const exempt = (el) => allow.some(a => el.closest?.(a.sel));

    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = tw.nextNode())) {
      const t = n.textContent.trim();
      if (!t || !CJK.test(t)) continue;
      const el = n.parentElement;
      if (!el || exempt(el)) continue;
      out.push(`${el.tagName.toLowerCase()}.${el.className || '(no class)'}: "${t.slice(0, 40)}"`);
    }
    return out;
  }, INTENTIONAL_JP);

  expect(
    leaks,
    'Untranslated Japanese on the English page. Add an entry to js/i18n.js keyed ' +
    'on the JP source string, or add the element to INTENTIONAL_JP with a reason.\n' +
    leaks.join('\n')
  ).toEqual([]);
});

test('schedule times and counts read as numerals in English', async ({ page }) => {
  await englishPage(page);
  const sched = await page.locator('.sched').innerText();

  expect(sched, 'times must not carry 頃 or the wave dash').not.toMatch(/[頃〜～]/);
  // Counts in a timeline should scan as digits, matching the DAY 1 / DAY 2 labels.
  expect(sched, 'dive counts should be numerals').not.toMatch(/\b(one|two|three|four|five) dives?\b/i);
  expect(sched, 'dive counts should be numerals').not.toMatch(/\bdives? (one|two|three|four)\b/i);
});

test('the instructor section still carries the quality message', async ({ page }) => {
  await englishPage(page);
  const trust = await page.locator('#trust').innerText();

  // Not asserting exact wording — copy should stay editable. Asserting that the
  // section still says something about thoroughness rather than about language.
  expect(trust).toMatch(/Safety checks|gear checks|checked twice/i);
  expect(trust).toMatch(/PADI/);
});
