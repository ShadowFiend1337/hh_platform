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

async function session({ employer = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  contexts.push(context);
  const searchPeople = Array.from({ length: 3 }, (_, index) => ({ ...fixture().profile, id: `fixture-directory-${index}`,
    name: `Тестовый специалист ${index}`, email: '', phone: '' }));
  const backend = { state: fixture(), revision: 1, fail: false, conflict: null, puts: [], gets: 0,
    searchPeople, directoryPeople: [], directorySearches: 0 };
  if (employer) {
    const person = searchPeople.at(-1);
    backend.directoryPeople.push(clone(person));
    backend.state.invitations.push({ id: 'fixture-invitation', candidateId: person.id, companyId: backend.state.company.id,
      company: backend.state.company.name, title: 'Разработчик', description: 'Тестовое предложение', contact: 'fixture@example.com',
      salaryFrom: 100000, salaryTo: 150000, status: 'sent', date: '2026-01-01T00:00:00.000Z' });
  }
  await context.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/auth/me') { await route.fulfill({ status: 401, json: { error: 'Гостевой кабинет.' } }); return; }
    if (url.pathname === '/api/directory/search') {
      backend.directorySearches += 1;
      await route.fulfill({ json: { items: backend.searchPeople.map(person => ({ person: clone(person), rank: 1,
        reason: 'Тестовое соответствие задачам', semanticScore: 1 })), total: backend.searchPeople.length, offset: 0, limit: 30,
        query: url.searchParams.get('q') || '', interpreted: {},
        model: { status: 'ready', name: 'fixture', version: 'fixture', dimension: 1, trained: true } } });
      return;
    }
    if (url.pathname !== '/api/platform/state') {
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
      const invited = new Set(backend.state.invitations.map(item => item.candidateId));
      const liked = new Set((backend.state.candidateDecisions || []).filter(item => item.decision === 'liked').map(item => item.candidateId));
      backend.directoryPeople = backend.searchPeople.filter(person => invited.has(person.id) || liked.has(person.id)).map(clone);
    } else if (request.method() === 'DELETE') {
      backend.state = null; backend.revision = 0;
    } else backend.gets += 1;
    await route.fulfill({ json: { state: clone(backend.state), revision: backend.revision, directoryPeople: clone(backend.directoryPeople) } });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + (employer ? '/app?role=employer&tab=candidates' : '/app?role=candidate&tab=profile'));
  await page.locator(employer ? '.candidate-row' : '.profile-form').first().waitFor();
  await saved(page);
  return { context, page, backend };
}

