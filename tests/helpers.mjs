/**
 * document.fonts.ready never settles when a webfont request fails, and these
 * pages pull Google Fonts — one blocked woff2 turned every test into a 30s
 * page.evaluate timeout that looked like a broken widget. Bound the wait: a
 * missing font is a rendering nuance, not a reason to fail the suite.
 */
export async function fontsSettled(page, ms = 3000) {
  await page.evaluate((limit) => Promise.race([
    document.fonts.ready,
    new Promise((r) => setTimeout(r, limit)),
  ]), ms);
}

/**
 * Open the site in one page load.
 *
 * Tests used to goto, write localStorage, then reload — two full loads, each
 * waiting on `load`, which does not fire until the hero video poster and every
 * image has arrived. A single test spent ~19s doing that, and under parallel
 * workers it blew the 30s budget. addInitScript sets the language before the
 * first byte of script runs, so one `domcontentloaded` load is enough; anything
 * the test actually needs is then waited for explicitly.
 */
export async function openSite(page, { lang, path = '/index.html' } = {}) {
  // The hero video is the heaviest request on the page and no test looks at it.
  await page.route('**/*.mp4', (route) => route.abort());
  if (lang) await page.addInitScript((l) => localStorage.setItem('zen-lang', l), lang);
  else await page.addInitScript(() => localStorage.removeItem('zen-lang'));
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await fontsSettled(page);
}
