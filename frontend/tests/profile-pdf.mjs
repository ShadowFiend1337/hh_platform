import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { register, useFixedEncoder } from './helpers/accounts.mjs';
import { startIsolatedService } from './helpers/isolated-service.mjs';

// A registered employer on a disposable service sees the demo catalogue.
const isolated = await startIsolatedService();
useFixedEncoder(isolated.service);
const { base } = isolated;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ acceptDownloads: true });
await register(context, isolated, 'employer', 'pdf.employer');
const page = await context.newPage();
page.setDefaultTimeout(30000);
const errors = []; page.on('pageerror', error => errors.push(error.message));
async function readPdf(bytes) {
  return page.evaluate(async bytes => {
    const pdfjs = await import('/node_modules/pdfjs-dist/build/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/resume-assets/pdf/pdf.worker.min.mjs';
    const task = pdfjs.getDocument({ data: new Uint8Array(bytes),
      cMapUrl: '/resume-assets/pdf/cmaps/', cMapPacked: true,
      standardFontDataUrl: '/resume-assets/pdf/standard_fonts/', wasmUrl: '/resume-assets/pdf/wasm/' });
    try {
      const document = await task.promise, texts = [];
      for (let index = 1; index <= document.numPages; index++) {
        const page = await document.getPage(index), content = await page.getTextContent();
        texts.push(content.items.map(item => item.str || '').join(' ')); page.cleanup();
      }
      return { text: texts.join('\n'), pages: document.numPages };
    } finally { await task.destroy(); }
  }, [...bytes]);
}
try {
  await page.goto(base + '/app?role=employer&tab=candidates');
  const first = page.locator('.person-link').first(); await first.waitFor();
  const name = await first.textContent(); await first.click();
  const dialog = page.getByRole('dialog', { name: 'Профиль кандидата' });
  const downloaded = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'PDF-профиль', exact: true }).click();
  const download = await downloaded; assert.match(download.suggestedFilename(), /^predel-.*\.pdf$/u);
  await mkdir(new URL('../../server/data/pdf-validation/', import.meta.url), { recursive: true });
  const path = new URL('../../server/data/pdf-validation/downloaded-profile.pdf', import.meta.url);
  await download.saveAs(path.pathname.replace(/^\/([A-Z]:)/i, '$1'));
  const generated = await readFile(path);
  assert.equal(generated.subarray(0, 5).toString(), '%PDF-');
  const actual = await readPdf(generated);
  assert.ok(actual.text.includes(name.trim()), 'The downloaded file contains the displayed candidate');
  assert.ok(actual.text.includes('Недоступны для демопрофиля'), 'Demo profiles never export contacts');
  assert.ok(actual.text.includes('Демонстрационный профиль'));
  console.log('PASS PDF button downloads the displayed demo profile locally with Cyrillic, demo provenance and no contacts');

  const samples = await page.evaluate(async () => {
    const [{ createProfilePdf }, { createInitialState }] = await Promise.all([import('/src/profile-pdf.ts'), import('/src/model.ts')]);
    const font = new Uint8Array(await (await fetch('/assets/fonts/manrope.ttf')).arrayBuffer());
    const person = { ...createInitialState().profile, name: 'Синтетический кандидат', email: 'private-pdf@example.com', phone: '+7 999 123-45-67',
      stack: ['TypeScript', 'SQL'], softSkills: ['Коммуникация'], experience: '3 года',
      workHistory: ('Тестовая компания: разрабатывал системы хранения, проектировал API и проверял конкурентные операции.\n').repeat(95)
        + 'Последняя строка истории: все проекты сохранены.', portfolio: 'https://example.com/private-portfolio/' + 'project'.repeat(120) };
    return { hidden: [...await createProfilePdf(person, false, font)], allowed: [...await createProfilePdf(person, true, font)] };
  });
  for (const [permission, bytes] of Object.entries(samples)) {
    const document = await readPdf(bytes);
    assert.ok(document.pages > 1, 'Long profiles span multiple pages');
    assert.ok(document.text.includes('Последняя строка истории: все проекты сохранены.'));
    assert.ok(document.text.includes('Синтетический кандидат'));
    assert.ok(document.text.includes('Коммуникация'));
    assert.equal(document.text.includes('private-pdf@example.com'), permission === 'allowed');
    assert.equal(document.text.includes('private-portfolio'), permission === 'allowed');
  }
  assert.deepEqual(errors, []);
  console.log('PASS Multi-page profile preserves its last section, wraps long words and exports contacts only with permission');
} finally {
  await context.close(); await browser.close(); await isolated.close();
}
