import assert from 'node:assert/strict';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { programs } from '../../server/bank.mjs';

const base = process.env.PREDEL_URL || 'http://127.0.0.1:5173';
const origin = new URL(base).origin;
const storageKey = 'predel:platform:v2';
const require = createRequire(import.meta.url);
const mammothRequire = createRequire(require.resolve('mammoth/package.json'));
const JSZip = mammothRequire('jszip');
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' });
const page = await context.newPage();
await page.clock.setFixedTime(new Date('2026-10-06T09:00:00+03:00'));
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

function resumePdf(pages) {
  const objects = [Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'), null, Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')];
  const add = value => { objects.push(Buffer.isBuffer(value) ? value : Buffer.from(value)); return objects.length; };
  const children = pages.map(source => {
    const drawing = [], resources = [];
    if (source.lines) {
      drawing.push('BT ' + (source.invisibleText ? '3 Tr ' : '') + '/F1 14 Tf 45 750 Td 24 TL\n' + source.lines.map((line, index) => (index ? 'T* ' : '') + '(' + line.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)') + ') Tj').join('\n') + '\nET');
      resources.push('/Font << /F1 3 0 R >>');
    }
    if (source.jpeg) {
      const height = source.height || 1450;
      const width = source.renderedWidth || 560;
      const image = add(Buffer.concat([Buffer.from('<< /Type /XObject /Subtype /Image /Width 1500 /Height ' + height + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + source.jpeg.length + ' >>\nstream\n'), source.jpeg, Buffer.from('\nendstream')]));
      if (source.formImage) {
        const formStream = 'q 1 0 0 1 0 0 cm /Im1 Do Q';
        const form = add(`<< /Type /XObject /Subtype /Form /BBox [0 0 1 1] /Matrix [${width} 0 0 ${width * height / 1500} 26 26] /Resources << /XObject << /Im1 ${image} 0 R >> >> /Length ${formStream.length} >>\nstream\n${formStream}\nendstream`);
        drawing.push('q /Fm1 Do Q');
        resources.push(`/XObject << /Fm1 ${form} 0 R >>`);
      } else {
        drawing.push(`q ${width} 0 0 ${width * height / 1500} 26 26 cm /Im1 Do Q`);
        resources.push(`/XObject << /Im1 ${image} 0 R >>`);
      }
    }
    const stream = Buffer.from(drawing.join('\n'));
    const content = add(Buffer.concat([Buffer.from('<< /Length ' + stream.length + ' >>\nstream\n'), stream, Buffer.from('\nendstream')]));
    return add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << ${resources.join(' ')} >> /Contents ${content} 0 R >>`);
  });
  objects[1] = Buffer.from(`<< /Type /Pages /Count ${children.length} /Kids [${children.map(child => `${child} 0 R`).join(' ')}] >>`);
  const parts = [Buffer.from('%PDF-1.4\n')], offsets = [0];
  let length = parts[0].length;
  for (const [index, object] of objects.entries()) {
    offsets.push(length);
    const chunk = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`), object, Buffer.from('\nendobj\n')]);
    parts.push(chunk); length += chunk.length;
  }
  const size = objects.length + 1;
  parts.push(Buffer.from(`xref\n0 ${size}\n0000000000 65535 f \n` + offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF\n`));
  return Buffer.concat(parts);
}

function nativePdf(lines) { return resumePdf([{ lines }]); }

const imageHeight = lines => Math.max(1450, 160 + lines.length * 77);
async function imageResume(mimeType = 'image/png', lines = resumeLines) {
  const data = await page.evaluate(({ lines, mimeType, height }) => {
    const canvas = document.createElement('canvas'); canvas.width = 1500; canvas.height = height;
    const canvasContext = canvas.getContext('2d');
    canvasContext.fillStyle = '#fff'; canvasContext.fillRect(0, 0, canvas.width, canvas.height);
    canvasContext.fillStyle = '#111'; canvasContext.font = '38px Arial';
    lines.forEach((line, index) => canvasContext.fillText(line, 65, 85 + index * 77));
    return canvas.toDataURL(mimeType, 0.98).split(',')[1];
  }, { lines, mimeType, height: imageHeight(lines) });
  return Buffer.from(data, 'base64');
}

function scannedPdf(jpeg) { return resumePdf([{ jpeg }]); }

const experiencePages = [
  [
    'Иван Соколов', 'Frontend разработчик Middle', 'ivan.test@example.com',
    'Город: Москва', 'Навыки: React, TypeScript, CSS, Git', 'Опыт работы: 6 лет',
    'North Company', 'Январь 2023 - настоящее время', 'Frontend разработчик',
    'Разрабатывал личный кабинет и интеграцию платежей.',
    'Достижения', 'Ускорил загрузку приложения на 42 процента.',
    'Vector Company', 'Март 2021 - Декабрь 2022', 'Frontend разработчик',
    'Создал библиотеку компонентов и панель аналитики.',
    'Достижения', 'Снизил количество ошибок интерфейса на 35 процентов.',
  ],
  [
    'Start Company', 'Август 2020 - Февраль 2021', 'Frontend стажер',
    'Верстал каталог и писал модульные тесты.',
    'Достижения', 'Покрыл тестами 80 процентов компонентов.',
    'Образование', 'Тестовый университет, информатика, 2020',
    'Языки', 'Английский B2', 'Портфолио', 'https://github.com/ivan-test',
  ],
];
const nativeExperiencePage = [
  'Ivan Sokolov', 'Frontend developer Middle', 'ivan.test@example.com',
  'Skills: React, TypeScript, CSS, Git', 'Experience: 6 years',
  'North Company', 'January 2023 - present', 'Frontend developer',
  'Implemented account pages and payments.', 'Achievements', 'Improved loading by 42 percent.',
  'Vector Company', 'March 2021 - December 2022', 'Frontend developer',
  'Created a component library and analytics.', 'Achievements', 'Reduced errors by 35 percent.',
];

async function inspectDocument(file) {
  importing = true;
  try {
    return await page.evaluate(async ({ name, data }) => {
      const { readResume } = await import('/src/resume.ts');
      return readResume(new File([Uint8Array.from(atob(data), char => char.charCodeAt(0))], name));
    }, { name: file.name, data: file.buffer.toString('base64') });
  } finally { importing = false; }
}

function assertCompleteExperience(result, method) {
  assert.equal(result.method, method);
  assert.equal(result.pages, 2);
  assert.equal(result.fields.email, 'ivan.test@example.com');
  assert.ok(result.fields.stack.includes('React'));
  assert.ok(result.fields.stack.includes('TypeScript'));
  for (const company of ['North Company', 'Vector Company', 'Start Company']) {
    assert.ok(result.text.includes(company), `OCR lost ${company}`);
    assert.ok(result.fields.workHistory.includes(company), `Import lost ${company} after a nested achievement heading`);
  }
  for (const percentage of ['42', '35', '80']) assert.ok(result.fields.workHistory.includes(percentage), 'Job achievements must remain with their experience');
  assert.match(result.fields.education, /университет/);
  assert.match(result.fields.languages, /[BВ]2/, 'OCR must retain the language level, allowing its visually identical Cyrillic letter');
  assert.match(result.fields.portfolio, /github\.com\/ivan-test/);
}

async function resetForm() {
  await page.goto(base + '/app?role=candidate');
  await page.evaluate(key => { localStorage.removeItem(key); sessionStorage.clear(); }, storageKey);
  await page.reload();
  await page.getByRole('heading', { name: 'Анкета', exact: true }).waitFor();
  await waitForSaved();
}
async function waitForSaved(target = page) {
  await target.waitForFunction(() => ['saved', 'error'].includes(document.querySelector('.main-content')?.getAttribute('data-sync-status')));
  assert.equal(await target.locator('.main-content').getAttribute('data-sync-status'), 'saved', 'Server persistence failed');
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
  assert.equal(await page.getByLabel('Коммуникация', { exact: true }).isChecked(), true);
  assert.equal(await page.getByLabel('Работа в команде', { exact: true }).isChecked(), true);
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

  // Every page is raster-only: actual OCR must retain all jobs across page
  // boundaries even when their descriptions contain achievement headings.
  await resetForm();
  const experienceImages = [];
  for (const lines of experiencePages) experienceImages.push({ jpeg: await imageResume('image/jpeg', lines), height: imageHeight(lines) });
  const multipageScan = { name: 'multi-job-scan.pdf', mimeType: 'application/pdf', buffer: resumePdf(experienceImages) };
  assertCompleteExperience(await inspectDocument(multipageScan), 'ocr');
  await attach(multipageScan);
  for (const company of ['North Company', 'Vector Company', 'Start Company']) assert.match(await page.locator('[name="workHistory"]').inputValue(), new RegExp(company));
  assert.equal(await page.locator('[name="workHistory"]').isVisible(), true, 'Imported work history must be visible in the main questionnaire');
  await assertNoAutomaticConsent();

  const datedLines = experiencePages[0].map(line => line.replace('Опыт работы: 6 лет', 'Опыт работы'));
  const datedScan = { name: 'synthetic-dated-scan.pdf', mimeType: 'application/pdf', buffer: resumePdf([
    { jpeg: await imageResume('image/jpeg', datedLines), height: imageHeight(datedLines) }, experienceImages[1],
  ]) };
  const datedResult = await inspectDocument(datedScan);
  assert.equal(datedResult.fields.experience, '6 лет 3 месяца', 'Actual OCR dates must automatically fill the total without an explicit summary');
  assertCompleteExperience(datedResult, 'ocr');
  await attach(datedScan);
  assert.equal(await page.locator('[name="experience"]').inputValue(), '6 лет 3 месяца');

  const invalidPeriodResume = { name: 'synthetic-invalid-dates.txt', mimeType: 'text/plain', buffer: Buffer.from([
    'Иван Соколов', 'Frontend Senior', 'grade.test@example.com', 'Навыки: React', 'Опыт работы',
    'Компания Север 03.2021 — 09.2021', 'Компания Вектор 09.2022 — 03.2022',
  ].join('\n')) };
  await attach(invalidPeriodResume);
  assert.equal(await page.locator('[name="experience"]').inputValue(), '7 месяцев (по корректным датам)');
  assert.match(await page.locator('.resume-import [role="status"]').textContent(), /Некоторые периоды работы не учтены/);
  await page.screenshot({ path: resolve('test-results', 'resume-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 320, height: 750 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'Imported multi-job history must not overflow at 320px');
  await page.screenshot({ path: resolve('test-results', 'resume-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1100 });

  // A text page cannot suppress recognition of a later scanned page.
  const mixedPdf = { name: 'mixed-job-resume.pdf', mimeType: 'application/pdf', buffer: resumePdf([{ lines: nativeExperiencePage }, experienceImages[1]]) };
  assertCompleteExperience(await inspectDocument(mixedPdf), 'mixed');

  // An interrupted text layer contains a readable header while the page image
  // still contains two jobs absent from that layer. It must trigger OCR too.
  const partialPdf = { name: 'partial-layer-job-resume.pdf', mimeType: 'application/pdf', buffer: resumePdf([
    { ...experienceImages[0], lines: [...nativeExperiencePage.slice(0, 5), 'Phone: +7 900 111 22 33', 'City: Moscow', 'Format: hybrid'], invisibleText: true }, experienceImages[1],
  ]) };
  assertCompleteExperience(await inspectDocument(partialPdf), 'ocr');
  const partialFormPdf = { name: 'partial-layer-form-resume.pdf', mimeType: 'application/pdf', buffer: resumePdf([
    { ...experienceImages[0], lines: [...nativeExperiencePage.slice(0, 5), 'Phone: +7 900 111 22 33', 'City: Moscow', 'Format: hybrid'], invisibleText: true, formImage: true }, experienceImages[1],
  ]) };
  assertCompleteExperience(await inspectDocument(partialFormPdf), 'ocr');
  const smallImagePdf = { name: 'native-with-small-image.pdf', mimeType: 'application/pdf', buffer: resumePdf([
    { ...experienceImages[0], lines: nativeExperiencePage, renderedWidth: 80 },
  ]) };
  const smallImageResult = await inspectDocument(smallImagePdf);
  assert.equal(smallImageResult.method, 'text', 'A small photo or logo must not force OCR of a readable text page');
  assert.equal(smallImageResult.fields.email, 'ivan.test@example.com');

  await resetForm();
  const oversizedHistory = ['Long Synthetic Company', 'Январь 2020 - настоящее время', 'Frontend разработчик', ...Array.from({ length: 260 }, (_, index) => `Задача ${index + 1}: разработал страницу каталога, написал тесты и улучшил доступность интерфейса.`)].join('\n');
  assert.ok(oversizedHistory.length > 20000);
  const oversizedResume = { name: 'synthetic-long-history.txt', mimeType: 'text/plain', buffer: Buffer.from(['Иван Соколов', 'Frontend разработчик Middle', 'ivan.test@example.com', 'Навыки: React, TypeScript', 'Опыт работы: 6 лет', oversizedHistory, 'Образование', 'Тестовый университет'].join('\n')) };
  const oversizedResult = await inspectDocument(oversizedResume);
  assert.equal(oversizedResult.method, 'text');
  assert.ok(oversizedResult.truncatedFields.includes('workHistory'));
  assert.equal(oversizedResult.fields.workHistory.length, 20000);
  await attach(oversizedResume);
  assert.match(await page.locator('.resume-import [role="status"]').textContent(), /Сокращены длинные поля: Места работы и проекты/);
  const boundedHistory = await page.locator('[name="workHistory"]').inputValue();
  assert.ok(boundedHistory.length <= 20000 && boundedHistory.length > 19000);
  assert.ok(boundedHistory.startsWith('Long Synthetic Company'));
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
  const longHistory = ['Тестовая компания, разработка интерфейсов', ...Array.from({ length: 130 }, (_, index) => `Проект ${index + 1}: разработал страницу каталога, написал тесты и улучшил доступность интерфейса.`)].join('\n');
  assert.ok(longHistory.length > 4000, 'Fixture must exceed the old truncation limit');
  await page.locator('[name="workHistory"]').fill(longHistory);
  await page.getByText('Подробнее о себе', { exact: true }).click();
  for (const [name, value] of Object.entries({ education: 'Тестовый университет', languages: 'Английский B2', phone: '+79990001122', portfolio: 'https://github.com/ivan-test' })) await page.locator(`[name="${name}"]`).fill(value);
  await page.locator('[name="format"]').selectOption('Гибрид');
  assert.equal(await page.locator('[name="softSkills"]').count(), 5, 'The questionnaire offers optional self-reported skills');
  for (const skill of ['Коммуникация', 'Работа в команде']) await page.getByLabel(skill, { exact: true }).check();
  for (const skill of ['Самоорганизация', 'Решение задач', 'Лидерство']) await page.getByLabel(skill, { exact: true }).uncheck();
  await page.locator('[name="consent"]').check();
  await page.getByRole('button', { name: 'К тесту', exact: true }).click();
  await page.getByRole('button', { name: 'Начать тест', exact: true }).waitFor();
  let saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey);
  assert.equal(saved.profile.education, 'Тестовый университет');
  assert.equal(saved.profile.careerAchievements, 'Ускорил интерфейс на 30 процентов');
  assert.equal(saved.profile.workHistory, longHistory);
  assert.equal(saved.surveys[0].workHistory, longHistory);
  assert.deepEqual([...saved.profile.softSkills].sort(), ['Коммуникация', 'Работа в команде']);
  assert.deepEqual([...saved.surveys[0].softSkills].sort(), ['Коммуникация', 'Работа в команде']);
  assert.equal(saved.profile.format, 'Гибрид');
  assert.equal(saved.profile.visible, false);
  assert.equal(saved.profile.confirmed, null);
  assert.ok(!JSON.stringify(saved).includes('scan.png'), 'Raw resume file must not be persisted');
  await waitForSaved();
  await page.reload();
  await page.getByRole('button', { name: 'Начать тест', exact: true }).waitFor();
  saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey);
  assert.equal(saved.profile.education, 'Тестовый университет');
  assert.equal(saved.profile.workHistory, longHistory, 'Reload must preserve long work history');
  const requestPromise = page.waitForRequest(request => request.url().endsWith('/api/assessment/attempts') && request.method() === 'POST');
  const responsePromise = page.waitForResponse(response => response.url().endsWith('/api/assessment/attempts') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Начать тест', exact: true }).click();
  const body = (await requestPromise).postDataJSON();
  assert.deepEqual(Object.keys(body.survey).sort(), ['date', 'desiredGrade', 'experience', 'id', 'industry', 'professionalRole', 'softSkills', 'specialization', 'stack'].sort(), 'Assessment request must omit contacts and additional resume sections');
  assert.deepEqual([...body.survey.softSkills].sort(), ['Коммуникация', 'Работа в команде'], 'Assessment receives the saved questionnaire self-assessment');
  for (const privateValue of ['ivan.test@example.com', '+79990001122', 'Тестовый университет', 'Ускорил интерфейс', 'github.com/ivan-test']) assert.ok(!JSON.stringify(body).includes(privateValue));
  const serverAttempt = await (await responsePromise).json();
  await page.locator('.question-text').waitFor();

  // The profile opens after a successful assessment. Answer keys stay in this
  // Node-only test and never enter the application bundle.
  const answers = new Map(programs.Frontend.Middle.families.flatMap(family => family.variants.map(variant => [variant.text, variant.options[variant.correct]])));
  for (let index = 0; index < 6; index++) {
    await page.locator(`.exam-progress[aria-valuenow="${index + 1}"]`).waitFor();
    const expected = answers.get(await page.locator('.question-text').textContent());
    assert.ok(expected, 'Question must belong to the existing server fixture bank');
    const choices = page.locator('.answer-option');
    const choice = (await choices.locator('span').allTextContents()).findIndex(text => text.trim() === expected);
    assert.ok(choice >= 0);
    await choices.nth(choice).click();
    await page.getByRole('button', { name: index === 5 ? 'Завершить тест' : 'Далее', exact: true }).click();
  }
  await page.getByRole('button', { name: 'К профилю', exact: true }).click();
  await page.getByRole('heading', { name: 'Мой профиль', exact: true }).waitFor();
  assert.equal(await page.locator('[name="workHistory"]').inputValue(), longHistory);
  assert.equal(await page.locator('[name="softSkills"]').count(), 5, 'Self-reported skills can be edited in the profile');
  const editedHistory = longHistory + '\nПоследний проект: обновил систему уведомлений.';
  await page.locator('[name="workHistory"]').fill(editedHistory);
  await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click();
  await page.getByText('Профиль сохранён', { exact: true }).waitFor();
  await waitForSaved();
  await page.reload();
  await page.getByRole('heading', { name: 'Мой профиль', exact: true }).waitFor();
  saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey);
  assert.equal(saved.profile.workHistory, editedHistory, 'Profile save must preserve long work history');
  assert.deepEqual([...saved.profile.softSkills].sort(), ['Коммуникация', 'Работа в команде'], 'Profile preserves self-reported skills');

  // Deletion is confirmed, synchronized across tabs, and removes server records.
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
  await erasePolicy.getByRole('button', { name: 'Удалить данные профиля', exact: true }).click();
  assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey), beforeErase, 'First deletion click must not delete data');
  await erasePolicy.getByRole('button', { name: 'Отмена', exact: true }).click();
  assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey), beforeErase, 'Cancelling must preserve saved questionnaire');
  await erasePolicy.getByRole('button', { name: 'Удалить данные профиля', exact: true }).click();
  await erasePolicy.getByRole('button', { name: 'Удалить', exact: true }).click();
  await erasePolicy.getByText('Данные кабинета удалены из браузера и с сервера.', { exact: true }).waitFor();
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
  const deletedAttempt = await context.request.get(base + '/api/assessment/attempts/' + serverAttempt.id, { headers: { 'X-Attempt-Token': serverAttempt.token } });
  assert.equal(deletedAttempt.status(), 404, 'Confirmed deletion must also remove owned server attempts');
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
  console.log('PASS PDF/DOCX text, actual Russian/English OCR, complete multi-job history across scan/mixed/partial/Form PDFs, automatic total from OCR dates and invalid-period warning, small-image native text, visible truncation, errors and cancellation, edit preservation, long-history persistence, assessment and profile without soft skills, private API payload, consent and deletion across tabs, mobile accessibility');
} finally { await context.request.delete(base + '/api/platform/state'); await context.close(); await browser.close(); }
