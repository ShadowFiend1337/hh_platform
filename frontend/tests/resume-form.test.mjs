import assert from 'node:assert/strict';
import test from 'node:test';
import { competencySuggestions, createResumeDraft, MAX_VISIBLE_COMPETENCY_RESULTS, mergeResumeImport, recognizeResumeFields, resumeDraftError, resumeDraftValues, resumeSurveyValues } from '../src/resume-form.ts';
import { MAX_SOFT_SKILLS, resumeSectionLimits } from '../../shared/resume-limits.ts';
import { softSkillOptions } from '../../shared/catalog.ts';

function profile(overrides = {}) {
  return { name: 'Иван Тестовый', email: 'fixture@example.invalid', phone: '', city: '', professionalRole: 'Backend разработчик',
    specialization: 'Backend', desiredGrade: 'Junior', stack: ['TS', 'TypeScript'], experience: '1 год', softSkills: ['Лидерство'],
    bio: 'Описание автора', education: '', portfolio: '', languages: '', format: 'Удалённо', salaryFrom: null, salaryTo: null,
    workHistory: '', careerAchievements: '', ...overrides };
}

test('import keeps editable work, projects, achievements and interests distinct', () => {
  const imported = recognizeResumeFields({ professionalRole: 'Backend developer', specialization: 'Backend',
    stack: ['typescript', 'TS', 'Custom Tech'], softSkills: ['Коммуникация'],
    workExperiences: [{ company: 'Example', period: '2024 — 2025', tasks: 'Разработка API' }],
    petProjects: [{ name: 'Планировщик', description: 'Расписание встреч', stack: ['React'] }],
    achievementItems: ['Победитель соревнования'], interests: ['Алгоритмы'] });
  assert.equal(imported.professionalRole, 'Backend-разработчик');
  assert.deepEqual(imported.stack, ['TypeScript', 'Custom Tech']);
  assert.equal(imported.workExperiences[0].company, 'Example');
  assert.equal(imported.petProjects[0].name, 'Планировщик');
  assert.deepEqual(imported.achievementItems, ['Победитель соревнования']);
  assert.deepEqual(imported.interests, ['Алгоритмы']);
  assert.equal('bio' in imported, false, 'Interests do not replace the author bio');
});

test('asynchronous import preserves changed fields, custom chips and repeatable rows', () => {
  const original = createResumeDraft(profile());
  const current = { ...original, name: 'Ручная правка', stack: [...original.stack, 'Custom Tech'],
    workExperiences: [{ period: '', company: 'Ручная компания', tasks: 'Ручные задачи' }],
    petProjects: [{ name: 'Ручной проект', description: '', stack: [] }] };
  const imported = recognizeResumeFields({ name: 'Из резюме', email: 'resume@example.invalid', stack: ['Python'],
    softSkills: ['Коммуникация'], workExperiences: [{ period: '', company: 'Из файла', tasks: '' }],
    petProjects: [{ name: 'Из файла', description: '', stack: [] }], achievementItems: ['Из файла'] });
  const result = mergeResumeImport(current, original, imported, new Set(['achievementItems']));
  assert.equal(result.name, 'Ручная правка');
  assert.equal(result.email, 'resume@example.invalid');
  assert.deepEqual(result.stack, ['TypeScript', 'Custom Tech']);
  assert.deepEqual(result.workExperiences, current.workExperiences);
  assert.deepEqual(result.petProjects, current.petProjects);
  assert.deepEqual(result.achievementItems, []);
  assert.deepEqual(result.softSkills, ['Лидерство', 'Коммуникация']);
  assert.deepEqual(original.stack, ['TypeScript'], 'Import never mutates the captured snapshot');
});

test('edits made and reverted while importing still take precedence', () => {
  const original = createResumeDraft(profile());
  assert.equal(mergeResumeImport(original, original, { name: 'Импортированное имя' }, new Set(['name'])).name, original.name);
});

test('migration retains old history and separates legacy additional information', () => {
  const draft = createResumeDraft(profile({ workHistory: 'Исторический опыт без известных дат',
    careerAchievements: '• Победитель хакатона\nДополнительно\n• Алгоритмы' }));
  assert.equal(draft.workExperiences[0].tasks, 'Исторический опыт без известных дат');
  assert.deepEqual(draft.achievementItems, ['Победитель хакатона']);
  assert.deepEqual(draft.interests, ['Алгоритмы']);
  const values = resumeDraftValues(draft);
  assert.equal(values.workHistory, 'Исторический опыт без известных дат');
  assert.equal(values.careerAchievements, 'Победитель хакатона');
  assert.equal(values.industry, 'ИТ');
  assert.equal(values.bio, 'Описание автора');
});

test('oversized sections are rejected before normalization shortens their projections', () => {
  const valid = createResumeDraft(profile());
  assert.equal(resumeDraftError(valid), '');
  const workExperiences = Array.from({ length: 5 }, () => ({ company: 'Example', period: '', tasks: 'a'.repeat(resumeSectionLimits.workTasks) }));
  assert.match(resumeDraftError({ ...valid, workExperiences }), /Сократите опыт/);
  const petProjects = Array.from({ length: 5 }, () => ({ name: 'Example', description: 'a'.repeat(resumeSectionLimits.projectDescription), stack: [] }));
  assert.match(resumeDraftError({ ...valid, petProjects }), /Сократите pet/);
  assert.match(resumeDraftError({ ...valid, interests: ['a'.repeat(resumeSectionLimits.interests + 1)] }), /Сократите интересы/);
  assert.match(resumeDraftError({ ...valid, professionalRole: 'Произвольный текст' }), /из списка/);
});

