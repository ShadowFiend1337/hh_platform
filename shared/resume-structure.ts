import { normalizeStackSkills } from './catalog.ts';
import { MAX_STACK_SKILLS, resumeSectionLimits } from './resume-limits.ts';
export { MAX_SOFT_SKILLS } from './resume-limits.ts';

/** Structured resume sections shared by import, questionnaire and saved profiles. */
export interface WorkExperience { period: string; company: string; tasks: string }
export interface PetProject { name: string; description: string; stack: string[] }
export interface ResumeSections {
  workExperiences: WorkExperience[];
  petProjects: PetProject[];
  achievementItems: string[];
  interests: string[];
}

export const MAX_WORK_EXPERIENCES = 30;
export const MAX_PET_PROJECTS = 30;
export const MAX_RESUME_ITEMS = 50;

/** OCR may mix visually similar Latin/Cyrillic letters in this short section label. */
export function normalizePetProjectHeading(line: string): string {
  const heading = line.trim();
  return heading.length <= 40 && /^[pр][eе][tт][ \t]*(?:[-—–][ \t]*)?(?:проект(?:ы)?|projects?)[ \t]*:?[ \t]*$/iu.test(heading)
    ? 'Pet-проекты' : line;
}

const text = (value: unknown, limit: number) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

function legacyWorkEntries(history: string): WorkExperience[] {
  const entries: WorkExperience[] = [];
  let rest = history;
  while (rest) {
    const edge = rest.length > resumeSectionLimits.workTasks ? rest.lastIndexOf('\n', resumeSectionLimits.workTasks) : rest.length;
    const end = edge > 0 ? edge : Math.min(rest.length, resumeSectionLimits.workTasks);
    entries.push({ period: '', company: '', tasks: rest.slice(0, end) });
    rest = rest.slice(end).replace(/^\n/u, '');
  }
  return entries;
}

/** Recognizes an unchanged legacy draft, never an arbitrary edited or oversized structured section. */
export function isLegacyWorkMigration(entries: readonly WorkExperience[], source: unknown): boolean {
  if (typeof source !== 'string') return false;
  const history = legacyHistory(source).history;
  const expected = legacyWorkEntries(history);
  return Boolean(history) && entries.length === expected.length && entries.every((entry, index) => {
    const sourceEntry = record(entry);
    return (['period', 'company', 'tasks'] as const).every(key => sourceEntry[key] === expected[index][key]);
  });
}

/** Empty fields are omitted; an unchanged legacy migration keeps its original separators and budget. */
export function workHistoryText(entries: readonly WorkExperience[], legacySource?: unknown): string {
  if (isLegacyWorkMigration(entries, legacySource)) return legacyHistory(legacySource).history;
  return entries.map(entry => [entry.company, entry.period, entry.tasks].filter(Boolean).join('\n')).filter(Boolean).join('\n\n');
}
export function careerAchievementsText(items: readonly string[]): string {
  return items.filter(Boolean).join('\n').slice(0, resumeSectionLimits.achievementItems);
}
export function petProjectsText(entries: readonly PetProject[]): string {
  return entries.map(entry => [entry.name, entry.description, entry.stack.length ? `Стек: ${entry.stack.join(', ')}` : ''].filter(Boolean).join('\n')).filter(Boolean).join('\n\n').slice(0, resumeSectionLimits.petProjects);
}

/** Keeps wrapped bullet text together while preserving unlabeled lines as editable items. */
export function resumeListItems(lines: readonly string[]): string[] {
  const items: string[] = [];
  let bullet = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const marked = /^(?:[•*·▪●–—-]|\d+[.)])\s*/u.test(line);
    const value = line.replace(/^(?:[•*·▪●–—-]|\d+[.)])\s*/u, '').trim();
    if (!value) continue;
    if (!marked && bullet && items.length) items[items.length - 1] += `\n${value}`;
    else items.push(value);
    bullet = marked || bullet;
  }
  return items;
}

function boundedItems(values: unknown, totalLimit: number): string[] {
  if (!Array.isArray(values)) return [];
  const result: string[] = [];
  let remaining = totalLimit;
  for (const value of values.slice(0, MAX_RESUME_ITEMS)) {
    const item = text(value, Math.max(0, remaining - (result.length ? 1 : 0)));
    if (!item) continue;
    remaining -= item.length + (result.length ? 1 : 0);
    result.push(item);
    if (remaining <= 0) break;
  }
  return result;
}

function boundedWork(values: unknown): WorkExperience[] {
  if (!Array.isArray(values)) return [];
  const result: WorkExperience[] = [];
  let remaining = resumeSectionLimits.workHistory;
  for (const value of values.slice(0, MAX_WORK_EXPERIENCES)) {
    const source = record(value);
    const entry: WorkExperience = { period: '', company: '', tasks: '' };
    let populated = 0;
    for (const [key, limit] of [['company', resumeSectionLimits.workCompany], ['period', resumeSectionLimits.workPeriod], ['tasks', resumeSectionLimits.workTasks]] as const) {
      const item = text(source[key], Math.min(limit, Math.max(0, remaining - (populated ? 1 : result.length ? 2 : 0))));
      if (!item) continue;
      remaining -= item.length + (populated ? 1 : result.length ? 2 : 0);
      entry[key] = item;
      populated++;
    }
    if (populated) result.push(entry);
    if (remaining <= 0) break;
  }
  return result;
}

