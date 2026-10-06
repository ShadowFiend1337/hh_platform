import { languageOptions } from '../../shared/search.ts';

const integer = '(0|[1-9]\\d*)';
const russianYears = new RegExp('^' + integer + '\\s+(год|года|лет)(?:(?:\\s+|\\s*,\\s*|\\s+и\\s+)' + integer + '\\s+(месяц|месяца|месяцев))?$', 'u');
const russianMonths = new RegExp('^' + integer + '\\s+(месяц|месяца|месяцев)$', 'u');
const englishYears = new RegExp('^' + integer + '\\s+(year|years)(?:(?:\\s+|\\s*,\\s*|\\s+and\\s+)' + integer + '\\s+(month|months))?$', 'u');
const englishMonths = new RegExp('^' + integer + '\\s+(month|months)$', 'u');

function russianForm(value: number, singular: string, paucal: string, plural: string): string {
  const ending = value % 100;
  if (ending >= 11 && ending <= 14) return plural;
  const last = value % 10;
  return last === 1 ? singular : last >= 2 && last <= 4 ? paucal : plural;
}

function boundedMonths(value: number): number | null {
  return Number.isSafeInteger(value) && value >= 0 && value <= 1200 ? value : null;
}

/** Only complete, unambiguous integer durations become searchable experience. */
export function deriveExperienceMonths(experience: string): number | null {
  const value = experience.trim().toLocaleLowerCase('ru-RU');
  if (/^(?:без опыта(?: работы)?|нет опыта|no (?:work )?experience)$/u.test(value)) return 0;

  const ruYears = russianYears.exec(value);
  if (ruYears) {
    const years = Number(ruYears[1]);
    const months = ruYears[3] === undefined ? 0 : Number(ruYears[3]);
    if (ruYears[2] !== russianForm(years, 'год', 'года', 'лет')
      || ruYears[3] !== undefined && ruYears[4] !== russianForm(months, 'месяц', 'месяца', 'месяцев')) return null;
    return boundedMonths(years * 12 + months);
  }
  const ruMonths = russianMonths.exec(value);
  if (ruMonths) {
    const months = Number(ruMonths[1]);
    return ruMonths[2] === russianForm(months, 'месяц', 'месяца', 'месяцев') ? boundedMonths(months) : null;
  }

  const enYears = englishYears.exec(value);
  if (enYears) {
    const years = Number(enYears[1]);
    const months = enYears[3] === undefined ? 0 : Number(enYears[3]);
    if (enYears[2] !== (years === 1 ? 'year' : 'years')
      || enYears[3] !== undefined && enYears[4] !== (months === 1 ? 'month' : 'months')) return null;
    return boundedMonths(years * 12 + months);
  }
  const enMonths = englishMonths.exec(value);
  if (enMonths) {
    const months = Number(enMonths[1]);
    return enMonths[2] === (months === 1 ? 'month' : 'months') ? boundedMonths(months) : null;
  }
  return null;
}

const languageAliases: Record<string, string[]> = {
  ru: ['русский', 'russian', 'ru'],
  en: ['английский', 'english', 'en'],
  de: ['немецкий', 'german', 'deutsch', 'de'],
  fr: ['французский', 'french', 'français', 'fr'],
  es: ['испанский', 'spanish', 'español', 'es'],
  zh: ['китайский', 'chinese', '中文', 'zh'],
};
const recognizedLanguages = new Set(languageOptions.map(option => option.value));
const codeByAlias = new Map(Object.entries(languageAliases).filter(([code]) => recognizedLanguages.has(code))
  .flatMap(([code, aliases]) => aliases.map(alias => [alias, code] as const)));
const languageNames = new RegExp('(?<![\\p{L}\\p{N}_])(' + [...codeByAlias.keys()].sort((a, b) => b.length - a.length)
  .join('|') + ')(?![\\p{L}\\p{N}_])', 'gu');

/** Recognizes explicitly named languages; proficiency stays in the original field. */
export function deriveLanguageCodes(languages: string): string[] {
  const codes = new Set<string>();
  for (const match of languages.toLocaleLowerCase('ru-RU').matchAll(languageNames)) {
    const code = codeByAlias.get(match[1]);
    if (code) codes.add(code);
  }
  return [...codes];
}
