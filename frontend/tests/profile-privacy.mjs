import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createInitialState } from '../src/model.ts';
import { startIsolatedService } from './helpers/isolated-service.mjs';

// A mocked authenticated employer and fictional profiles. Contact permission
// changes independently of the accepted invitation; no guest account is used.
const isolated = await startIsolatedService();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = []; page.on('pageerror', error => errors.push(error.message));
const account = { id: 'profile-privacy-employer', role: 'employer', login: 'profile.privacy',
  companyName: 'Вымышленный работодатель', email: 'employer@example.invalid' };
const state = createInitialState();
Object.assign(state.company, { name: account.companyName, contact: account.email });
const person = { ...createInitialState().profile, id: 'profile-privacy-candidate', name: 'Вымышленный специалист',
  email: '', phone: '', consent: true, visible: true, bio: 'Изолированный профессиональный профиль.',
  specialization: 'Frontend', desiredGrade: 'Middle', experience: '3 года', stack: ['TypeScript'],
  confirmed: { specialization: 'Frontend', grade: 'Middle', score: 82, date: '2026-10-07T00:00:00.000Z' } };
const privateContact = { email: 'late-private-contact@example.invalid', phone: '+7 000 123-45-67' };
state.invitations.push({ id: 'profile-privacy-invitation', candidateId: person.id, companyId: state.company.id,
  company: state.company.name, title: 'Вымышленное предложение', description: 'Изолированные условия',
  contact: account.email, salaryFrom: 100000, salaryTo: 150000, status: 'accepted', date: '2026-10-07T00:00:00.000Z' });
const backend = { revision: 1, consent: true, delayNextContact: false, platformReads: 0 };
let releaseContact = null;

await context.route('**/api/**', async route => {
  const url = new URL(route.request().url());
  if (url.pathname === '/api/auth/me') return route.fulfill({ json: { account } });
  if (url.pathname === '/api/platform/state') {
    assert.equal(route.request().method(), 'GET', 'The fixture must not save a draft or alter an invitation');
    backend.platformReads += 1;
    return route.fulfill({ headers: { 'X-Platform-Identity': 'auth:' + account.id },
      json: { state, revision: backend.revision, directoryPeople: backend.consent ? [person] : [],
        contactCandidateIds: backend.consent ? [person.id] : [] } });
  }
  if (url.pathname === '/api/directory/' + person.id + '/contacts') {
    if (backend.delayNextContact) {
      backend.delayNextContact = false;
      await new Promise(resolve => { releaseContact = resolve; });
      return route.fulfill({ json: privateContact });
    }
    return backend.consent ? route.fulfill({ json: privateContact })
      : route.fulfill({ status: 403, json: { error: 'Согласие отозвано.' } });
  }
  if (url.pathname === '/api/directory/' + person.id + '/evidence') {
    assert.equal(route.request().method(), 'GET');
    return backend.consent ? route.fulfill({ json: { items: [] } })
      : route.fulfill({ status: 403, json: { error: 'Согласие отозвано.' } });
  }
  throw new Error('Unexpected request in authenticated profile privacy fixture: ' + url.pathname);
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

const card = page.locator('.invitation-card');
const profileButton = card.getByRole('button', { name: 'Профиль', exact: true });
const dialog = page.getByRole('dialog', { name: 'Профиль кандидата', exact: true });
const mailto = () => page.locator('a[href="mailto:' + privateContact.email + '"]');

try {
  await page.goto(isolated.base + '/app?role=employer&tab=invitations');
  await card.getByRole('link', { name: privateContact.email, exact: true }).waitFor();
  assert.equal(await card.getByText('Принято', { exact: true }).count(), 1);

  // Open-profile makes its own contact request after background prefetch has
  // completed. Keep this specific successful reply in flight across revocation.
  backend.delayNextContact = true;
  const requested = page.waitForRequest(request => new URL(request.url()).pathname.endsWith('/contacts'));
  await profileButton.click(); await requested;
  await dialog.getByRole('link', { name: privateContact.email, exact: true }).waitFor();
  let downloaded = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'PDF-профиль', exact: true }).click();
  assert.ok((await pdfText(await downloaded)).includes(privateContact.email));

  backend.consent = false; backend.revision += 1;
  const previousReads = backend.platformReads;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  for (let count = 0; count < 100 && backend.platformReads <= previousReads; count++) await page.waitForTimeout(20);
  assert.ok(backend.platformReads > previousReads, 'Revocation requires a fresh authoritative platform read');
  await card.getByText('Контакты скрыты', { exact: true }).waitFor();
  assert.equal(await card.getByText('Принято', { exact: true }).count(), 1, 'Accepted invitation alone must not authorise contacts');
  assert.equal(await dialog.count(), 0); assert.equal(await mailto().count(), 0);
  assert.equal(await page.getByRole('button', { name: 'PDF-профиль', exact: true }).count(), 0);

  const delivered = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/contacts'));
  assert.ok(releaseContact, 'The open-profile contact response is still pending');
  releaseContact(); await delivered; await page.waitForTimeout(100);
  assert.equal(await dialog.count(), 0, 'A stale success must not resurrect the revoked profile dialog');
  assert.equal(await mailto().count(), 0, 'A stale success must not refill an accepted invitation with private email');

  // Public metadata remains accessible from the old invitation. Its new PDF
  // must respect the current permission even after the late private response.
  await profileButton.click();
  await dialog.getByRole('heading', { name: 'Контакты', exact: true }).waitFor();
  assert.equal(await dialog.locator('a[href^="mailto:"]').count(), 0);
  downloaded = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'PDF-профиль', exact: true }).click();
  const hidden = await pdfText(await downloaded);
  assert.ok(hidden.includes('Контакты скрыты')); assert.ok(!hidden.includes(privateContact.email));
  assert.ok(!hidden.includes(privateContact.phone));

  // Exercise Invitations itself with stale email still supplied by a caller.
  // Neither an accepted invitation nor an omitted authority prop grants access.
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await page.evaluate(async ({ state, person, privateContact }) => {
    const [{ default: { createElement } }, { default: { createRoot } }, { Invitations }] = await Promise.all([
      import('/node_modules/.vite/deps/react.js'), import('/node_modules/.vite/deps/react-dom_client.js'),
      import('/src/pages/Invitations.tsx'),
    ]);
    const container = document.createElement('div'); container.id = 'stale-invitation-authority';
    document.body.append(container);
    const props = { state, role: 'employer', candidates: [{ ...person, ...privateContact }], update: () => {},
      notify: () => {}, onProfile: () => {}, syncStatus: 'saved', revision: 2 };
    createRoot(container).render(createElement('div', {},
      createElement(Invitations, { ...props, contactCandidateIds: [] }), createElement(Invitations, props)));
  }, { state, person, privateContact });
  const probe = page.locator('#stale-invitation-authority');
  await probe.locator('.invitation-card').last().waitFor();
  assert.equal(await probe.getByText('Контакты скрыты', { exact: true }).count(), 2);
  assert.equal(await probe.locator('a[href^="mailto:"]').count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS A late successful profile contact reply cannot override newer server consent or re-expose contacts in invitations and PDF');
} finally {
  releaseContact?.(); await context.close(); await browser.close(); await isolated.close();
}
