import assert from 'node:assert/strict';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const base = process.env.PREDEL_URL || 'http://127.0.0.1:5173';
const origin = new URL(base).origin;
const storageKey = 'predel:platform:v2';
const require = createRequire(import.meta.url);
const mammothRequire = createRequire(require.resolve('mammoth/package.json'));
const JSZip = mammothRequire('jszip');
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' });
const page = await context.newPage();
page.setDefaultTimeout(20000);
const errors = [], externalRequests = [], importsRequests = [];
let importing = false;
page.on('pageerror', error => errors.push(error.message));
context.on('request', request => {
  if (importing && !['GET', 'HEAD'].includes(request.method())) importsRequests.push(request.url());
});
await context.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) {
    externalRequests.push(url.origin);
    await route.abort();
  } else await route.continue();
});
await mkdir(resolve('test-results'), { recursive: true });

const resumeLines = [
  'Иван Соколов', 'Frontend разработчик Middle', 'ivan.test@example.com',
  'Город: Москва', 'Опыт работы: 3 года', 'Навыки: React, TypeScript, JavaScript, CSS',
  'Софт-скиллы: Коммуникация, Работа в команде',
  'Достижения', 'Ускорил загрузку интерфейса на 30 процентов.',
  'Образование', 'Тестовый университет, информатика, 2020',
  'Языки', 'Английский B2', 'Портфолио', 'https://github.com/ivan-test',
];

async function docx(lines) {
  const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + lines.map(line => '<w:p><w:r><w:t>' + escape(line) + '</w:t></w:r></w:p>').join('') + '</w:body></w:document>');
  return zip.generateAsync({ type: 'nodebuffer' });
}

function nativePdf(lines) {
  const stream = 'BT /F1 14 Tf 45 750 Td 24 TL\n' + lines.map((line, index) => (index ? 'T* ' : '') + '(' + line.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)') + ') Tj').join('\n') + '\nET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length ' + Buffer.byteLength(stream) + ' >>\nstream\n' + stream + '\nendstream',
  ];
  let output = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(output)); output += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(output);
  output += 'xref\n0 6\n0000000000 65535 f \n' + offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('');
  output += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output);
}

async function imageResume(mimeType = 'image/png') {
  const data = await page.evaluate(({ lines, mimeType }) => {
    const canvas = document.createElement('canvas'); canvas.width = 1500; canvas.height = 1450;
    const canvasContext = canvas.getContext('2d');
    canvasContext.fillStyle = '#fff'; canvasContext.fillRect(0, 0, canvas.width, canvas.height);
    canvasContext.fillStyle = '#111'; canvasContext.font = '38px Arial';
    lines.forEach((line, index) => canvasContext.fillText(line, 65, 85 + index * 77));
    return canvas.toDataURL(mimeType, 0.98).split(',')[1];
  }, { lines: resumeLines, mimeType });
  return Buffer.from(data, 'base64');
}

