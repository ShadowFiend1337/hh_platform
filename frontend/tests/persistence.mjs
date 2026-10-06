import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createInitialState, storageKey } from '../src/model.ts';

// Fictional in-memory platform snapshots. No real API data or resume artifacts.
const base = process.env.PREDEL_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ headless: true });
const contexts = [];
const errors = [];
const clone = value => structuredClone(value);
const syncKey = 'predel:sync:v1';

function fixture() {
  const state = createInitialState();
  const date = '2026-01-01T00:00:00.000Z';
  Object.assign(state.profile, { name: 'Тестовый кандидат', email: 'fixture@example.com', consent: true, visible: true,
    industry: 'ИТ', professionalRole: 'Разработчик интерфейсов', stack: ['React'], experience: '3 года',
    city: 'Москва', bio: 'Исходное описание', surveyCompletedAt: date,
    confirmed: { specialization: 'Frontend', grade: 'Junior', score: 90, date, surveyId: 'fixture-survey' }, gradeChangedAt: date });
  state.surveys = [{ id: 'fixture-survey', date, industry: state.profile.industry,
    professionalRole: state.profile.professionalRole, specialization: state.profile.specialization,
    desiredGrade: state.profile.desiredGrade, stack: [...state.profile.stack], softSkills: [], experience: state.profile.experience }];
  return state;
}

async function session() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  contexts.push(context);
  const backend = { state: fixture(), revision: 1, fail: false, conflict: null, puts: [], gets: 0 };
  await context.route('**/api/**', async route => {
    const request = route.request();
    if (new URL(request.url()).pathname !== '/api/platform/state') {
      await route.fulfill({ json: { items: [], total: 0, cities: [], industries: [], languages: [], employmentTypes: [] } });
      return;
    }
    if (request.method() === 'PUT') {
      const payload = request.postDataJSON();
      backend.puts.push(clone(payload));
      if (backend.fail) { await route.fulfill({ status: 503, json: { error: 'Тестовый сбой сохранения' } }); return; }
      if (backend.conflict) {
        const change = backend.conflict; backend.conflict = null;
        change(backend); backend.revision += 1;
        await route.fulfill({ status: 409, json: { error: 'Изменено в другой вкладке' } }); return;
      }
      if (payload.baseRevision !== backend.revision) {
        await route.fulfill({ status: 409, json: { error: 'Некорректная версия' } }); return;
      }
      backend.state = clone(payload.state); backend.revision += 1;
    } else if (request.method() === 'DELETE') {
      backend.state = null; backend.revision = 0;
    } else backend.gets += 1;
    await route.fulfill({ json: { state: clone(backend.state), revision: backend.revision, directoryPeople: [] } });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '/app?role=candidate&tab=profile');
  await page.locator('.profile-form').waitFor();
  await page.locator('.data-status').getByText('Изменения сохранены', { exact: true }).waitFor();
  return { context, page, backend };
}

async function stored(page) { return page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey); }
async function editBio(page, text) {
  await page.locator('.profile-form textarea[name="bio"]').fill(text);
  await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click();
}
async function saved(page) { await page.locator('.data-status').getByText('Изменения сохранены', { exact: true }).waitFor(); }
async function emptyCache(page) {
  await page.waitForFunction(key => {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return value?.profile?.name === '' && value?.profile?.bio === '' && value?.profile?.consent === false;
  }, storageKey);
}

