// Screenshot tour of both cabinets on an isolated in-memory service.
// Usage: node frontend/tests/visual-tour.mjs [outputDir]
import { PRIVACY_POLICY_VERSION } from '../../shared/privacy.ts';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startIsolatedService } from './helpers/isolated-service.mjs';
import { answerExam, answerKey, startExam } from './helpers/exam.mjs';

const output = resolve(process.argv[2] || fileURLToPath(new URL('../../server/data/visual-tour/', import.meta.url)));
await mkdir(output, { recursive: true });
const isolated = await startIsolatedService({ authEnv: { ASSESSMENT_RETRY_DAYS: '0' } });
const { base, codes } = isolated;
const browser = await chromium.launch({ headless: true });
const errors = [];

async function actor(role, login, extra) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => Object.defineProperty(Document.prototype, 'fullscreenEnabled', { configurable: true, get: () => false }));
  const email = login + '@example.invalid';
  const data = { role, login, email, password: 'VisualTour2026!', consent: true, privacyVersion: PRIVACY_POLICY_VERSION, ...extra };
  if ((await context.request.post(base + '/api/auth/register/request-code', { data })).status() !== 202) throw new Error('registration');
  if ((await context.request.post(base + '/api/auth/register/verify', { data: { email, code: codes.get(email) } })).status() !== 201) throw new Error('verify');
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => errors.push(error.message));
  return { context, page };
}

try {
  const candidate = await actor('candidate', 'tour.candidate', { name: 'Анна Морозова' });
  let page = candidate.page;
  await page.goto(base + '/app?role=candidate&tab=onboarding');
  await page.locator('.onboarding-form [name="industry"]').selectOption('ИТ');
  await page.locator('.onboarding-form [name="professionalRole"]').fill('Backend-разработчик');
  await page.locator('.onboarding-form [name="specialization"]').selectOption('Backend');
  await page.locator('.onboarding-form [name="desiredGrade"]').selectOption('Junior');
  await page.locator('.onboarding-form [name="stack"]').fill('Python, PostgreSQL, Docker');
  await page.locator('.onboarding-form [name="experience"]').fill('1 год 6 месяцев');
  await page.getByLabel('Согласен на обработку персональных данных', { exact: true }).check();
  await page.getByLabel('Показывать профиль работодателям', { exact: true }).check();
  await page.getByRole('button', { name: 'К тесту', exact: true }).click();
  await page.locator('.main-content[data-sync-status="saved"]').waitFor();
  await page.screenshot({ path: resolve(output, 'candidate-test-setup.png'), fullPage: true });
  await startExam(page);
  await page.screenshot({ path: resolve(output, 'candidate-test-question.png') });
  await answerExam(page, answerKey('Backend', 'Junior'));
  await page.screenshot({ path: resolve(output, 'candidate-test-result.png') });
  await page.getByRole('button', { name: 'К профилю', exact: true }).click();
  await page.getByRole('heading', { name: 'Мой профиль', exact: true }).waitFor();
  await page.screenshot({ path: resolve(output, 'candidate-profile.png'), fullPage: true });

  const employer = await actor('employer', 'tour.employer', { companyName: 'Северный код' });
  page = employer.page;
  await page.goto(base + '/app?role=employer&tab=candidates');
  await page.locator('.candidate-row').first().waitFor();
  await page.screenshot({ path: resolve(output, 'employer-candidates.png'), fullPage: false });
  await page.locator('.match-details summary').first().click();
  await page.screenshot({ path: resolve(output, 'employer-match-details.png') });
  console.log(JSON.stringify({ output, errors }));
} finally {
  await browser.close();
  await isolated.close();
}
