import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createInitialState } from '../src/model.ts';
import { startIsolatedService } from './helpers/isolated-service.mjs';

// Authenticated employer protocol fixture with fictional applicant data. No
// guest session, live account, production database or resume is involved.
const isolated = await startIsolatedService();
const base = isolated.base;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = []; page.on('pageerror', error => errors.push(error.message));
const account = { id: 'application-privacy-employer', role: 'employer', login: 'privacy.employer',
  companyName: 'Вымышленная компания', email: 'company@example.invalid' };
const state = createInitialState();
Object.assign(state.company, { name: account.companyName, contact: account.email });
const person = { ...createInitialState().profile, id: 'application-privacy-candidate', name: 'Вымышленный кандидат',
  email: '', phone: '', consent: true, visible: false, bio: 'Тестовый профессиональный профиль.', stack: ['TypeScript'],
  experience: '3 года', specialization: 'Frontend', desiredGrade: 'Middle',
  confirmed: { specialization: 'Frontend', grade: 'Middle', score: 90, date: '2026-10-07T00:00:00.000Z' } };
const privateContact = { email: 'withdrawn-private@example.invalid', phone: '+7 000 123-45-67' };
const application = { id: 'application-privacy', candidateId: person.id, candidate: person, vacancyId: 'vacancy-privacy',
  companyId: state.company.id, company: state.company.name, status: 'sent', date: '2026-10-07T00:00:00.000Z', respondedAt: null,
  message: '', synthetic: false, vacancy: { id: 'vacancy-privacy', companyId: state.company.id, company: state.company.name,
    title: 'Разработчик', description: 'Тестовые условия', specialization: 'Frontend', grade: 'Middle', city: 'Москва',
    format: 'Удалённо', stack: ['TypeScript'], salaryFrom: 100000, salaryTo: 150000, currency: 'RUB', status: 'open', synthetic: false } };
const backend = { revision: 1, consent: true, denyContacts: false, delayContacts: false, applications: 0 };
let releaseContact = null;

await context.route('**/api/**', async route => {
  const url = new URL(route.request().url());
  if (url.pathname === '/api/auth/me') return route.fulfill({ json: { account } });
  if (url.pathname === '/api/platform/state') return route.fulfill({
    headers: { 'X-Platform-Identity': 'auth:' + account.id },
    json: { state, revision: backend.revision, directoryPeople: [], contactCandidateIds: [] },
  });
  if (url.pathname === '/api/applications') {
    backend.applications += 1;
    return route.fulfill({ json: { items: [{ ...application, candidate: backend.consent ? person : null }] } });
  }
  if (url.pathname === '/api/directory/' + person.id + '/contacts') {
    if (backend.delayContacts) {
      backend.delayContacts = false;
      await new Promise(resolve => { releaseContact = resolve; });
      return route.fulfill({ json: privateContact });
    }
    return backend.denyContacts || !backend.consent
      ? route.fulfill({ status: 403, json: { error: 'Согласие отозвано. Контакты недоступны.' } })
      : route.fulfill({ json: privateContact });
  }
  // Neutral responses for panels unrelated to contact privacy.
  if (url.pathname === '/api/directory/' + person.id + '/evidence') return route.fulfill({ json: { items: [] } });
  if (url.pathname === '/api/assistant/info') return route.fulfill({ json: { version: 'fixture', llm: false, model: null, notice: '' } });
  throw new Error('Unexpected request in authenticated privacy fixture: ' + url.pathname);
});

async function pdfText(download) {
  const stream = await download.createReadStream(), chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const bytes = Buffer.concat(chunks); assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  return page.evaluate(async bytes => {
    const pdfjs = await import('/node_modules/pdfjs-dist/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/resume-assets/pdf/pdf.worker.min.mjs';
    const task = pdfjs.getDocument({ data: new Uint8Array(bytes), cMapUrl: '/resume-assets/pdf/cmaps/', cMapPacked: true,
      standardFontDataUrl: '/resume-assets/pdf/standard_fonts/', wasmUrl: '/resume-assets/pdf/wasm/' });
    try {
      const document = await task.promise, texts = [];
      for (let index = 1; index <= document.numPages; index++) {
        const sheet = await document.getPage(index), content = await sheet.getTextContent();
        texts.push(content.items.map(item => item.str || '').join(' ')); sheet.cleanup();
      }
      return texts.join('\n');
    } finally { await task.destroy(); }
  }, [...bytes]);
}
const dialog = page.getByRole('dialog', { name: 'Профиль кандидата', exact: true });
const profileButton = page.locator('.application-card').getByRole('button', { name: 'Профиль', exact: true });
async function refresh() {
  const previous = backend.applications;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  // The fresh platform revision triggers this component's application reload.
  for (let count = 0; count < 100 && backend.applications <= previous; count++) await page.waitForTimeout(20);
  assert.ok(backend.applications > previous, 'A fresh authenticated platform revision must reload applications');
}

try {
  await page.goto(base + '/app?role=employer&tab=invitations');
  await page.getByRole('button', { name: 'Отклики', exact: true }).click();
  await profileButton.click();
  await dialog.getByRole('link', { name: privateContact.email, exact: true }).waitFor();
  let downloaded = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'PDF-профиль', exact: true }).click();
  assert.ok((await pdfText(await downloaded)).includes(privateContact.email));

  // Revocation discovered by a later server snapshot closes the currently
  // authorised profile, including its previously available PDF export action.
  backend.consent = false; backend.revision += 1;
  await refresh();
  await page.getByText('Профиль кандидата недоступен', { exact: true }).waitFor();
  assert.equal(await dialog.count(), 0); assert.equal(await profileButton.count(), 0);
  assert.equal(await page.getByRole('button', { name: 'PDF-профиль', exact: true }).count(), 0);
  console.log('PASS A current consent revocation closes the already authorised applicant profile and its PDF action');

  backend.consent = true; backend.revision += 1;
  await refresh(); await profileButton.waitFor();

  // Existing public application metadata is stale, but a new contact check is
  // authoritative. The resulting PDF must use denied permission immediately.
  backend.denyContacts = true;
  await profileButton.click();
  await dialog.getByRole('alert').waitFor();
  assert.equal(await dialog.locator('a[href^="mailto:"]').count(), 0);
  downloaded = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'PDF-профиль', exact: true }).click();
  const hidden = await pdfText(await downloaded);
  assert.ok(hidden.includes('Контакты скрыты')); assert.ok(!hidden.includes(privateContact.email));
  console.log('PASS Authenticated applicant contact denial immediately removes cached contact data from the profile and its PDF');

  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
  backend.denyContacts = false;
  backend.delayContacts = true;
  const requested = page.waitForRequest(request => new URL(request.url()).pathname.endsWith('/contacts'));
  await profileButton.click(); await requested;
  await dialog.getByRole('status').waitFor();
  backend.consent = false; backend.revision += 1;
  await refresh(); await page.getByText('Профиль кандидата недоступен', { exact: true }).waitFor();
  const delivered = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/contacts'));
  assert.ok(releaseContact); releaseContact(); await delivered; await page.waitForTimeout(100);
  assert.equal(await dialog.count(), 0); assert.equal(await page.locator('a[href="mailto:' + privateContact.email + '"]').count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS A late successful contact reply cannot restore a dialog invalidated by a newer authenticated server revision');
} finally {
  releaseContact?.(); await context.close(); await browser.close(); await isolated.close();
}
