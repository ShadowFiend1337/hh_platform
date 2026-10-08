import test from 'node:test';
import assert from 'node:assert/strict';
import { DirectoryService } from '../directory.mjs';
import { createAssessmentServer } from '../server.mjs';
import { CATEGORY_RECOMMENDATION_POLICY } from '../category-recommendations.mjs';

const profile = (id, specialization = 'Frontend', grade = 'Middle', changes = {}) => ({
  id, name: id, specialization, desiredGrade: grade, professionalRole: specialization,
  confirmed: { specialization, grade, score: 83 },
  stack: ['TypeScript'], bio: 'MATCH Доступные формы и сервисы', workHistory: '',
  careerAchievements: '', education: '', industry: 'ИТ', city: 'Москва', format: 'Удалённо',
  visible: true, consent: true, synthetic: true, email: 'private@example.test', phone: '+79990000000',
  salaryFrom: 100000, salaryTo: 150000, experienceMonths: 36, achievements: [], ...changes,
});
class Encoder {
  info = { status: 'ready', name: 'Deterministic category fixture', version: 'category-test',
    dimension: 2, trained: false, threshold: 0.5 };
  async start() { return this.info; }
  async encode(texts) { return texts.map(text => text === 'задача' || text.includes('MATCH') ? [1, 0] : [0, 1]); }
  close() {}
}
function service(t, seeds, options = {}) {
  const value = new DirectoryService(':memory:', { seeds, encoder: new Encoder(), ...options });
  t.after(() => value.close()); return value;
}
const groupKey = category => `${category.specialization}:${category.grade}`;

test('recommendations count the entire admitted catalogue before pagination and select a category independently of filters', async t => {
  const people = [
    ...Array.from({ length: 45 }, (_, i) => profile('front-' + String(i).padStart(2, '0'))),
    ...Array.from({ length: 10 }, (_, i) => profile('back-' + i, 'Backend', 'Junior')),
    ...Array.from({ length: 10 }, (_, i) => profile('ml-' + i, 'ML', 'Senior')),
  ];
  const value = service(t, people);
  const all = await value.search('задача', {}, { limit: 30 });
  assert.equal(all.total, 65); assert.equal(all.items.length, 30);
  const counts = Object.fromEntries(all.categories.map(category => [groupKey(category), category.count]));
  assert.deepEqual(counts, { 'Backend:Junior': 10, 'Frontend:Middle': 45, 'ML:Senior': 10 });
  assert.equal(all.model.categoryRecommendationPolicy, CATEGORY_RECOMMENDATION_POLICY);
  assert.equal(all.selectedCategory, null);
  assert.ok(all.categories.every(category => category.candidateIds.length === 3 && !category.approximate));
  assert.ok(all.categories.every(category => category.demoCount === category.count && /Учебных профилей/u.test(category.reason)),
    'Fictional category examples must not masquerade as a group of real registered workers');
  const category = { specialization: 'Frontend', grade: 'Middle' };
  const first = await value.search('задача', {}, { category, limit: 30 });
  const second = await value.search('задача', {}, { category, offset: 30, limit: 30 });
  assert.equal(first.total, 45); assert.equal(first.items.length, 30); assert.equal(second.items.length, 15);
  assert.deepEqual(first.categories, all.categories); assert.deepEqual(second.categories, all.categories);
  assert.deepEqual(first.selectedCategory, category);
  assert.equal(first.effectiveFilters.specialization, ''); assert.equal(first.effectiveFilters.grade, '');
  const selected = [...first.items, ...second.items];
  assert.equal(new Set(selected.map(item => item.person.id)).size, 45);
  assert.ok(selected.every(item => groupKey(item.person.confirmed) === groupKey(category)));
  assert.deepEqual(all.categories.find(item => groupKey(item) === groupKey(category)).candidateIds,
    first.items.slice(0, 3).map(item => item.person.id));
  assert.equal((await value.search('задача')).total, 65);
});

test('category navigation never broadens a stricter employer filter or invents an empty category', async t => {
  const value = service(t, [profile('front'), profile('back', 'Backend', 'Junior')]);
  const result = await value.search('', { specialization: 'Frontend' },
    { category: { specialization: 'Backend', grade: 'Junior' } });
  assert.equal(result.total, 0); assert.deepEqual(result.items, []);
  assert.deepEqual(result.categories.map(groupKey), ['Frontend:Middle']);
  assert.equal(result.effectiveFilters.specialization, 'Frontend');
  const unsupported = await value.search('нужен стоматолог');
  assert.deepEqual(unsupported.items, []); assert.deepEqual(unsupported.categories, []);
});

test('category order retains the best semantic match even when test evidence moves a different representative first', async t => {
  const encoder = new Encoder();
  encoder.encode = async texts => texts.map(text => {
    if (text === 'задача') return [1, 0];
    const cosine = text.includes('BEST') ? 0.9 : text.includes('TESTED') ? 0.89 : text.includes('OTHER') ? 0.895 : 0;
    return [cosine, Math.sqrt(1 - cosine ** 2)];
  });
  const value = service(t, [profile('best', 'Frontend', 'Middle', { bio: 'BEST Доступные формы' }),
    profile('tested', 'Frontend', 'Middle', { bio: 'TESTED Доступные формы', confirmed: { specialization: 'Frontend', grade: 'Middle', score: 100 } }),
    profile('other', 'Backend', 'Junior', { bio: 'OTHER Сервисы', confirmed: { specialization: 'Backend', grade: 'Junior', score: 100 } })], { encoder });
  const result = await value.search('задача');
  assert.deepEqual(result.items.map(item => item.person.id), ['tested', 'other', 'best']);
  assert.deepEqual(result.categories.map(groupKey), ['Frontend:Middle', 'Backend:Junior']);
  assert.deepEqual(result.categories[0].candidateIds, ['tested', 'best']);
});

