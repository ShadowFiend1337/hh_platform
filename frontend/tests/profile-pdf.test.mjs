import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createProfilePdf } from '../src/profile-pdf.ts';
import { createInitialState } from '../src/model.ts';

async function extract(bytes) {
  const task = getDocument({ data: bytes, disableFontFace: true });
  try {
    const document = await task.promise, pages = [];
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number), content = await page.getTextContent();
      pages.push(content.items.map(item => item.str || '').join(' ')); page.cleanup();
    }
    return { text: pages.join('\n'), pages: document.numPages };
  } finally { await task.destroy(); }
}

test('PDF exports separate resume sections with hidden nested contacts and authoritative deletion', async () => {
  const font = new Uint8Array(await readFile(new URL('../public/assets/fonts/manrope.ttf', import.meta.url)));
  const person = { ...createInitialState().profile, name: 'Проверка структурированного резюме', email: 'private@example.com',
    workHistory: 'Устаревшие задачи', careerAchievements: 'Устаревшие награды',
    workExperiences: [{ period: '2023 — 2025', company: 'Рабочая компания', tasks: 'Разработал API. work@example.com' }],
    petProjects: [{ name: 'Личный трекер', description: 'Сохраняет заметки. pet@example.com', stack: ['TypeScript', 'SQLite'] }],
    achievementItems: ['Призёр олимпиады'], interests: ['Алгоритмы'],
    achievements: [{ title: 'Чемпионат ФСП', result: '2 место', year: 2025 }] };
  for (const contacts of [false, true]) {
    const document = await extract(await createProfilePdf(person, contacts, font));
    assert.match(document.text, /Опыт работы.*Рабочая компания.*Pet-проекты.*Личный трекер.*Достижения.*Призёр олимпиады.*Интересы.*Алгоритмы.*Достижения ФСП.*Чемпионат ФСП/su);
    assert.doesNotMatch(document.text, /Устаревшие задачи|Устаревшие награды/u);
    assert.equal(document.text.includes('work@example.com'), contacts);
    assert.equal(document.text.includes('pet@example.com'), contacts);
    assert.equal(document.text.includes('private@example.com'), contacts);
  }
  const cleared = await extract(await createProfilePdf({ ...person, workExperiences: [], petProjects: [], achievementItems: [], interests: [] }, false, font));
  assert.doesNotMatch(cleared.text, /Рабочая компания|Личный трекер|Призёр олимпиады|Алгоритмы|Устаревшие/u);
});

test('a historical long workHistory remains complete across PDF pages when structured sections are absent', async () => {
  const font = new Uint8Array(await readFile(new URL('../public/assets/fonts/manrope.ttf', import.meta.url)));
  const person = { ...createInitialState().profile, name: 'Историческая анкета',
    workHistory: 'Проектировал API и проверял операции в тестовой компании.\n'.repeat(90) + 'Последняя строка истории.' };
  delete person.workExperiences;
  const document = await extract(await createProfilePdf(person, false, font));
  assert(document.pages > 1); assert.match(document.text, /Последняя строка истории\./u);
});


test('demo PDF never exports contacts even when the caller requested them', async () => {
  const font = new Uint8Array(await readFile(new URL('../public/assets/fonts/manrope.ttf', import.meta.url)));
  const person = { ...createInitialState().profile, name: 'Демо специалист', email: 'demo-private@example.com',
    demoProfile: true, synthetic: true, petProjects: [{ name: 'Демо проект', description: 'Контакт demo-nested@example.com', stack: ['TypeScript'] }] };
  const document = await extract(await createProfilePdf(person, true, font));
  assert.doesNotMatch(document.text, /demo-private@example.com|demo-nested@example.com/u);
  assert.match(document.text, /Недоступны для демопрофиля/u);
});