function scannedPdf(jpeg) {
  const stream = Buffer.from('q 560 0 0 541 26 180 cm /Im1 Do Q');
  const objects = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Count 1 /Kids [3 0 R] >>'),
    Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>'),
    Buffer.concat([Buffer.from('<< /Type /XObject /Subtype /Image /Width 1500 /Height 1450 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpeg.length + ' >>\nstream\n'), jpeg, Buffer.from('\nendstream')]),
    Buffer.concat([Buffer.from('<< /Length ' + stream.length + ' >>\nstream\n'), stream, Buffer.from('\nendstream')]),
  ];
  const parts = [Buffer.from('%PDF-1.4\n')], offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(parts.reduce((length, part) => length + part.length, 0));
    parts.push(Buffer.from(`${index + 1} 0 obj\n`), object, Buffer.from('\nendobj\n'));
  }
  const xref = parts.reduce((length, part) => length + part.length, 0);
  parts.push(Buffer.from('xref\n0 6\n0000000000 65535 f \n' + offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
  return Buffer.concat(parts);
}

async function resetForm() {
  await page.goto(base + '/app?role=candidate');
  await page.evaluate(key => { localStorage.removeItem(key); sessionStorage.clear(); }, storageKey);
  await page.reload();
  await page.getByRole('heading', { name: 'Анкета', exact: true }).waitFor();
}
async function attach(file, duringRead) {
  importing = true;
  try {
    await page.getByLabel('Файл резюме').setInputFiles(file);
    if (duringRead) await duringRead();
    await page.locator('.resume-import[aria-busy="false"]').waitFor({ timeout: 180000 });
    assert.equal(await page.locator('.resume-import [role="alert"]').count(), 0, 'Resume import failed: ' + await page.locator('.resume-import [role="alert"]').allTextContents());
  } finally { importing = false; }
  assert.deepEqual(importsRequests, [], 'Resume import must never submit files or personal data');
}
async function assertNoAutomaticConsent() {
  assert.equal(await page.locator('[name="consent"]').isChecked(), false);
  assert.equal(await page.locator('[name="visible"]').isChecked(), false);
  assert.equal(await page.locator('[name="visible"]').isDisabled(), true);
  const state = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey);
  assert.equal(state.profile.confirmed, null, 'Resume cannot confer a verified grade');
  assert.equal(state.surveys.length, 0, 'Import cannot silently complete the questionnaire');
}
async function mobileAudit(target = page) {
  await target.setViewportSize({ width: 320, height: 750 });
  assert.equal(await target.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'Page overflows at 320px');
  await target.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const issues = await target.evaluate(async () => (await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(issue => issue.id));
  assert.deepEqual(issues, []);
}

try {
  await resetForm();
  assert.equal(await page.locator('.resume-import').count(), 1);
  assert.equal(await page.locator('.resume-import').evaluate(card => card.compareDocumentPosition(document.querySelector('input[name="name"]')) & Node.DOCUMENT_POSITION_FOLLOWING), 4);
  const docxBuffer = await docx(resumeLines);
  await attach({ name: 'synthetic-resume.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: docxBuffer });
  assert.equal(await page.locator('[name="name"]').inputValue(), 'Иван Соколов');
  assert.equal(await page.locator('[name="email"]').inputValue(), 'ivan.test@example.com');
  assert.match(await page.locator('[name="stack"]').inputValue(), /React/);
  assert.equal(await page.locator('[name="specialization"]').inputValue(), 'Frontend');
  await assertNoAutomaticConsent();
  await page.screenshot({ path: resolve('test-results', 'resume-desktop.png'), fullPage: true });
  await mobileAudit();
  await page.screenshot({ path: resolve('test-results', 'resume-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1100 });

  await page.locator('[name="name"]').fill('Ручная правка');
  const filledDraft = await page.locator('.onboarding-form').evaluate(form => [...new FormData(form).entries()]);
  await page.getByRole('button', { name: 'Удалить резюме', exact: true }).click();
  assert.equal(await page.locator('.resume-file-name').count(), 0);
  assert.equal(await page.locator('.resume-import [role="status"]').textContent(), '');
  assert.equal(await page.getByRole('button', { name: 'Добавить резюме', exact: true }).isVisible(), true);
  assert.deepEqual(await page.locator('.onboarding-form').evaluate(form => [...new FormData(form).entries()]), filledDraft, 'Removing the attachment must preserve imported fields and manual edits');
  const popupPromise = context.waitForEvent('page');
  await page.getByRole('link', { name: 'Политика конфиденциальности', exact: true }).click();
  const privacy = await popupPromise;
  await privacy.getByRole('heading', { name: 'Политика конфиденциальности', exact: true }).waitFor();
  assert.match(privacy.url(), /\/privacy$/);
  assert.equal(await privacy.getByRole('heading', { name: 'Анкета', exact: true }).count(), 0);
  assert.equal(await page.locator('[name="name"]').inputValue(), 'Ручная правка', 'Policy link must preserve unsaved edits');
  await mobileAudit(privacy);
  await privacy.screenshot({ path: resolve('test-results', 'privacy-mobile.png'), fullPage: true });
  await privacy.close();

  for (const invalid of [
    { name: 'archive.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('invalid') },
    { name: 'oversized.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(25 * 1024 * 1024) },
    { name: 'empty.txt', mimeType: 'text/plain', buffer: Buffer.alloc(0) },
    { name: 'corrupted.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a PDF') },
  ]) {
    importing = true;
    await page.getByLabel('Файл резюме').setInputFiles(invalid);
    await page.locator('.resume-import [role="alert"]').waitFor();
    await page.locator('.resume-import[aria-busy="false"]').waitFor();
    importing = false;
    assert.equal(await page.locator('[name="name"]').inputValue(), 'Ручная правка');
    assert.equal(await page.locator('[name="email"]').inputValue(), 'ivan.test@example.com');
  }

  await resetForm();
  await attach({ name: 'native.pdf', mimeType: 'application/pdf', buffer: nativePdf(['Ivan Sokolov', 'Frontend developer Middle', 'ivan.native@example.com', 'Skills: React, TypeScript, JavaScript, CSS', 'Experience: 3 years', 'Education', 'Example university 2020']) });
  assert.equal(await page.locator('[name="email"]').inputValue(), 'ivan.native@example.com');
  assert.match(await page.locator('[name="stack"]').inputValue(), /React/);
  await assertNoAutomaticConsent();

  await resetForm();
  await attach({ name: 'scanned.pdf', mimeType: 'application/pdf', buffer: scannedPdf(await imageResume('image/jpeg')) });
  assert.equal(await page.locator('[name="email"]').inputValue(), 'ivan.test@example.com', 'Image-only PDF must use actual OCR fallback');
  assert.match(await page.locator('[name="stack"]').inputValue(), /React/);
  await assertNoAutomaticConsent();

  await resetForm();
  const png = await imageResume();
  await attach({ name: 'scan.png', mimeType: 'image/png', buffer: png }, async () => {
    await page.locator('.resume-import[aria-busy="true"]').waitFor();
    assert.equal(await page.getByRole('button', { name: 'К тесту', exact: true }).isDisabled(), true);
    await page.locator('[name="name"]').fill('Правка во время OCR');
  });
  assert.equal(await page.locator('[name="name"]').inputValue(), 'Правка во время OCR', 'OCR must preserve edits made while reading');
  assert.equal(await page.locator('[name="email"]').inputValue(), 'ivan.test@example.com', 'Image text must be recognized by actual OCR');
  assert.match(await page.locator('[name="stack"]').inputValue(), /React/);
  await assertNoAutomaticConsent();

  await page.getByLabel('Файл резюме').setInputFiles({ name: 'cancel-scan.png', mimeType: 'image/png', buffer: png });
  await page.locator('.resume-import[aria-busy="true"]').waitFor();
  await page.getByRole('button', { name: 'Отменить', exact: true }).click();
  assert.equal(await page.locator('.resume-import').getAttribute('aria-busy'), 'false');
  assert.equal(await page.locator('[name="name"]').inputValue(), 'Правка во время OCR');
  assert.equal(await page.locator('[name="email"]').inputValue(), 'ivan.test@example.com');
  assert.equal(await page.getByRole('button', { name: 'К тесту', exact: true }).isEnabled(), true);

  await page.locator('[name="name"]').fill('Иван Соколов');
  await page.locator('[name="industry"]').selectOption('ИТ');
  await page.locator('[name="professionalRole"]').fill('Разработчик');
  await page.locator('[name="specialization"]').selectOption('Frontend');
  await page.locator('[name="desiredGrade"]').selectOption('Middle');
  await page.locator('[name="experience"]').fill('3 года');
  await page.locator('[name="careerAchievements"]').fill('Ускорил интерфейс на 30 процентов');
  await page.getByText('Подробнее о себе', { exact: true }).click();
  for (const [name, value] of Object.entries({ education: 'Тестовый университет', workHistory: 'Тестовая компания, разработка интерфейсов', languages: 'Английский B2', phone: '+79990001122', portfolio: 'https://github.com/ivan-test' })) await page.locator(`[name="${name}"]`).fill(value);
  await page.locator('[name="format"]').selectOption('Гибрид');
  await page.getByRole('checkbox', { name: 'Коммуникация', exact: true }).check();
  await page.locator('[name="consent"]').check();
  await page.getByRole('button', { name: 'К тесту', exact: true }).click();
  await page.getByRole('button', { name: 'Начать тест', exact: true }).waitFor();
  let saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey);
  assert.equal(saved.profile.education, 'Тестовый университет');
  assert.equal(saved.profile.careerAchievements, 'Ускорил интерфейс на 30 процентов');
  assert.equal(saved.surveys[0].workHistory, 'Тестовая компания, разработка интерфейсов');
  assert.equal(saved.profile.format, 'Гибрид');
  assert.equal(saved.profile.visible, false);
  assert.equal(saved.profile.confirmed, null);
  assert.ok(!JSON.stringify(saved).includes('scan.png'), 'Raw resume file must not be persisted');
  await page.reload();
  await page.getByRole('button', { name: 'Начать тест', exact: true }).waitFor();
  saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey);
  assert.equal(saved.profile.education, 'Тестовый университет');
  const requestPromise = page.waitForRequest(request => request.url().endsWith('/api/assessment/attempts') && request.method() === 'POST');
  const responsePromise = page.waitForResponse(response => response.url().endsWith('/api/assessment/attempts') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Начать тест', exact: true }).click();
  const body = (await requestPromise).postDataJSON();
  assert.deepEqual(Object.keys(body.survey).sort(), ['date', 'desiredGrade', 'experience', 'id', 'industry', 'professionalRole', 'softSkills', 'specialization', 'stack'].sort(), 'Assessment request must omit contacts and additional resume sections');
  for (const privateValue of ['ivan.test@example.com', '+79990001122', 'Тестовый университет', 'Ускорил интерфейс', 'github.com/ivan-test']) assert.ok(!JSON.stringify(body).includes(privateValue));
  const serverAttempt = await (await responsePromise).json();
  await page.locator('.question-text').waitFor();

  // Local deletion is explicit, reversible until confirmed, and synchronized to
  // other tabs. It intentionally leaves separately stored server attempts intact.
  const beforeErase = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey);
  const erasePolicy = await context.newPage();
  await erasePolicy.goto(base + '/privacy');
  await erasePolicy.getByRole('heading', { name: 'Политика конфиденциальности', exact: true }).waitFor();
  await erasePolicy.evaluate(() => {
    localStorage.setItem('predel:test:unrelated', 'keep');
    localStorage.setItem('predel:platform:v1', 'legacy');
    sessionStorage.setItem('predel:assessment:v1', 'local-session');
    sessionStorage.setItem('predel:search', 'local-search');
  });
  await erasePolicy.getByRole('button', { name: 'Удалить данные браузера', exact: true }).click();
  assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey), beforeErase, 'First deletion click must not delete data');
  await erasePolicy.getByRole('button', { name: 'Отмена', exact: true }).click();
  assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey), beforeErase, 'Cancelling must preserve saved questionnaire');
  await erasePolicy.getByRole('button', { name: 'Удалить данные браузера', exact: true }).click();
  await erasePolicy.getByRole('button', { name: 'Удалить', exact: true }).click();
  await erasePolicy.getByText('Данные этого браузера удалены.', { exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Анкета', exact: true }).waitFor();
  assert.equal(await page.locator('[name="name"]').inputValue(), '', 'Other tab must reset the deleted profile');
  const erased = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey);
  assert.equal(erased.profile.name, '');
  assert.equal(erased.profile.consent, false);
  assert.equal(erased.profile.visible, false);
  assert.equal(erased.profile.confirmed, null);
  assert.deepEqual(erased.surveys, []);
  assert.deepEqual(erased.history, []);
  assert.equal(await erasePolicy.evaluate(() => localStorage.getItem('predel:platform:v1')), null);
  assert.equal(await erasePolicy.evaluate(() => localStorage.getItem('predel:test:unrelated')), 'keep');
  assert.equal(await erasePolicy.evaluate(() => sessionStorage.getItem('predel:assessment:v1')), null);
  assert.equal(await erasePolicy.evaluate(() => sessionStorage.getItem('predel:search')), null);
  const retainedAttempt = await context.request.get(base + '/api/assessment/attempts/' + serverAttempt.id, { headers: { 'X-Attempt-Token': serverAttempt.token } });
  assert.equal(retainedAttempt.status(), 200, 'Local deletion must not claim to delete server records');
  assert.equal((await retainedAttempt.json()).id, serverAttempt.id);
  await erasePolicy.close();

  if (process.env.PREDEL_RESUMES) {
    const folder = process.env.PREDEL_RESUMES;
    const files = (await readdir(folder)).filter(name => extname(name).toLowerCase() === '.pdf');
    assert.ok(files.length, 'No sample PDFs found');
    for (const name of files) {
      await resetForm();
      const buffer = await readFile(resolve(folder, name));
      // Only aggregate diagnostics leave the browser; personal fields are never logged.
      const diagnostics = await page.evaluate(async ({ name, data }) => {
        const { readResume } = await import('/src/resume.ts');
        const file = new File([Uint8Array.from(atob(data), char => char.charCodeAt(0))], name, { type: 'application/pdf' });
        const result = await readResume(file);
        return { method: result.method, pages: result.pages, fields: Object.keys(result.fields).filter(key => Array.isArray(result.fields[key]) ? result.fields[key].length : Boolean(result.fields[key])) };
      }, { name, data: buffer.toString('base64') });
      await attach({ name, mimeType: 'application/pdf', buffer });
      await assertNoAutomaticConsent();
      assert.ok(diagnostics.fields.length > 0, 'Sample must produce at least one parsed field');
      console.log(JSON.stringify({ file: name, ...diagnostics, fieldCount: diagnostics.fields.length }));
    }
  }
  if (process.env.PREDEL_SCAN) {
    await resetForm();
    const path = process.env.PREDEL_SCAN;
    await attach({ name: basename(path), mimeType: 'image/png', buffer: await readFile(path) });
    const count = await page.locator('.onboarding-form input:not([type="checkbox"])').evaluateAll(inputs => inputs.filter(input => input.value).length);
    assert.ok(count >= 2, 'Real resume scan must recognize multiple fields');
    await assertNoAutomaticConsent();
    console.log(JSON.stringify({ scan: basename(path), filledFields: count }));
  }
  assert.deepEqual(importsRequests, []);
  assert.deepEqual(externalRequests, [], 'All parser and OCR assets must be loaded from this site');
  assert.deepEqual(errors, []);
  console.log('PASS PDF and DOCX text, actual Russian/English OCR, errors and cancellation, edit preservation, consent, policy and confirmed local deletion across tabs, saved fields, private API payload, mobile accessibility');
} finally { await context.close(); await browser.close(); }