test('recommendations exclude withheld, unverified and below-cutoff profiles and contain no private contacts', async t => {
  const value = service(t, [profile('good'), profile('hidden', 'Backend', 'Junior', { visible: false }),
    profile('revoked', 'ML', 'Senior', { consent: false }),
    profile('unrelated', 'Embedded', 'Senior', { bio: 'OTHER Другая задача' })]);
  value.store.upsert(profile('unverified', 'Security', 'Senior'), 'unverified-owner', false);
  const result = await value.search('задача');
  assert.deepEqual(result.categories.map(groupKey), ['Frontend:Middle']);
  assert.deepEqual(result.categories[0].candidateIds, ['good']);
  assert.equal(result.categories[0].count, 1);
  assert.doesNotMatch(JSON.stringify(result), /private@example|79990000000/u);
});

test('withdrawal during query inference removes the profile from recommendations as well as candidates', async t => {
  const encoder = new Encoder(), person = profile('withdrawn');
  const value = service(t, [person], { encoder });
  const encode = encoder.encode.bind(encoder);
  encoder.encode = async texts => {
    if (texts.includes('задача')) value.store.upsert({ ...person, consent: false }, null, true);
    return encode(texts);
  };
  const result = await value.search('задача');
  assert.deepEqual(result.categories, []); assert.equal(result.total, 0);
});

test('categories use confirmed grade and specialization rather than imported self-assessment', async t => {
  const value = service(t, [profile('confirmed', 'Backend', 'Junior', { specialization: 'Frontend', desiredGrade: 'Lead' })]);
  assert.deepEqual((await value.search('')).categories.map(groupKey), ['Backend:Junior']);
});

test('nearest category recommendations keep their approximate provenance distinct from strong matches', async t => {
  const encoder = new Encoder();
  encoder.info.reranker = { version: 'category-stage', threshold: 1, baseModel: 'fixture', revision: 'a'.repeat(40), maxLength: 512 };
  encoder.rerank = async (_query, passages) => passages.map(() => 1.2);
  const person = profile('nearest');
  const value = service(t, [person], { encoder });
  // The real nearest-list admission is covered by directory-fusion tests;
  // this asserts the independently returned category provenance directly.
  const { recommendCategories } = await import('../category-recommendations.mjs');
  const groups = recommendCategories([{ person, rank: 0.9, approximate: true }], { semantic: true });
  assert.equal(groups[0].approximate, true); assert.match(groups[0].reason, /ближайшие/u);
  const strict = await value.search('задача');
  assert.equal(strict.categories[0].approximate, false);
});

test('malformed category selectors fail without altering query filters', async t => {
  const value = service(t, [profile('good')]);
  for (const category of [[], 'Frontend', {}, { specialization: 'Frontend', grade: 'Boss' },
    { specialization: 'Outside', grade: 'Junior' }, { specialization: 'Frontend', grade: 'Junior', owner: 'foreign' }]) {
    await assert.rejects(value.search('', {}, { category }), error => error.status === 400);
  }
});

test('HTTP category selection requires an employer account and validates JSON', async t => {
  const codes = new Map();
  const f = createAssessmentServer({ dbPath: ':memory:', authEnv: {},
    authMailer: async ({ email, code }) => { codes.set(email, code); } });
  await new Promise(resolve => f.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { f.server.close(resolve); f.server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${f.server.address().port}`;
  const category = { specialization: 'Frontend', grade: 'Middle' };
  const path = '/api/directory/search?category=' + encodeURIComponent(JSON.stringify(category));
  assert.equal((await fetch(base + path)).status, 401);
  async function register(role) {
    const email = `categories.${role}@example.test`;
    const request = await fetch(base + '/api/auth/register/request-code', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role, login: 'categories.' + role, email,
        password: 'CategoryFixturePassword887!', consent: true,
        ...(role === 'candidate' ? { name: 'Проверочный кандидат' } : { companyName: 'Проверочная компания' }) }) });
    assert.equal(request.status, 202);
    const verified = await fetch(base + '/api/auth/register/verify', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, code: codes.get(email) }) });
    assert.equal(verified.status, 201);
    return verified.headers.getSetCookie().map(cookie => cookie.split(';')[0]).join('; ');
  }
  const employer = await register('employer'), candidate = await register('candidate');
  assert.equal((await fetch(base + path, { headers: { Cookie: candidate } })).status, 403);
  const response = await fetch(base + path, { headers: { Cookie: employer } });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(result.selectedCategory, category);
  assert.ok(result.items.every(item => groupKey(item.person.confirmed) === groupKey(category)));
  assert.equal((await fetch(base + '/api/directory/search?category=%7B', { headers: { Cookie: employer } })).status, 400);
  assert.equal((await fetch(base + '/api/directory/search?category=' + encodeURIComponent(JSON.stringify({ ...category, owner: 'other' })),
    { headers: { Cookie: employer } })).status, 400);
});
