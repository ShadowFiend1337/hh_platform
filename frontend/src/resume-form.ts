import { isGrade, type Grade } from '../../shared/grading.ts';
import { competenceOptions, isSpecialization, normalizeProfessionalRole, normalizeStackSkills, professionalRoleOptions, searchStackCompetencies, softSkillOptions, type Specialization } from '../../shared/catalog.ts';
import { MAX_SOFT_SKILLS, MAX_STACK_SKILLS, resumeSectionLimits, resumeTextLimits } from '../../shared/resume-limits.ts';
import { careerAchievementsText, MAX_PET_PROJECTS, MAX_RESUME_ITEMS, MAX_WORK_EXPERIENCES, resumeSections, workHistoryText, type ResumeSections } from '../../shared/resume-structure.ts';
import { employmentTypes } from '../../shared/search.ts';
import type { Candidate } from './model';
import type { ResumeFields } from './resume-parser';

export type ResumeDraft = ResumeSections & {
  name: string; email: string; phone: string; city: string; professionalRole: string;
  specialization: string; desiredGrade: string; stack: string[]; experience: string; softSkills: string[];
  bio: string; education: string; portfolio: string; languages: string; format: string; workHistory: string;
  salaryFrom: string; salaryTo: string; employmentType: string;
};
export const workFormats = ['Удалённо', 'Гибрид', 'Офис'];
export const popularCompetenceOptions = ['TypeScript', 'JavaScript', 'React', 'Python', 'Java', 'Go', 'C++', 'SQL', 'PostgreSQL', 'Node.js', 'HTML', 'CSS', 'Git', 'Docker', 'Linux', 'Kotlin', 'Figma', 'Excel'];
export const MAX_VISIBLE_COMPETENCY_RESULTS = 40;

/** Exact aliases and short names such as C, R and Go must remain ahead of broad matches. */
export function competencySuggestions(selected: readonly string[], query: string, expanded = false, catalog: readonly string[] = competenceOptions) {
  const value = normalizeStackSkills(selected);
  const all = normalizeStackSkills([...value, ...catalog]);
  const needle = query.normalize('NFKC').trim().toLocaleLowerCase();
  const matches = needle ? searchStackCompetencies(query, all)
    : expanded ? all : popularCompetenceOptions.filter(skill => all.includes(skill));
  const remaining = matches.filter(skill => !value.includes(skill));
  return {
    selected: value, options: needle ? remaining.slice(0, MAX_VISIBLE_COMPETENCY_RESULTS) : remaining,
    total: remaining.length, selectedMatches: needle ? matches.filter(skill => value.includes(skill)) : [],
  };
}
export const resumeFieldLabels: Record<keyof ResumeFields, string> = {
  name: 'Имя и фамилия', email: 'Email', phone: 'Телефон', city: 'Город', industry: 'Отрасль',
  professionalRole: 'Роль в команде', specialization: 'Специализация', desiredGrade: 'Предполагаемый грейд',
  experience: 'Общий стаж', softSkills: 'Софт-скиллы', workHistory: 'Опыт работы', careerAchievements: 'Достижения',
  workExperiences: 'Опыт работы', petProjects: 'Pet-проекты', achievementItems: 'Достижения', interests: 'Интересы / дополнительно',
  education: 'Образование', stack: 'Стек', portfolio: 'Портфолио', languages: 'Языки', format: 'Формат работы',
};

export function createResumeDraft(profile: Candidate): ResumeDraft {
  return {
    ...resumeSections(profile), name: profile.name, email: profile.email, phone: profile.phone, city: profile.city,
    professionalRole: normalizeProfessionalRole(profile.professionalRole, profile.specialization),
    specialization: profile.specialization, desiredGrade: profile.desiredGrade, stack: normalizeStackSkills(profile.stack),
    experience: profile.experience, softSkills: [...(profile.softSkills || [])], bio: profile.bio || '',
    education: profile.education || '', portfolio: profile.portfolio || '', languages: profile.languages || '', format: profile.format,
    workHistory: profile.workHistory || '',
    salaryFrom: profile.salaryFrom == null ? '' : String(profile.salaryFrom), salaryTo: profile.salaryTo == null ? '' : String(profile.salaryTo),
    employmentType: profile.employmentType || '',
  };
}

