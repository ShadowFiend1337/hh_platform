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
export const MAX_SOFT_SKILLS = 30;

const text = (value: unknown, limit: number) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Empty fields are omitted in the text projections; dates and employers are never invented. */
export function workHistoryText(entries: readonly WorkExperience[]): string {
  return entries.map(entry => [entry.company, entry.period, entry.tasks].filter(Boolean).join('\n')).filter(Boolean).join('\n\n');
}
export function careerAchievementsText(items: readonly string[]): string {
  return items.filter(Boolean).join('\n').slice(0, 4000);
}
export function petProjectsText(entries: readonly PetProject[]): string {
  return entries.map(entry => [entry.name, entry.description, entry.stack.length ? `Стек: ${entry.stack.join(', ')}` : ''].filter(Boolean).join('\n')).filter(Boolean).join('\n\n').slice(0, 20_000);
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
  let remaining = 20_000;
  for (const value of values.slice(0, MAX_WORK_EXPERIENCES)) {
    const source = record(value);
    const entry: WorkExperience = { period: '', company: '', tasks: '' };
    let populated = 0;
    for (const [key, limit] of [['company', 200], ['period', 100], ['tasks', 4000]] as const) {
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
  let remaining = 20_000;
  for (const value of values.slice(0, MAX_PET_PROJECTS)) {
    const source = record(value);
    let entry: PetProject = { name: text(source.name, 200), description: text(source.description, 4000), stack: [] };
    if (Array.isArray(source.stack)) {
      const seen = new Set<string>();
      for (const raw of source.stack.slice(0, 100)) {
        const skill = text(raw, 80);
        const key = skill.toLocaleLowerCase();
        if (!skill || seen.has(key)) continue;
        seen.add(key); entry.stack.push(skill);
      }
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

/** Legacy text remains editable even when its employer or dates cannot be identified. */
export function resumeSections(value: ResumeSectionInput): ResumeSections {
  const legacy = legacyLists(value.careerAchievements);
  const history = text(value.workHistory, 20_000);
  const migratedHistory: WorkExperience[] = [];
  // Split at a line boundary when possible, retaining every character of long histories.
  let rest = history;
  while (rest) {
    const edge = rest.length > 4000 ? rest.lastIndexOf('\n', 4000) : rest.length;
    const end = edge > 0 ? edge : Math.min(rest.length, 4000);
    migratedHistory.push({ period: '', company: '', tasks: rest.slice(0, end) });
    rest = rest.slice(end).replace(/^\n/u, '');
  }
  return {
    // Migration cannot spend source characters on the separators inserted by the projection.
    // Explicit structured data is bounded normally; a migrated draft keeps all legacy text
    // so the form can report an over-budget projection before saving rather than losing it.
    workExperiences: Array.isArray(value.workExperiences) ? boundedWork(value.workExperiences) : migratedHistory,
    petProjects: boundedProjects(value.petProjects),
    achievementItems: boundedItems(Array.isArray(value.achievementItems) ? value.achievementItems : legacy.achievementItems, 4000),
    interests: boundedItems(Array.isArray(value.interests) ? value.interests : legacy.interests, 4000),
  };
}
