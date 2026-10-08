import type { Specialization } from './model';

export type CodeLanguage = 'python' | 'javascript' | 'typescript' | 'sql' | 'text';
export interface CodeDraft { language: CodeLanguage; source: string }

export const codeLanguages: { value: CodeLanguage; label: string }[] = [
  { value: 'python', label: 'Python' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'sql', label: 'SQL' },
  { value: 'text', label: 'Псевдокод' },
];
export const maxCodeLength = 12_000;

export function defaultCodeLanguage(specialization: Specialization): CodeLanguage | null {
  switch (specialization) {
    case 'Frontend': case 'Fullstack': return 'typescript';
    case 'DataAnalysis': return 'sql';
    case 'Embedded': case 'Mobile': return 'text';
    case 'Backend': case 'ML': case 'DataEngineering': case 'DevOps': case 'QA': case 'Security': return 'python';
    default: return null;
  }
}

/** Drafts are local working notes, never graded answers or executable programs. */
export function readCodeDrafts(value: unknown, questionIds?: readonly string[]): Record<string, CodeDraft> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const allowed = questionIds ? new Set(questionIds) : null;
  return Object.fromEntries(Object.entries(value).slice(0, 50).flatMap(([id, draft]) => {
    if (!id || id.length > 128 || (allowed && !allowed.has(id))
      || !draft || typeof draft !== 'object' || Array.isArray(draft)) return [];
    const { language, source } = draft as Partial<CodeDraft>;
    if (!codeLanguages.some(item => item.value === language)
      || typeof source !== 'string' || source.length > maxCodeLength) return [];
    return [[id, { language: language as CodeLanguage, source }]];
  }));
}