/** Import only stated, supported values. An absent section never clears an existing draft. */
export function recognizeResumeFields(fields: ResumeFields): Partial<ResumeDraft> {
  const imported: Partial<ResumeDraft> = {};
  for (const key of ['name', 'email', 'phone', 'city', 'experience', 'education', 'portfolio', 'languages'] as const) {
    const value = fields[key];
    if (typeof value === 'string' && value.trim()) imported[key] = value.trim().slice(0, resumeTextLimits[key]);
  }
  if (fields.specialization && isSpecialization(fields.specialization)) imported.specialization = fields.specialization;
  if (fields.desiredGrade && isGrade(fields.desiredGrade)) imported.desiredGrade = fields.desiredGrade;
  if (fields.professionalRole) {
    const role = normalizeProfessionalRole(fields.professionalRole, isSpecialization(fields.specialization || '') ? fields.specialization as Specialization : undefined);
    if (role) imported.professionalRole = role;
  }
  if (fields.format && workFormats.includes(fields.format)) imported.format = fields.format;
  if (fields.stack?.length) {
    const stack = normalizeStackSkills(fields.stack).map(skill => skill.slice(0, 80)).slice(0, MAX_STACK_SKILLS);
    while (stack.join(', ').length > resumeTextLimits.stack) stack.pop();
    if (stack.length) imported.stack = stack;
  }
  if (fields.softSkills?.length) {
    const skills = [...new Set(fields.softSkills)].filter(skill => softSkillOptions.includes(skill)).slice(0, MAX_SOFT_SKILLS);
    if (skills.length) imported.softSkills = skills;
  }
  const sections = resumeSections(fields);
  if (sections.workExperiences.length && fields.workHistory) imported.workHistory = fields.workHistory;
  for (const key of ['workExperiences', 'petProjects', 'achievementItems', 'interests'] as const) {
    if (sections[key].length) Object.assign(imported, { [key]: sections[key] });
  }
  return imported;
}

/** A field edited while PDF/OCR is running belongs to the user, including repeatable sections. */
export function mergeResumeImport(current: ResumeDraft, original: ResumeDraft, imported: Partial<ResumeDraft>, edited: ReadonlySet<keyof ResumeDraft> = new Set()): ResumeDraft {
  const next = { ...current };
  const workEdited = edited.has('workExperiences') || JSON.stringify(current.workExperiences) !== JSON.stringify(original.workExperiences);
  for (const key of Object.keys(imported) as (keyof ResumeDraft)[]) {
    // The legacy source belongs to the same work section; keep it when its rows are protected.
    if (key === 'workHistory' && (workEdited || !imported.workExperiences)) continue;
    if (edited.has(key) || JSON.stringify(current[key]) !== JSON.stringify(original[key])) continue;
    if (key === 'softSkills') next.softSkills = [...new Set([...current.softSkills, ...imported.softSkills!])].slice(0, MAX_SOFT_SKILLS);
    else Object.assign(next, { [key]: imported[key] });
  }
  return next;
}

function unboundedProjectsText(draft: ResumeDraft): string {
  return draft.petProjects.map(entry => [entry.name.trim(), entry.description.trim(), entry.stack.length ? `Стек: ${entry.stack.join(', ')}` : ''].filter(Boolean).join('\n')).filter(Boolean).join('\n\n');
}

