// `S-2b` (tflw `M240`; `PLAN_M239_DOGFOOD_EXPANSION.md` §3): the shapes of `tflw ui` that tflw's
// own language cannot state, measured with Playwright on this project. Run by
// `verify-ui-page.mjs` under its server; not a phase of its own.
//
// THREE MEASUREMENTS.
//   1. **The first eight Tab stops** from a fresh load of a door (tflw `D1311`): the explorer, the
//      door bar and the tab strip are one stop each, so none of them may appear twice; the search
//      comes before the file list (the DOM stays sidebar-first); and every stop has a name.
//   2. **Words at rest per view** against tflw's budgets (`D1312`: landing 120, Compose 250,
//      Auth 200, Run 150) — counted the way tflw's appearance gate counts them, with the same
//      exclusions (the user's own text, code, the file list, a closed fold), because two instruments
//      for one budget would be two budgets. This is where the review's 893 came from.
//   3. **Targets under 24 px and text under 11 px**, per view. **Measured and printed, not yet
//      judged**: 24 px targets and the 11 px floor are tflw `M241` `E`'s to build (its gate is this
//      census on a fixture), and on 2026-09-26 this project measured 106–201 targets per view (the
//      tree's 22 px rows, the row `+` at 18×14) and one 10 px glyph (the folder twisty). When `M241`
//      `E` merges, `JUDGE_SIZES` becomes `true` and this measurement is the dogfood half of its gate.
import { chromium } from 'playwright';

export const BUDGET = { landing: 120, compose: 250, auth: 200, run: 150 };
const THEIRS = 'code, pre, kbd, input, textarea, select, option, .seq-text, [data-files], [data-user-data], .tip, [data-legend], [data-test], [data-finding], [data-finding-gone]';
const READY = { landing: '[data-doors]', compose: '[data-compose-pane], [data-empty-door]', run: '[data-runs]', auth: '[data-api-auth]' };
const DOORS = ['api', 'browser', 'load', 'scan'];
/** Flips with tflw `M241` `E` — see the header's third measurement. */
const JUDGE_SIZES = false;
const VIEWS = [['', 'landing'], ...DOORS.flatMap((d) => [[d, 'compose'], [d, 'auth'], [d, 'run']])];

/** Words a reader meets without opening anything, and not their own. */
const wordsAtRest = (page) =>
  page.evaluate((skip) => {
    const out = [];
    const walk = (e) => {
      if (e.nodeType === 3) return void out.push(e.textContent ?? '');
      if (e.nodeType !== 1 || e.matches(skip) || !e.checkVisibility()) return;
      for (const c of e.childNodes) walk(c);
    };
    walk(document.body);
    const text = out.join(' ').replace(/\s+/g, ' ').trim();
    return { n: text.split(' ').filter((w) => /[A-Za-z]/.test(w)).length, text };
  }, THEIRS);

/** Every visible control smaller than 24 px on either side, and every visible text run under 11 px. */
const smallThings = (page) =>
  page.evaluate(() => {
    const targets = [];
    for (const el of document.querySelectorAll('button, a[href], input, select, textarea, summary, [role=button], [tabindex="0"]')) {
      if (!el.checkVisibility()) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.width < 24 || r.height < 24) {
        const data = [...el.attributes].find((a) => a.name.startsWith('data-'));
        targets.push(`${el.tagName.toLowerCase()}${data ? `[${data.name}${data.value ? `=${data.value.slice(0, 30)}` : ''}]` : ''} ${Math.round(r.width)}×${Math.round(r.height)}`);
      }
    }
    const texts = [];
    const walk = (e) => {
      if (e.nodeType === 3) {
        if (e.textContent.trim() === '') return;
        const px = parseFloat(getComputedStyle(e.parentElement).fontSize);
        if (px < 11) texts.push(`${e.parentElement.tagName.toLowerCase()}.${String(e.parentElement.className).split(' ')[0]} ${px}px “${e.textContent.trim().slice(0, 30)}”`);
        return;
      }
      if (e.nodeType !== 1 || !e.checkVisibility()) return;
      for (const c of e.childNodes) walk(c);
    };
    walk(document.body);
    return { targets: [...new Set(targets)], texts: [...new Set(texts)] };
  });