function boundedProjects(values: unknown): PetProject[] {
  if (!Array.isArray(values)) return [];
  const result: PetProject[] = [];
  let remaining = resumeSectionLimits.petProjects;
  for (const value of values.slice(0, MAX_PET_PROJECTS)) {
    const source = record(value);
    let entry: PetProject = { name: text(source.name, resumeSectionLimits.projectName), description: text(source.description, resumeSectionLimits.projectDescription), stack: [] };
    if (Array.isArray(source.stack)) {
      entry.stack = normalizeStackSkills(source.stack.filter((skill): skill is string => typeof skill === 'string')
        .map(skill => skill.trim().slice(0, resumeSectionLimits.projectSkill))).slice(0, MAX_STACK_SKILLS);
    }
    const available = Math.max(0, remaining - (result.length ? 2 : 0));
    const projected = petProjectsText([entry]);
    if (!projected) continue;
    if (projected.length > available) {
      // Allocate the available text across fields rather than clipping only the projection.
      let budget = available;
      const name = entry.name.slice(0, budget); budget -= name.length;
      const description = entry.description.slice(0, Math.max(0, budget - (name ? 1 : 0)));
      budget -= description.length + (description && name ? 1 : 0);
      const stack: string[] = [];
      const labelLength = (name || description ? 1 : 0) + 'Стек: '.length;
      for (const skill of entry.stack) {
        const cost = skill.length + (stack.length ? 2 : labelLength);
        if (cost > budget) break;
        stack.push(skill); budget -= cost;
      }
      entry = { name, description, stack };
    }
    const length = petProjectsText([entry]).length;
    if (length) { remaining -= length + (result.length ? 2 : 0); result.push(entry); }
    if (remaining <= 0) break;
  }
  return result;
}

function legacyLists(value: unknown): Pick<ResumeSections, 'achievementItems' | 'interests'> {
  const achievements: string[] = [];
  const interests: string[] = [];
  let target = achievements;
  for (const line of text(value, 8000).split(/\r?\n/u)) {
    const header = /^(?:интересы(?:\s*\/\s*дополнительно)?|увлечения|хобби|дополнительно|дополнительная информация|interests|hobbies|additional(?: information)?)\s*(?:[:—–-]\s*(.*))?$/iu.exec(line.trim());
    if (header) { target = interests; if (header[1]) target.push(header[1]); }
    else if (/^(?:достижения|achievements|accomplishments)\s*:?[ \t]*$/iu.test(line.trim())) target = achievements;
    else target.push(line);
  }
  return { achievementItems: resumeListItems(achievements), interests: resumeListItems(interests) };
}

interface ResumeSectionInput {
  workExperiences?: unknown;
  petProjects?: unknown;
  achievementItems?: unknown;
  interests?: unknown;
  workHistory?: unknown;
  careerAchievements?: unknown;
}

/** Earlier imports stored pet projects below a heading in workHistory. Separate them once. */
function legacyHistory(value: unknown): { history: string; projects: PetProject[] } {
  const lines = text(value, resumeSectionLimits.workHistory).split(/\r?\n/u);
  const heading = lines.findIndex(line => /^(?:pet[- ]?проект(?:ы)?|пет[- ]?проект(?:ы)?|личные проекты|учебные проекты|pet projects?|personal projects|side projects)\s*:?[ \t]*$/iu.test(normalizePetProjectHeading(line).trim()));
  if (heading < 0) return { history: lines.join('\n'), projects: [] };
  const projects: PetProject[] = [];
  let entry: PetProject = { name: '', description: '', stack: [] };
  const flush = () => {
    if (entry.name || entry.description || entry.stack.length) projects.push(entry);
    entry = { name: '', description: '', stack: [] };
  };
  for (const raw of lines.slice(heading + 1)) {
    const line = raw.trim();
    if (!line) continue;
    const name = /^(?:название(?: проекта)?|проект|project(?: name)?|name)\s*[:—–-]\s*(.*)$/iu.exec(line);
    const stack = /^(?:стек|технологии|stack|technologies)\s*[:—–-]\s*(.*)$/iu.exec(line);
    const description = /^(?:описание(?: проекта)?|description)\s*[:—–-]\s*(.*)$/iu.exec(line);
    if (name) { flush(); entry.name = name[1]; }
    else if (stack) entry.stack = normalizeStackSkills([...entry.stack, ...stack[1].split(/[,;|•]/u)]);
    else entry.description += `${entry.description ? '\n' : ''}${description ? description[1] : raw}`;
  }
  flush();
  return { history: lines.slice(0, heading).join('\n').trim(), projects };
}

/** Legacy text remains editable even when its employer or dates cannot be identified. */
export function resumeSections(value: ResumeSectionInput): ResumeSections {
  const legacy = legacyLists(value.careerAchievements);
  const legacyWork = legacyHistory(value.workHistory);
  const history = legacyWork.history;
  // Split at line boundaries without spending source characters on generated separators.
  const migratedHistory = legacyWorkEntries(history);
  const unchangedMigration = Array.isArray(value.workExperiences) && isLegacyWorkMigration(value.workExperiences, value.workHistory);
  return {
    // Migration cannot spend source characters on the separators inserted by the projection.
    // Explicit structured data is bounded normally; a migrated draft keeps legacy work
    // and project text so the form can report exceeded limits before saving rather than losing it.
    workExperiences: unchangedMigration || !Array.isArray(value.workExperiences) ? migratedHistory : boundedWork(value.workExperiences),
    petProjects: Array.isArray(value.petProjects) ? boundedProjects(value.petProjects) : legacyWork.projects,
    achievementItems: boundedItems(Array.isArray(value.achievementItems) ? value.achievementItems : legacy.achievementItems, resumeSectionLimits.achievementItems),
    interests: boundedItems(Array.isArray(value.interests) ? value.interests : legacy.interests, resumeSectionLimits.interests),
  };
}
