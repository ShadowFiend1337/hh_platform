import { PRIVACY_POLICY_VERSION } from '../../shared/privacy.ts';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { programs } from '../../server/bank.mjs';
import { startIsolatedService } from './helpers/isolated-service.mjs';
import { moderator } from './helpers/accounts.mjs';

// A disposable database with two generated pilot items; no model is called.
const isolated = await startIsolatedService();
const { base, service, codes } = isolated;
const family = service.bank.families.get(programs.Backend.Middle.families[0].id);
const pilot = (text, correct) => service.bank.addGenerated(family, { text, options: ['Индекс по полю фильтра', 'Увеличить таймаут',
  'Перезапустить сервер', 'Отключить логирование'], correct, explanation: 'Запрос фильтрует по полю без индекса.', skills: family.skills.slice(0, 1) },
  { generator: 'qwen/mock', verifier: 'deepseek/mock', verification: { accepted: true, model: 'deepseek/mock', chosen: correct, confidence: 0.9 } });
const first = pilot('Запрос к таблице заказов выполняется 8 секунд и фильтрует по статусу. Что сделать в первую очередь?', 0);
const second = pilot('Отчёт по заказам строится 40 секунд из-за фильтрации по дате создания. С чего начать оптимизацию?', 0);
assert.ok(first && second);

const browser = await chromium.launch();
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const email = 'bank-reviewer@example.invalid';
  assert.equal((await context.request.post(base + '/api/auth/register/request-code', { data: { email, login: 'bank-reviewer', role: 'employer',
    password: 'Bank moderation fixture 2026', consent: true, privacyVersion: PRIVACY_POLICY_VERSION, companyName: 'Экспертиза' } })).status(), 202);
  const verified = await context.request.post(base + '/api/auth/register/verify', { data: { email, code: codes.get(email) } });
  assert.equal(verified.status(), 201);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(base + '/moderation#bank');
  await page.getByRole('heading', { name: 'Кабинет модератора' }).waitFor();
  assert.equal(await page.locator('.bank-moderation').count(), 0, 'An employer has no moderation');
  assert.throws(() => service.auth.store.setModerator(service.auth.store.accountByIdentifier('bank-reviewer').id, true, 'browser-fixture'),
    /отдельного аккаунта модератора/u, 'Moderation is never granted to an employer');

  await moderator(context, isolated, 'bank-moderator');
  await page.reload();
  await page.getByRole('heading', { name: 'Банк заданий' }).waitFor();
  const items = page.locator('.bank-item');
  await items.first().waitFor();
  assert.equal(await items.count(), 2);
  assert.match(await page.locator('.bank-summary').innerText(), /2\s+пилот/u);
  assert.equal(await items.first().locator('.bank-options li.correct').count(), 1, 'The key is shown to the moderator');
  await page.screenshot({ path: new URL('../../server/data/item-bank-moderation.png', import.meta.url).pathname.replace(/^\/([A-Z]:)/u, '$1'), fullPage: true });
  await items.filter({ hasText: 'Запрос к таблице заказов' }).getByRole('button', { name: 'В зачёт' }).click();
  await page.getByText('Задание переведено в зачёт.').waitFor();
  await items.filter({ hasText: 'Отчёт по заказам' }).getByRole('button', { name: 'Отклонить' }).click();
  await page.getByText('Задание отклонено.').waitFor();
  await page.locator('.bank-empty').waitFor();
  assert.equal(service.bank.row(first.id).status, 'active');
  assert.equal(service.bank.row(second.id).status, 'rejected');
  await page.getByLabel('Статус').selectOption('active');
  await items.first().waitFor();
  assert.match(await items.first().innerText(), /В зачёте/u);
  assert.equal(await page.getByRole('button', { name: 'Сгенерировать' }).isDisabled(), true, 'No key and no program selected');
  await page.getByRole('link', { name: 'Достижения' }).click();
  await page.getByRole('heading', { name: 'Модерация достижений' }).waitFor();
  assert.deepEqual(errors.filter(text => !/403/u.test(text)), []);
  console.log('Item bank moderation: pilot list with keys, approve to scoring, reject, status filter.');
} finally {
  await browser.close();
  await isolated.close();
}
