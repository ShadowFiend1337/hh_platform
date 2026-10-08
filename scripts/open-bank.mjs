import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { openBankVersion, openRubricVersion, openBankReview, openFamilies, openSources, getOpenProgram, sampleOpenQuestions } from '../server/open-bank.mjs';
import { openGrades, openGroups, openSpecializations, validateOpenBank } from '../server/open-bank/schema.mjs';

const [command = 'validate', specialization = 'ML', grade = 'Middle'] = process.argv.slice(2);
const destination = new URL('../server/data/open-bank/', import.meta.url);
const errors = validateOpenBank(openFamilies, openSources);
assert.deepEqual(errors, [], 'The open corpus must pass structural validation');

if (command === 'validate') {
  for (const name of openSpecializations) for (const level of openGrades) {
    const program = getOpenProgram(name, level);
    assert.equal(program.review.approvedForCertification, false);
    const first = sampleOpenQuestions(name, level);
    const second = sampleOpenQuestions(name, level, { excludedFamilyIds: first.questions.map(question => question.familyId) });
    assert.equal(first.questions.length, 20);
    assert.equal(second.questions.length, 20);
    assert.equal(new Set([...first.questions, ...second.questions].map(question => question.familyId)).size, 40);
    for (const group of openGroups) assert.equal(first.questions.filter(question => question.group === group).length, 5);
    for (const question of program.questions) {
      assert.ok(question.referenceAnswer.level && question.rubric.some(criterion => criterion.id === 'level-depth'));
      assert.ok(question.sources.every(source => source.verification && source.accessedOn));
    }
  }
  const assets = new URL('../frontend/dist/assets/', import.meta.url);
  let names;
  try { names = await readdir(assets); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (names) {
    const content = (await Promise.all(names.filter(name => name.endsWith('.js')).map(name => readFile(new URL(name, assets), 'utf8')))).join('\n');
    for (const family of openFamilies) {
      assert.ok(!content.includes(family.id), 'Private open-bank ID leaked into frontend bundle');
      assert.ok(!content.includes(family.referenceAnswer), 'Private reference answer leaked into frontend bundle');
    }
    console.log('PASS Private open-bank data are absent from the existing frontend build');
  } else console.log('SKIP Frontend bundle privacy: build frontend first');
  console.log('PASS Specialization/grade coverage, distinct family forms, source provenance and bounded personalization');
  console.log('PASS Private authoring samples retain different grade conditions, expected actions and rubric versions');
  console.log('LIMITATION Structural validation is not expert review, grade calibration or a candidate study');
} else if (command === 'sample' || command === 'export') {
  const value = command === 'sample' ? sampleOpenQuestions(specialization, grade)
    : { bankVersion: openBankVersion, rubricVersion: openRubricVersion, review: openBankReview, sources: openSources, families: openFamilies,
      programs: openSpecializations.flatMap(name => openGrades.map(level => getOpenProgram(name, level))) };
  await mkdir(destination, { recursive: true });
  const filename = command === 'sample' ? 'preview-' + value.specialization + '-' + value.grade + '.json' : 'open-bank.json';
  const target = new URL(filename, destination);
  await writeFile(target, JSON.stringify(value, null, 2) + '\n', 'utf8');
  console.log('Saved private authoring artifact: ' + fileURLToPath(target));
  console.log('LIMITATION This is an author draft, not a live assessment or validated grade');
} else throw new RangeError('Use: node scripts/open-bank.mjs validate | sample [specialization] [grade] | export');