/** What has focus, as a reader of the gate needs it: the strip it is in, and its name. */
const focused = (page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    if (el === null || el === document.body) return null;
    // The theme picker sits inside the door bar's element but is not in its roving set — a
    // `<select>` answers the arrows itself (tflw `DoorBar.tsx`) — so it is its own stop.
    const strip = el.matches('[data-theme-select]') ? 'theme' : el.closest('.files.tree') ? 'tree' : el.closest('[data-doorbar]') ? 'doorbar' : el.closest('[data-tabstrip]') ? 'tabstrip' : el.matches('[data-search]') ? 'search' : 'other';
    // A form control is named by its label (wrapping or `for=`), never by its options' text.
    const labelled = el.labels && el.labels.length > 0 ? [...el.labels].map((l) => l.textContent).join(' ') : null;
    const name = (el.getAttribute('aria-label') ?? labelled ?? el.textContent ?? '').replace(/\s+/g, ' ').trim() || el.getAttribute('title') || '';
    const data = [...el.attributes].find((a) => a.name.startsWith('data-'));
    return { strip, name, what: `${el.tagName.toLowerCase()}${data ? `[${data.name}${data.value ? `=${data.value.slice(0, 40)}` : ''}]` : ''}` };
  });

export async function measureBudgets(base, token) {
  const passed = [];
  const failed = [];
  const judge = (label, good, detail) => (good ? passed : failed).push(good ? label : `${label} — ${detail}`);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const goto = async (door, tab) => {
      await page.goto(`${base}/?token=${token}${door === '' ? '' : `#/${door}/${tab}`}`);
      await page.reload();
      await page.locator(READY[tab]).first().waitFor();
    };

    // 1. The first eight Tab stops, from a fresh load of the API door.
    await goto('api', 'compose');
    await page.locator('.files.tree [data-open="yes"]').first().waitFor();
    const stops = [];
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      stops.push(await focused(page));
    }
    const shown = stops.map((s, i) => `${i + 1}. ${s === null ? '(nothing)' : `${s.strip} ${s.what} “${s.name.slice(0, 30)}”`}`).join('\n      ');
    console.log(`the first eight Tab stops on the API door:\n      ${shown}`);
    const twice = ['tree', 'doorbar', 'tabstrip'].filter((strip) => stops.filter((s) => s?.strip === strip).length > 1);
    judge('Tab: the explorer, the door bar and the tab strip are one stop each in the first eight', twice.length === 0, `twice: ${twice.join(', ')}`);
    const nameless = stops.filter((s) => s !== null && s.name === '').map((s) => s.what);
    judge('Tab: every one of the first eight stops has a name', stops.every((s) => s !== null) && nameless.length === 0, `nameless: ${nameless.join(', ') || 'a stop landed on nothing'}`);
    const si = stops.findIndex((s) => s?.strip === 'search');
    const ti = stops.findIndex((s) => s?.strip === 'tree');
    judge('Tab: search comes before the file list, which comes before the door bar', si !== -1 && ti > si && stops.findIndex((s) => s?.strip === 'doorbar') > ti, `search ${si + 1}, tree ${ti + 1}`);

    // 2 and 3. Words at rest, and small things, per view.
    for (const [door, tab] of VIEWS) {
      await goto(door, tab);
      const where = door === '' ? 'landing' : `${door}/${tab}`;
      const { n, text } = await wordsAtRest(page);
      judge(`words at rest: ${where} ${n} ≤ ${BUDGET[tab]}`, n <= BUDGET[tab], `“${text.slice(0, 240)}…”`);
      const { targets, texts } = await smallThings(page);
      if (JUDGE_SIZES) {
        judge(`targets under 24 px: ${where} ${targets.length}`, targets.length === 0, targets.slice(0, 8).join('; '));
        judge(`text under 11 px: ${where} ${texts.length}`, texts.length === 0, texts.slice(0, 8).join('; '));
      } else {
        console.log(`  (not judged until tflw M241 E) ${where}: ${targets.length} target(s) under 24 px, ${texts.length} text run(s) under 11 px`);
      }
    }
  } finally {
    await browser.close();
  }
  return { passed, failed };
}
