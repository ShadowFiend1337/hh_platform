import test from 'node:test';
import assert from 'node:assert/strict';
import { DirectoryStore, publicCandidate } from '../directory-store.mjs';
import { PlatformService } from '../platform.mjs';
import { openStore } from '../store.mjs';
import { createInitialState } from '../../frontend/src/model.ts';
import { MAX_SOFT_SKILLS } from '../../shared/resume-limits.ts';

const owner = 'a'.repeat(64);
function fixture(t) {
  const directory = new DirectoryStore(':memory:');
  const assessment = openStore(':memory:');
  t.after(() => { directory.close(); assessment.close(); });
  return new PlatformService(directory, assessment);
}
test('Optional self-assessment survives profile and survey storage without becoming qualification', t => {
  const platform = fixture(t), state = createInitialState();
  state.profile = { ...state.profile, name: 'Тестовый кандидат', email: 'test@example.com', consent: true,
    industry: 'ИТ', professionalRole: 'Разработчик', stack: ['React'], experience: 'Без опыта', softSkills: ['Лидерство', 'Коммуникация'] };
  const survey = { id: 'survey-soft-skills', date: new Date().toISOString(), industry: 'ИТ', professionalRole: 'Разработчик',
    specialization: 'Frontend', desiredGrade: 'Junior', experience: 'Без опыта', stack: ['React'], softSkills: ['Коммуникация'] };
  state.surveys = [survey];
  const stored = platform.save(owner, state, 0);
  assert.deepEqual(stored.state.profile.softSkills, ['Лидерство', 'Коммуникация']);
  assert.deepEqual(platform.read(owner).state.surveys[0].softSkills, ['Коммуникация']);
  assert.equal(stored.state.profile.confirmed, null);
  const publicProfile = publicCandidate(stored.state.profile);
  assert.deepEqual(publicProfile.softSkills, ['Лидерство', 'Коммуникация']);
  assert.equal(publicProfile.email, '');
});
test('A profile consisting only of self-assessment still requires consent', t => {
  const platform = fixture(t), state = createInitialState();
  state.profile.softSkills = ['Лидерство'];
  assert.throws(() => platform.save(owner, state, 0), error => error.status === 400 && /согласие/u.test(error.message));
  assert.equal(platform.read(owner).state, null);
});
test('Malformed self-assessment is rejected atomically and contact-like entries are scrubbed publicly', t => {
  const platform = fixture(t), state = createInitialState();
  state.profile.consent = true;
  for (const value of [['a'.repeat(81)], [{ verified: true }], Array(MAX_SOFT_SKILLS + 1).fill('Лидерство')]) {
    state.profile.softSkills = value;
    assert.throws(() => platform.save(owner, state, 0), error => error.status === 400);
    assert.equal(platform.read(owner).state, null);
  }
  assert.ok(!JSON.stringify(publicCandidate({ id: 'test', softSkills: ['mail@example.com', '+7 999 123-45-67', 'Коммуникация'] })).includes('mail@example.com'));
});
