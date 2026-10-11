import { MAX_STACK_SKILLS, resumeTextLimits } from '../shared/resume-limits.ts';
import { MAX_WORK_EXPERIENCES, MAX_PET_PROJECTS, MAX_RESUME_ITEMS, workHistoryText, careerAchievementsText } from '../shared/resume-structure.ts';

/** Validate before normalizing: tolerant UI migration must never hide malformed API input. */
export function validateResumeFields(value, fail) {
  const text = (input, maximum, field) => {
    if (typeof input !== 'string' || input.length > maximum) fail(`${field}: допустимо до ${maximum} символов.`);
    return input.trim();
  };
  const list = (input, maximum, field) => {
    if (!Array.isArray(input) || input.length > maximum) fail(`Некорректный список: ${field}.`);
    return input;
  };
  const object = (input, fields, field) => {
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !fields.includes(key))) fail(`Некорректный объект: ${field}.`);
    return input;
  };
  const result = {};
  // Compatibility projections are still untrusted input even when structured fields win.
  if (Object.hasOwn(value, 'workHistory')) text(value.workHistory, resumeTextLimits.workHistory, 'История работы');
  if (Object.hasOwn(value, 'careerAchievements')) text(value.careerAchievements, resumeTextLimits.careerAchievements, 'Достижения');
  if (Object.hasOwn(value, 'workExperiences')) {
    result.workExperiences = list(value.workExperiences, MAX_WORK_EXPERIENCES, 'Опыт работы').map(input => {
      const entry = object(input, ['period', 'company', 'tasks'], 'Опыт работы');
      return { period: text(entry.period, 100, 'Период работы'), company: text(entry.company, 200, 'Компания'), tasks: text(entry.tasks, 4000, 'Задачи') };
    });
    const projected = workHistoryText(result.workExperiences, value.workHistory);
    if (projected.length > resumeTextLimits.workHistory) fail('История работы: допустимо до 20000 символов.');
    result.workHistory = projected;
  } else result.workHistory = text(value.workHistory === undefined ? '' : value.workHistory, resumeTextLimits.workHistory, 'История работы');
  if (Object.hasOwn(value, 'petProjects')) {
    result.petProjects = list(value.petProjects, MAX_PET_PROJECTS, 'Pet-проекты').map(input => {
      const entry = object(input, ['name', 'description', 'stack'], 'Pet-проект');
      return { name: text(entry.name, 200, 'Название проекта'), description: text(entry.description, 4000, 'Описание проекта'),
        stack: [...new Set(list(entry.stack, MAX_STACK_SKILLS, 'Стек проекта').map(skill => text(skill, 80, 'Навык проекта')).filter(Boolean))] };
    });
    const projected = result.petProjects.map(entry => [entry.name, entry.description, entry.stack.length ? `Стек: ${entry.stack.join(', ')}` : ''].filter(Boolean).join('\n')).filter(Boolean).join('\n\n');
    if (projected.length > 20000) fail('Pet-проекты: допустимо до 20000 символов.');
  }
  for (const field of ['achievementItems', 'interests']) {
    if (!Object.hasOwn(value, field)) continue;
    result[field] = [...new Set(list(value[field], MAX_RESUME_ITEMS, field).map(item => text(item, 4000, field)).filter(Boolean))];
    if (result[field].join('\n').length > 4000) fail(`${field}: допустимо до 4000 символов.`);
  }
  result.careerAchievements = Object.hasOwn(result, 'achievementItems')
    ? careerAchievementsText(result.achievementItems) : text(value.careerAchievements === undefined ? '' : value.careerAchievements, resumeTextLimits.careerAchievements, 'Достижения');
  if (result.workHistory.length > resumeTextLimits.workHistory) fail('История работы: допустимо до 20000 символов.');
  if (result.careerAchievements.length > resumeTextLimits.careerAchievements) fail('Достижения: допустимо до 4000 символов.');
  return result;
}
