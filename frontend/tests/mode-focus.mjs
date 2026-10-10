import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { prepareLocalAccounts, localAccountPassword } from '../../scripts/local-accounts.mjs';
import { startIsolatedService } from './helpers/isolated-service.mjs';

// Interface measurement of «Обычный режим» vs «Предельный режим» on the demo catalogue.
// It records what a 1440×900 screen shows and how many actions a review takes.
// This is a property of the interface, not an experiment with people.
const folder = await mkdtemp(join(tmpdir(), 'predel-modes-')), dbPath = join(folder, 'modes.sqlite');
await prepareLocalAccounts(dbPath);
const isolated = await startIsolatedService({ dbPath });
isolated.service.directory.encoder.close();
isolated.service.directory.encoder = {
  info: { status: 'ready', name: 'Mode focus fixture', version: 'mode-focus-fixture', dimension: 2, trained: false, threshold: 0.5 },
  async start() { return this.info; }, async encode(texts) { return texts.map(() => [1, 0]); }, close() {},
};
const browser = await chromium.launch();
const viewport = { width: 1440, height: 900 }, reviews = 20;

/** Elements of a selector intersecting the viewport, and visible interactive controls in a region. */
async function screen(page, cards, region) {
  return page.evaluate(([cardSelector, regionSelector]) => {
    document.querySelector(cardSelector)?.scrollIntoView({ block: 'start' });
    const inView = element => { const box = element.getBoundingClientRect(); return box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < innerHeight; };
    const area = document.querySelector(regionSelector);
    const controls = area ? [...area.querySelectorAll('button, a[href], input, select, textarea, summary, [tabindex="0"]')].filter(element => inView(element) && !element.disabled) : [];
    const items = [...document.querySelectorAll(cardSelector)].filter(inView);
    const first = document.querySelector(cardSelector)?.getBoundingClientRect();
    const text = items.map(element => element.innerText.replace(/\s+/gu, ' ').trim().length);
    return { cards: items.length, controls: controls.length, cardHeight: first ? Math.round(first.height) : 0,
      textPerCard: text.length ? Math.round(text.reduce((sum, value) => sum + value, 0) / text.length) : 0 };
  }, [cards, region]);
}

async function open(role, query) {
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
  const login = await context.request.post(isolated.base + '/api/auth/login', { data: { loginOrEmail: 'local_' + role, password: localAccountPassword } });
  assert.equal(login.status(), 200);
  const page = await context.newPage();
  await page.goto(isolated.base + '/app?role=' + role + query);
  return { context, page };
}

const result = { measuredAt: new Date().toISOString().slice(0, 10), viewport, reviews, kind: 'interface-measurement', employer: {}, candidate: {} };
try {
  // Employer: candidate list vs card deck.
  const { page: employer } = await open('employer', '&tab=candidates');
  await employer.locator('.candidate-list[aria-busy="false"]').waitFor();
  // A fresh visit selects the first hiring need with narrow filters; review the whole catalogue instead.
  await employer.locator('.filter-heading').getByRole('button', { name: 'Сбросить' }).click();
  await employer.getByRole('button', { name: 'Очистить поиск' }).click();
  try { await employer.waitForFunction(() => document.querySelectorAll('.candidate-row').length >= 20, null, { timeout: 15000 }); }
  catch (error) { await employer.screenshot({ path: join(tmpdir(), 'mode-focus-debug.png') }); console.log(await employer.locator('.directory-feedback, .directory-error, .candidate-list').first().innerText()); throw error; }
  await employer.locator('.candidate-list[aria-busy="false"]').waitFor();
  const list = await screen(employer, '.candidate-row', '.candidate-list');
  // Reviewing in the list: open the profile and close it; rows below the fold need scrolling.
  const perScreen = Math.max(1, Math.floor(viewport.height / list.cardHeight));
  result.employer.list = { ...list, actionsPerReview: 2, scrolls: Math.ceil(reviews / perScreen) - 1 };
  result.employer.list.actions = reviews * 2 + result.employer.list.scrolls;

  await employer.getByRole('button', { name: 'Предельный режим', exact: true }).click();
  const card = employer.locator('.swipe-card');
  await card.waitFor();
  const deck = await screen(employer, '.swipe-card', '.candidate-list');
  let decided = 0;
  for (let index = 0; index < reviews; index++) {
    const id = await card.getAttribute('data-candidate-id');
    await card.focus();
    await employer.keyboard.press(index % 3 === 0 ? 'ArrowRight' : 'ArrowLeft');
    await employer.waitForFunction(previous => document.querySelector('.swipe-card')?.getAttribute('data-candidate-id') !== previous, id);
    decided++;
  }
  assert.equal(decided, reviews);
  result.employer.deck = { ...deck, actionsPerReview: 1, scrolls: 0, actions: reviews };

  // Candidate: company list vs vacancy deck.
  const { page: candidate } = await open('candidate', '&tab=invitations');
  await candidate.getByRole('button', { name: 'Найти компании' }).click();
  await candidate.locator('.company-card').first().waitFor();
  const companies = await screen(candidate, '.company-card', '.opportunities-content');
  result.candidate.list = companies;
  await candidate.getByRole('button', { name: 'Предельный режим', exact: true }).click();
  const offer = candidate.locator('.swipe-card').first();
  await offer.waitFor();
  result.candidate.deck = await screen(candidate, '.swipe-card', '.opportunities-content');

  const target = fileURLToPath(new URL('../../docs/charts/', import.meta.url));
  await mkdir(target, { recursive: true });
  await writeFile(join(target, 'mode-focus.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
  await isolated.close();
  await rm(folder, { recursive: true, force: true });
}
