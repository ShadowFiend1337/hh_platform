import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { prepareLocalAccounts, localAccountPassword } from '../../scripts/local-accounts.mjs';
import { useFixedEncoder } from './helpers/accounts.mjs';
import { startIsolatedService } from './helpers/isolated-service.mjs';

// Likes from the ordinary list and the card deck form one shortlist in «Приглашения → Избранные».
const folder = await mkdtemp(join(tmpdir(), 'predel-favorites-')), dbPath = join(folder, 'favorites.sqlite');
await prepareLocalAccounts(dbPath);
const isolated = await startIsolatedService({ dbPath });
useFixedEncoder(isolated.service);
const browser = await chromium.launch();
const errors = [];

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  assert.equal((await context.request.post(isolated.base + '/api/auth/login', { data: { loginOrEmail: 'local_employer', password: localAccountPassword } })).status(), 200);
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(isolated.base + '/app?role=employer&tab=candidates');
  await page.locator('.candidate-list[aria-busy="false"]').waitFor();
  const saved = () => page.locator('.main-content[data-sync-status="saved"]').waitFor();

  // Ordinary list: every row can be liked; a demo profile explains why it cannot be invited.
  const real = page.locator('.candidate-row').filter({ hasText: 'Тестовый кандидат' });
  const demo = page.locator('.candidate-row').filter({ has: page.locator('.demo-only') }).first();
  const demoName = (await demo.locator('.person-link').textContent()).trim();
  assert.equal(await demo.getByRole('button', { name: 'Пригласить', exact: true }).count(), 0);
  await demo.locator('.demo-only summary').click();
  assert.match(await demo.locator('.demo-only-popover').innerText(), /нет аккаунта/u);
  await demo.getByRole('button', { name: 'В избранное: ' + demoName }).click();
  await real.getByRole('button', { name: 'В избранное: Тестовый кандидат' }).click();
  assert.equal(await real.locator('.row-like').getAttribute('aria-pressed'), 'true');
  await saved();

  // Card deck: a like there joins the same shortlist.
  await page.getByRole('button', { name: 'Предельный режим', exact: true }).click();
  const card = page.locator('.swipe-card');
  await card.waitFor();
  const deckName = (await card.locator('h2, .swipe-name, .person-link').first().textContent()).trim();
  await page.getByRole('button', { name: 'Нравится' }).click();
  await saved();
  await page.getByRole('button', { name: 'Обычный режим', exact: true }).click();

  await page.getByRole('button', { name: 'Открыть избранных кандидатов' }).click();
  await page.waitForURL(/tab=invitations#favorites/u);
  const cards = page.locator('.favorite-card');
  await cards.first().waitFor();
  const names = (await cards.locator('.person-link').allTextContents()).map(text => text.trim());
  assert.ok(names.includes('Тестовый кандидат') && names.includes(demoName) && names.some(name => deckName.includes(name) || name.includes(deckName)),
    'List and deck likes are listed: ' + names.join(', '));
  const realCard = cards.filter({ hasText: 'Тестовый кандидат' });
  assert.equal(await realCard.getByRole('button', { name: /Пригласить|Отправлено/u }).count(), 1, 'A real candidate can be invited from the shortlist');
  assert.equal(await cards.filter({ hasText: demoName }).getByText('Только просмотр').count(), 1);
  await page.screenshot({ path: resolve('test-results', 'favorites.png'), fullPage: true });
  await cards.filter({ hasText: demoName }).getByRole('button', { name: 'Убрать' }).click();
  await saved();
  assert.equal(await cards.filter({ hasText: demoName }).count(), 0);
  await page.reload();
  await cards.first().waitFor();
  assert.equal(await cards.count(), names.length - 1, 'The shortlist is stored on the server');
  assert.deepEqual(errors, []);
  console.log('PASS Likes in the ordinary list and the deck form one shortlist in «Избранные»; demo profiles explain the read-only limit');
} finally {
  await browser.close();
  await isolated.close();
  await rm(folder, { recursive: true, force: true });
}