/** Reject a too-large draft before normalization can shorten it silently. */
export function resumeDraftError(draft: ResumeDraft): string {
  if (!draft.name.trim() || !draft.email.trim() || !draft.experience.trim() || !draft.stack.length) return 'Заполните имя, email, общий стаж и стек.';
  for (const key of ['name', 'email', 'phone', 'city', 'experience', 'education', 'portfolio', 'languages', 'format'] as const) {
    if (draft[key].trim().length > resumeTextLimits[key]) return `Сократите поле «${resumeFieldLabels[key]}» до ${resumeTextLimits[key]} символов.`;
  }
  if (draft.bio.trim().length > 3000) return 'Сократите описание о себе до 3000 символов.';
  if (!professionalRoleOptions.includes(draft.professionalRole)) return 'Выберите роль в команде из списка.';
  if (!isSpecialization(draft.specialization)) return 'Выберите специализацию.';
  if (!isGrade(draft.desiredGrade)) return 'Выберите предполагаемый грейд.';
  if (draft.stack.length > MAX_STACK_SKILLS || draft.stack.some(skill => !skill.trim() || skill.length > 80) || draft.stack.join(', ').length > resumeTextLimits.stack) return `Укажите до ${MAX_STACK_SKILLS} компетенций, не более 80 символов каждая и ${resumeTextLimits.stack} символов в сумме.`;
  if (draft.workExperiences.length > MAX_WORK_EXPERIENCES || draft.workExperiences.some(item => item.period.length > resumeSectionLimits.workPeriod || item.company.length > resumeSectionLimits.workCompany || item.tasks.length > resumeSectionLimits.workTasks) || workHistoryText(draft.workExperiences, draft.workHistory).length > resumeSectionLimits.workHistory) return `Сократите опыт работы: допустимо до ${MAX_WORK_EXPERIENCES} мест и ${resumeSectionLimits.workHistory} символов в сумме.`;
  if (draft.petProjects.length > MAX_PET_PROJECTS || draft.petProjects.some(item => item.name.length > resumeSectionLimits.projectName || item.description.length > resumeSectionLimits.projectDescription || item.stack.length > MAX_STACK_SKILLS || item.stack.some(skill => skill.length > resumeSectionLimits.projectSkill)) || unboundedProjectsText(draft).length > resumeSectionLimits.petProjects) return `Сократите pet-проекты: допустимо до ${MAX_PET_PROJECTS} проектов и ${resumeSectionLimits.petProjects} символов в сумме.`;
  if (draft.achievementItems.length > MAX_RESUME_ITEMS || draft.achievementItems.join('\n').length > resumeSectionLimits.achievementItems) return `Сократите достижения до ${resumeSectionLimits.achievementItems} символов.`;
  if (draft.interests.length > MAX_RESUME_ITEMS || draft.interests.join('\n').length > resumeSectionLimits.interests) return `Сократите интересы до ${resumeSectionLimits.interests} символов.`;
  const salaryFrom = draft.salaryFrom === '' ? null : Number(draft.salaryFrom), salaryTo = draft.salaryTo === '' ? null : Number(draft.salaryTo);
  if ([salaryFrom, salaryTo].some(value => value !== null && (!Number.isInteger(value) || value < 0 || value > 10_000_000))) return 'Укажите зарплату от 0 до 10 000 000 ₽ в месяц, целым числом.';
  if (salaryFrom !== null && salaryTo !== null && salaryFrom > salaryTo) return 'Нижняя граница желаемой зарплаты больше верхней. Проверьте диапазон.';
  if (draft.employmentType && !employmentTypes.includes(draft.employmentType)) return 'Выберите занятость из списка.';
  return '';
}

export function resumeDraftValues(draft: ResumeDraft) {
  const sections = resumeSections(draft);
  return {
    ...sections, name: draft.name.trim(), email: draft.email.trim(), phone: draft.phone.trim(), city: draft.city.trim(), industry: 'ИТ',
    professionalRole: draft.professionalRole, specialization: draft.specialization as Specialization, desiredGrade: draft.desiredGrade as Grade,
    stack: normalizeStackSkills(draft.stack), softSkills: [...new Set(draft.softSkills)].filter(skill => softSkillOptions.includes(skill)).slice(0, MAX_SOFT_SKILLS),
    experience: draft.experience.trim(), bio: draft.bio.trim(), education: draft.education.trim(), portfolio: draft.portfolio.trim(), languages: draft.languages.trim(), format: draft.format,
    workHistory: workHistoryText(sections.workExperiences, draft.workHistory), careerAchievements: careerAchievementsText(sections.achievementItems),
    salaryFrom: draft.salaryFrom === '' ? null : Number(draft.salaryFrom), salaryTo: draft.salaryTo === '' ? null : Number(draft.salaryTo), employmentType: draft.employmentType,
  };
}

/** Questionnaire snapshots contain professional information, never contact details. */
export function resumeSurveyValues(draft: ResumeDraft) {
  const values = resumeDraftValues(draft);
  return {
    industry: values.industry, professionalRole: values.professionalRole, specialization: values.specialization,
    desiredGrade: values.desiredGrade, stack: values.stack, experience: values.experience, softSkills: values.softSkills,
    workExperiences: values.workExperiences, petProjects: values.petProjects, achievementItems: values.achievementItems, interests: values.interests,
    careerAchievements: values.careerAchievements, workHistory: values.workHistory, education: values.education,
    portfolio: values.portfolio, languages: values.languages, format: values.format,
  };
}