try {
  const recover = await session();
  recover.backend.fail = true;
  await editBio(recover.page, 'Несохранённые профессиональные изменения');
  await recover.page.getByRole('button', { name: 'Повторить сохранение', exact: true }).waitFor();
  assert.equal(recover.backend.state.profile.bio, 'Исходное описание');
  await recover.page.waitForFunction(key => JSON.parse(localStorage.getItem(key) || 'null')?.dirty === true, syncKey);
  await recover.page.reload();
  await recover.page.locator('.profile-form').waitFor();
  await recover.page.getByRole('button', { name: 'Повторить сохранение', exact: true }).waitFor();
  assert.equal(await recover.page.locator('.profile-form textarea[name="bio"]').inputValue(), 'Несохранённые профессиональные изменения');
  recover.backend.fail = false;
  await recover.page.getByRole('button', { name: 'Повторить сохранение', exact: true }).click();
  await saved(recover.page);
  assert.equal(recover.backend.state.profile.bio, 'Несохранённые профессиональные изменения');
  assert.equal(await recover.page.evaluate(key => JSON.parse(localStorage.getItem(key)).dirty, syncKey), false);
  console.log('PASS Failed PUT keeps draft across reload and explicit retry saves it');

  recover.backend.fail = true;
  await editBio(recover.page, 'Первый отклонённый вариант');
  await recover.page.getByRole('button', { name: 'Повторить сохранение', exact: true }).waitFor();
  const failedPuts = recover.backend.puts.length;
  await recover.page.waitForTimeout(600);
  assert.equal(recover.backend.puts.length, failedPuts, 'An unchanged failed draft must not enter an automatic retry loop');
  recover.backend.fail = false;
  await editBio(recover.page, 'Исправленный вариант после ошибки');
  await saved(recover.page);
  assert.equal(recover.backend.state.profile.bio, 'Исправленный вариант после ошибки');
  assert.equal(recover.backend.puts.length, failedPuts + 1, 'Submitting a changed draft is a new save and clears the stale error');
  console.log('PASS A corrected draft saves after failure while an unchanged draft requires retry');

  const conflict = await session();
  conflict.backend.conflict = backend => {
    backend.state.profile.city = 'Казань';
    backend.state.profile.name = 'Удалённое изменение имени';
    backend.state.company.name = 'Удалённое название компании';
  };
  await editBio(conflict.page, 'Локальная правка профессионального описания');
  await saved(conflict.page);
  assert.equal(conflict.backend.puts.length, 2, 'One rejected write and one rebased write');
  assert.equal(conflict.backend.state.profile.bio, 'Локальная правка профессионального описания');
  assert.equal(conflict.backend.state.profile.city, 'Казань');
  assert.equal(conflict.backend.state.profile.name, 'Удалённое изменение имени');
  assert.equal(conflict.backend.state.company.name, 'Удалённое название компании');
  assert.deepEqual(await stored(conflict.page), conflict.backend.state);
  console.log('PASS 409 rebase preserves unrelated remote profile and company fields');

  const refreshed = await session();
  refreshed.backend.state = null; refreshed.backend.revision = 0;
  const putsBeforeRefresh = refreshed.backend.puts.length;
  await refreshed.page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await emptyCache(refreshed.page);
  await refreshed.page.locator('.onboarding-form').waitFor();
  await refreshed.page.waitForTimeout(600);
  assert.equal(refreshed.backend.puts.length, putsBeforeRefresh, 'Remote delete must not autosave the old profile back');
  console.log('PASS Remote deletion on refresh clears the page without resurrection');

  const erasedOnReload = await session();
  erasedOnReload.backend.state = null; erasedOnReload.backend.revision = 0;
  const putsBeforeReload = erasedOnReload.backend.puts.length;
  await erasedOnReload.page.reload();
  await emptyCache(erasedOnReload.page);
  await erasedOnReload.page.locator('.onboarding-form').waitFor();
  await erasedOnReload.page.waitForTimeout(600);
  assert.equal(erasedOnReload.backend.puts.length, putsBeforeReload, 'Reload must not migrate previously deleted server data back');
  console.log('PASS Remote deletion discovered on reload cannot restore stale cache');

  const erasedDuringWrite = await session();
  erasedDuringWrite.backend.conflict = backend => { backend.state = null; backend.revision = -1; };
  await editBio(erasedDuringWrite.page, 'Правка после удаления в другой вкладке');
  await emptyCache(erasedDuringWrite.page);
  await erasedDuringWrite.page.waitForTimeout(600);
  assert.equal(erasedDuringWrite.backend.puts.length, 1, '409 then missing remote profile must stop the write loop');
  assert.equal(erasedDuringWrite.backend.state, null);
  console.log('PASS DELETE discovered during 409 recovery stops stale PUT retries');

  assert.deepEqual(errors, [], 'Uncaught browser errors');
  console.log('PASS Persistence browser scenarios complete');
} finally {
  for (const context of contexts) await context.close();
  await browser.close();
}
