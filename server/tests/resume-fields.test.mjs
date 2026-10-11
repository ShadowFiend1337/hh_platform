import test from 'node:test';
import assert from 'node:assert/strict';
import { validateResumeFields } from '../resume-fields.mjs';
import { validateSurvey, createAttempt } from '../assessment.mjs';
import { DirectoryStore, publicCandidate, semanticSegments, semanticEvidenceSections, semanticRerankingSections } from '../directory-store.mjs';
import { resumeSections } from '../../shared/resume-structure.ts';

const fail = message => { throw new Error(message); };
const sections = () => ({
  workExperiences: [{ period: '2023-01 — 2024-05', company: 'Лаборатория', tasks: 'Разрабатывал API на FastAPI' }],
  petProjects: [{ name: 'Датчики', description: 'Собрал систему мониторинга на MQTT', stack: ['Python', 'ESP32'] }],
  achievementItems: ['Победитель хакатона'], interests: ['Робототехника'],
});
const survey = () => ({ id: 'structured-survey', date: '2026-10-11T12:00:00.000Z', industry: 'ИТ',
  professionalRole: 'Backend-разработчик', specialization: 'Backend', desiredGrade: 'Junior',
  experience: '1 год', stack: ['Python'], softSkills: Array.from({ length: 30 }, (_, index) => `Навык ${index}`), ...sections() });

test('structured fields project from authoritative entries and retain the core-only assessment contract', () => {
  const input = { ...sections(), workHistory: 'Устаревшее описание', careerAchievements: 'Интересы: музыка' };
  const result = validateResumeFields(input, fail);
  assert.equal(result.workHistory, 'Лаборатория\n2023-01 — 2024-05\nРазрабатывал API на FastAPI');
  assert.equal(result.careerAchievements, 'Победитель хакатона');
  const incoming = survey(); const checked = validateSurvey(incoming); const attempt = createAttempt(incoming);
  incoming.workExperiences[0].tasks = 'Изменено'; incoming.petProjects[0].stack.push('Чужой навык');
  assert.equal(Object.hasOwn(checked, 'workExperiences'), false);
  assert.equal(Object.hasOwn(attempt.survey, 'petProjects'), false);
  assert.equal(attempt.survey.softSkills.length, 30);
});

test('API rejects malformed sections and total budgets instead of silently truncating', () => {
  for (const value of [{ workExperiences: [{ period: '', company: '', tasks: 3 }] },
    { workExperiences: Array.from({ length: 31 }, () => ({ period: '', company: '', tasks: '' })) },
    { petProjects: [{ name: 'X', description: '', stack: ['x'.repeat(81)] }] },
    { achievementItems: ['x'.repeat(4001)] }, { interests: ['x'.repeat(3000), 'y'.repeat(2000)] },
    { workExperiences: Array.from({ length: 6 }, () => ({ period: '', company: '', tasks: 'x'.repeat(4000) })) },
    { petProjects: [{ name: '', description: '', stack: [], injected: 'value' }] }]) {
    assert.throws(() => validateResumeFields(value, fail));
  }
});

test('legacy text remains editable and separates interests without fabricated employers or dates', () => {
  const migrated = resumeSections({ workHistory: 'Занимался интеграциями',
    careerAchievements: 'Достижения\n• Призёр олимпиады\nДополнительно\n• Изучаю сети' });
  assert.deepEqual(migrated.workExperiences, [{ period: '', company: '', tasks: 'Занимался интеграциями' }]);
  assert.deepEqual(migrated.achievementItems, ['Призёр олимпиады']);
  assert.deepEqual(migrated.interests, ['Изучаю сети']);
});

test('new nested profile fields keep contacts private and contribute narrative search evidence', () => {
  const person = { id: 'candidate', professionalRole: 'Разработчик', stack: ['Python'], ...sections(),
    workExperiences: [{ period: '2023-01 — 2024-05', company: 'Лаборатория', tasks: 'API; contact@example.invalid; +7 999 123 45 67' }],
    petProjects: [{ name: 'MQTT', description: 'Мониторинг; pet@example.invalid', stack: ['ESP32', 'stack@example.invalid'] }],
    achievementItems: ['Победитель; prize@example.invalid'], interests: ['Робототехника; hobby@example.invalid'],
    email: 'private@example.invalid', phone: '+7 999 765 43 21', fspId: 'self-declared', achievements: [] };
  const publicValue = publicCandidate(person);
  const text = JSON.stringify(publicValue); const indexed = semanticSegments(person).join(' ');
  for (const output of [text, indexed, semanticEvidenceSections(person).join(' ')]) {
    assert.doesNotMatch(output, /@example\.invalid|999 123 45 67/u);
  }
  assert.equal(publicValue.email, ''); assert.deepEqual(publicValue.achievements, []);
  assert.equal(publicValue.workExperiences[0].period, '2023-01 — 2024-05');
  assert.match(indexed, /MQTT|ESP32/u); assert.match(indexed, /Робототехника/u);
  assert.ok(semanticRerankingSections(person).every(section => section.kind === 'professional'));
});

test('an unchanged legacy history at the total limit round-trips without lost text or extra separators', () => {
  for (const workHistory of ['x'.repeat(20000), ('Описание работы\n').repeat(1400).slice(0, 20000).trim()]) {
    const fields = { workHistory, ...resumeSections({ workHistory }) };
    const checked = validateResumeFields(fields, fail);
    assert.equal(checked.workHistory, workHistory);
    assert.deepEqual(resumeSections(checked).workExperiences, fields.workExperiences);
    assert.equal(validateResumeFields({ ...checked, ...resumeSections(checked) }, fail).workHistory, workHistory);
    if (workHistory.length === 20000) {
      const changed = structuredClone(fields); changed.workExperiences[0].company = 'Новая компания';
      assert.throws(() => validateResumeFields(changed, fail), /20000/u, 'An edited section still obeys the total budget');
    }
  }
});

test('public profiles and city options hide contacts in short fields and keep portfolio private', t => {
  const store = new DirectoryStore(':memory:'); t.after(() => store.close());
  const person = { id: 'privacy-city', name: 'Кандидат', city: 'city-private@example.invalid',
    professionalRole: 'Frontend', stack: ['React'], format: 'Удалённо', visible: true, consent: true,
    portfolio: 'https://example.invalid/portfolio-private@example.invalid', achievements: [] };
  store.upsert(person, 'owner', true);
  const exposed = JSON.stringify({ public: publicCandidate(person), options: store.options() });
  assert.doesNotMatch(exposed, /private@example\.invalid/u);
  assert.equal(publicCandidate(person).portfolio, '');
  // Reopening older records must scrub their indexed city, too.
  store.db.prepare('UPDATE directory_candidates SET city=? WHERE id=?').run(person.city, person.id);
  const reopened = new DirectoryStore(':memory:', [], { database: store.db });
  assert.doesNotMatch(JSON.stringify(reopened.options()), /city-private/u);
});