async function stored(page) { return page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey); }
async function editBio(page, text) {
  await page.locator('.profile-form textarea[name="bio"]').fill(text);
  await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click();
}
async function saved(page) {
  await page.waitForFunction(() => ['saved', 'error'].includes(document.querySelector('.main-content')?.getAttribute('data-sync-status')));
  assert.equal(await page.locator('.main-content').getAttribute('data-sync-status'), 'saved', 'Server persistence failed');
  assert.equal(await page.locator('.data-error').count(), 0, 'Successful saves must clear the error');
}
async function failed(page) {
  await page.locator('.main-content[data-sync-status="error"]').waitFor();
  await page.locator('.data-error').getByRole('button', { name: 'Повторить сохранение', exact: true }).waitFor();
  assert.equal(await page.locator('.data-error').getAttribute('role'), 'alert');
}
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
  await failed(recover.page);
  assert.equal(recover.backend.state.profile.bio, 'Исходное описание');
  await recover.page.waitForFunction(key => JSON.parse(localStorage.getItem(key) || 'null')?.dirty === true, syncKey);
  await recover.page.reload();
  await recover.page.locator('.profile-form').waitFor();
  await failed(recover.page);
  assert.equal(await recover.page.locator('.profile-form textarea[name="bio"]').inputValue(), 'Несохранённые профессиональные изменения');
  recover.backend.fail = false;
  await recover.page.locator('.data-error').getByRole('button', { name: 'Повторить сохранение', exact: true }).click();
  await saved(recover.page);
  assert.equal(recover.backend.state.profile.bio, 'Несохранённые профессиональные изменения');
  assert.equal(await recover.page.evaluate(key => JSON.parse(localStorage.getItem(key)).dirty, syncKey), false);
  console.log('PASS Failed PUT keeps draft across reload and explicit retry saves it');

  recover.backend.fail = true;
  await editBio(recover.page, 'Первый отклонённый вариант');
  await failed(recover.page);
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

  const rebasedDecisions = await conflict.page.evaluate(async initial => {
    const { rebaseState } = await import('/src/platform-api.ts');
    const date = '2026-01-01T00:00:00.000Z';
    const decision = (candidateId, value = 'liked') => ({ candidateId, decision: value, date });
    const base = { ...initial, candidateDecisions: [decision('fixture-one'), decision('fixture-two', 'passed')] };
    const local = structuredClone(base);
    local.candidateDecisions.push(decision('fixture-local'));
    const remote = structuredClone(base);
    remote.candidateDecisions.push(decision('fixture-remote', 'passed'));
    remote.company.name = 'Сохранённая компания другой вкладки';
    const independent = rebaseState(local, base, remote);
    const undo = structuredClone(base);
    undo.candidateDecisions = undo.candidateDecisions.filter(item => item.candidateId !== 'fixture-one');
    const undone = rebaseState(undo, base, remote);
    const removedRemote = structuredClone(base);
    removedRemote.candidateDecisions = removedRemote.candidateDecisions.filter(item => item.candidateId !== 'fixture-one');
    const notRestored = rebaseState(base, base, removedRemote);
    const legacy = structuredClone(base); delete legacy.candidateDecisions;
    const legacyMerged = rebaseState(legacy, base, remote);
    const remoteChanged = structuredClone(remote);
    remoteChanged.candidateDecisions[0].decision = 'passed';
    const changed = rebaseState(base, base, remoteChanged);
    const ids = state => state.candidateDecisions.map(item => item.candidateId).sort();
    return { independent: ids(independent), company: independent.company.name, undone: ids(undone),
      notRestored: ids(notRestored), legacy: ids(legacyMerged), remoteDecision: changed.candidateDecisions.find(item => item.candidateId === 'fixture-one').decision };
  }, fixture());
  assert.deepEqual(rebasedDecisions.independent, ['fixture-local', 'fixture-one', 'fixture-remote', 'fixture-two']);
  assert.equal(rebasedDecisions.company, 'Сохранённая компания другой вкладки');
  assert.deepEqual(rebasedDecisions.undone, ['fixture-remote', 'fixture-two']);
  assert.deepEqual(rebasedDecisions.notRestored, ['fixture-two']);
  assert.deepEqual(rebasedDecisions.legacy, ['fixture-one', 'fixture-remote', 'fixture-two']);
  assert.equal(rebasedDecisions.remoteDecision, 'passed');
  console.log('PASS Candidate decision rebase keeps independent swipes, undo and remote deletion');

  const swiping = await session({ employer: true });
  await swiping.page.getByRole('button', { name: 'Предельный режим', exact: true }).click();
  await swiping.page.locator('.candidate-list[aria-busy="false"]').waitFor();
  const searchesBeforeSwipe = swiping.backend.directorySearches;
  await swiping.page.getByRole('button', { name: 'Нравится', exact: true }).click();
  await swiping.page.waitForFunction(key => {
    const cache = JSON.parse(localStorage.getItem(key) || 'null');
    return cache?.dirty === false && cache.baseline?.candidateDecisions?.length === 1;
  }, syncKey);
  await saved(swiping.page);
  await swiping.page.waitForTimeout(400);
  assert.equal(swiping.backend.directorySearches, searchesBeforeSwipe, 'Saving a swipe and receiving a newly liked public profile must not rerun semantic search');
  assert.equal(await swiping.page.getByRole('button', { name: 'Нравится', exact: true }).isEnabled(), true);
  assert.equal(await swiping.page.locator('.swipe-card').getAttribute('data-candidate-id'), 'fixture-directory-1');
  const refreshAfterPublication = swiping.page.waitForRequest(request => new URL(request.url()).pathname === '/api/directory/search');
  swiping.backend.state.profile.visible = false; swiping.backend.revision += 1;
  await swiping.page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await refreshAfterPublication;
  await swiping.page.locator('.candidate-list[aria-busy="false"]').waitFor();
  assert.equal(swiping.backend.directorySearches, searchesBeforeSwipe + 1, 'Changing the owned publication must refresh directory results');
  const refreshAfterInvitedChange = swiping.page.waitForRequest(request => new URL(request.url()).pathname === '/api/directory/search');
  swiping.backend.directoryPeople.find(person => person.id === 'fixture-directory-2').visible = false;
  swiping.backend.searchPeople.find(person => person.id === 'fixture-directory-2').visible = false;
  swiping.backend.revision += 1;
  await swiping.page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await refreshAfterInvitedChange;
  await swiping.page.locator('.candidate-list[aria-busy="false"]').waitFor();
  assert.equal(swiping.backend.directorySearches, searchesBeforeSwipe + 2, 'An invited public profile change must refresh directory results');
  console.log('PASS Saved swipes leave search and the next card ready; publication and invited-profile changes refresh it');

  async function refreshedDirectory(session, mutate) {
    const count = session.backend.directorySearches;
    const request = session.page.waitForRequest(request => new URL(request.url()).pathname === '/api/directory/search');
    mutate(session.backend); session.backend.revision += 1;
    await session.page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await request;
    await session.page.locator('.candidate-list[aria-busy="false"]').waitFor();
    assert.equal(session.backend.directorySearches, count + 1);
  }
  await refreshedDirectory(swiping, backend => {
    backend.directoryPeople.find(person => person.id === 'fixture-directory-0').bio = 'Изменённое описание лайкнутого специалиста';
  });
  assert.equal(swiping.backend.state.candidateDecisions[0].decision, 'liked', 'Public edits leave the employer decision intact');
  await refreshedDirectory(swiping, backend => {
    backend.directoryPeople = backend.directoryPeople.filter(person => person.id !== 'fixture-directory-0');
  });
  await refreshedDirectory(swiping, backend => {
    backend.directoryPeople.push(clone(backend.searchPeople[0]));
  });
  await refreshedDirectory(swiping, backend => {
    backend.state.candidateDecisions = [];
    backend.directoryPeople = backend.directoryPeople.filter(person => person.id !== 'fixture-directory-0');
  });
  console.log('PASS Edits, withdrawal, republication and external deletion of a watched like refresh directory results');

  const searchesBeforeUnlike = swiping.backend.directorySearches;
  await swiping.page.getByRole('button', { name: 'Нравится', exact: true }).click();
  await swiping.page.waitForFunction(key => {
    const cache = JSON.parse(localStorage.getItem(key) || 'null');
    return cache?.dirty === false && cache.baseline?.candidateDecisions?.length === 1;
  }, syncKey);
  await swiping.page.getByRole('button', { name: 'Избранные кандидаты', exact: true }).click();
  await swiping.page.getByRole('button', { name: 'Убрать из избранного', exact: true }).click();
  await swiping.page.waitForFunction(key => {
    const cache = JSON.parse(localStorage.getItem(key) || 'null');
    return cache?.dirty === false && cache.baseline?.candidateDecisions?.length === 0;
  }, syncKey);
  await saved(swiping.page); await swiping.page.waitForTimeout(400);
  assert.equal(swiping.backend.directorySearches, searchesBeforeUnlike, 'The employer own unlike PUT must not rerun search');
  console.log('PASS Adding a new like and removing it locally do not rerun search');

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