test('all supported self-assessment skills survive importing and saving', () => {
  assert.ok(softSkillOptions.length <= MAX_SOFT_SKILLS);
  const draft = mergeResumeImport(createResumeDraft(profile()), createResumeDraft(profile()), recognizeResumeFields({ softSkills: softSkillOptions }));
  assert.deepEqual([...resumeDraftValues(draft).softSkills].sort(), [...softSkillOptions].sort());
});

test('questionnaire snapshot omits contacts while retaining structured professional history', () => {
  const draft = createResumeDraft(profile({ workExperiences: [{ period: '2024 — 2025', company: 'Example', tasks: 'API' }],
    petProjects: [{ name: 'Планировщик', description: 'Встречи', stack: ['React'] }], achievementItems: ['Награда'], interests: ['Алгоритмы'] }));
  const survey = resumeSurveyValues(draft);
  for (const key of ['name', 'email', 'phone', 'city', 'bio']) assert.equal(key in survey, false);
  assert.deepEqual(survey.workExperiences, draft.workExperiences);
  assert.deepEqual(survey.petProjects, draft.petProjects);
  assert.deepEqual(survey.achievementItems, draft.achievementItems);
  assert.deepEqual(survey.interests, draft.interests);
});

test('competency search stays compact and keeps selected custom skills visible for any query', () => {
  const initial = competencySuggestions(['Custom Tech'], '');
  assert.deepEqual(initial.selected, ['Custom Tech']);
  assert.ok(initial.options.length >= 12 && initial.options.length <= 18);
  const unrelated = competencySuggestions(['Custom Tech', 'TypeScript'], 'postgres');
  assert.deepEqual(unrelated.selected, ['Custom Tech', 'TypeScript']);
  assert.ok(unrelated.options.includes('PostgreSQL'));
  assert.equal(unrelated.options.includes('TypeScript'), false);
  const alias = competencySuggestions(['TypeScript'], 'TS');
  assert.deepEqual(alias.selectedMatches, ['TypeScript']);
  assert.deepEqual(competencySuggestions([], 'not-a-known-fixture-skill').options, []);
});

test('search prioritizes exact short skill names and caps broad results', () => {
  for (const skill of ['C', 'R', 'Go']) assert.equal(competencySuggestions([], skill).options[0], skill);
  assert.equal(competencySuggestions([], 'TS').options[0], 'TypeScript');
  const catalog = ['C', ...Array.from({ length: 60 }, (_, index) => `Catalog Competence ${index}`)];
  const broad = competencySuggestions([], 'C', false, catalog);
  assert.equal(broad.options[0], 'C');
  assert.equal(broad.options.length, MAX_VISIBLE_COMPETENCY_RESULTS);
  assert.equal(broad.total, catalog.length);
  assert.equal(competencySuggestions([], '', true, catalog).options.length, catalog.length);
});

test('a legacy form at the work-history limit saves unchanged without losing its tail', () => {
  const workHistory = 'x'.repeat(19992) + 'ХВОСТ123';
  const draft = createResumeDraft(profile({ workHistory }));
  assert.equal(resumeDraftError(draft), '');
  assert.equal(resumeDraftValues(draft).workHistory, workHistory);
  assert.equal(resumeSurveyValues(draft).workHistory, workHistory);
  assert.match(resumeDraftError({ ...draft, workExperiences: draft.workExperiences.map((entry, index) => index ? entry : { ...entry, company: 'Добавленная компания' }) }), /Сократите опыт/u);
});

test('import protects the legacy work source together with edited or reverted work rows', () => {
  const workHistory = 'x'.repeat(19992) + 'ХВОСТ123';
  const original = createResumeDraft(profile({ workHistory }));
  const imported = recognizeResumeFields({ workHistory: 'Импортированный опыт',
    workExperiences: [{ company: 'Новая компания', period: '', tasks: 'Новые задачи' }] });
  const reverted = mergeResumeImport(original, original, imported, new Set(['workExperiences']));
  assert.equal(reverted.workHistory, workHistory);
  assert.equal(resumeDraftError(reverted), '');
  assert.equal(resumeDraftValues(reverted).workHistory, workHistory);
  const edited = { ...original, workExperiences: [{ company: 'Ручная компания', period: '', tasks: 'Ручные задачи' }] };
  assert.equal(mergeResumeImport(edited, original, imported).workHistory, workHistory);
  const untouched = mergeResumeImport(original, original, imported);
  assert.equal(untouched.workHistory, 'Импортированный опыт');
  assert.equal(untouched.workExperiences[0].company, 'Новая компания');
  assert.equal(mergeResumeImport(original, original, { workHistory: 'Без соответствующих записей' }).workHistory, workHistory);
});
