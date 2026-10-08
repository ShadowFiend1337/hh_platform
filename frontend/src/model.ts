import { industryOptions, isSpecialization, softSkillOptions, type Specialization } from '../../shared/catalog.ts';
import { resumeTextLimits } from '../../shared/resume-limits.ts';
import type { Grade } from '../../shared/grading.ts';
import { defaultSearchFilters, type SearchFilters } from '../../shared/search.ts';
import { normalizeHiringNeeds, type HiringNeed } from '../../shared/hiring-needs.ts';
export type { HiringNeed } from '../../shared/hiring-needs.ts';
export { gradeOptions, gradeLabels, isGrade } from '../../shared/grading.ts';
export type { Grade } from '../../shared/grading.ts';
export { defaultStackOptions, industryOptions, isSpecialization, professionalRoleOptions, softSkillOptions, specializationLabels, specializationNames, specializationOptions, specializationStacks } from '../../shared/catalog.ts';
export { stackOptions } from '../../shared/catalog.ts';
export type { Specialization } from '../../shared/catalog.ts';
export type Role = 'employer' | 'candidate';
export type InvitationStatus = 'sent' | 'viewed' | 'accepted' | 'rejected';
export type Page = 'candidates' | 'invitations' | 'company' | 'profile' | 'assessment' | 'onboarding';

export interface TestResult {
  id: string;
  date: string;
  specialization: Specialization;
  grade: Grade;
  score: number;
  passed: boolean;
  surveyId: string | null;
  bankVersion?: string;
  competencies?: { topic: string; score: number; correct: number; total: number }[];
  vacancySkills?: string[];
}

export interface CandidateSurvey {
  id: string;
  date: string;
  industry: string;
  professionalRole: string;
  specialization: Specialization;
  desiredGrade: Grade;
  stack: string[];
  experience: string;
  softSkills: string[];
  careerAchievements?: string;
  education?: string;
  workHistory?: string;
  portfolio?: string;
  languages?: string;
  format?: string;
}

export interface Candidate {
  id: string;
  name: string;
  specialization: Specialization;
  desiredGrade: Grade;
  confirmed: { specialization: Specialization; grade: Grade; score: number; date: string; surveyId?: string } | null;
  gradeChangedAt?: string;
  stack: string[];
  industry: string;
  professionalRole: string;
  softSkills: string[];
  surveyCompletedAt: string | null;
  experience: string;
  city: string;
  format: string;
  bio: string;
  careerAchievements?: string;
  education?: string;
  workHistory?: string;
  portfolio?: string;
  languages?: string;
  email: string;
  phone: string;
  fspId: string;
  achievements: { title: string; result: string; year: string }[];
  fspEvidence?: { provider: 'fsp-demo'; mode: 'demo'; identityVerified: false; lastSyncedAt: string; activeCount: number; revokedCount: number } | null;
  visible: boolean;
  consent: boolean;
  salaryFrom?: number | null;
  salaryTo?: number | null;
  experienceMonths?: number | null;
  employmentType?: string;
  availableFrom?: string;
  languageCodes?: string[];
  synthetic?: boolean;
  /** Server-marked built-in catalog sample; it has no account or contact workflow. */
  demoProfile?: boolean;
}

export interface Invitation {
  id: string;
  candidateId: string;
  companyId: string;
  company: string;
  title: string;
  description: string;
  contact: string;
  salaryFrom: number;
  salaryTo: number;
  status: InvitationStatus;
  date: string;
}

export type Filters = SearchFilters;

export interface CandidateDecision {
  candidateId: string;
  decision: 'liked' | 'passed';
  date: string;
}

export interface PlatformState {
  version: 2;
  profile: Candidate;
  company: { id: string; name: string; industry: string; website: string; contact: string; description: string };
  invitations: Invitation[];
  history: TestResult[];
  surveys: CandidateSurvey[];
  savedSearches: { id: string; title: string; query: string; filters: Filters }[];
  hiringNeeds?: HiringNeed[];
  candidateDecisions?: CandidateDecision[];
}

export const emptyFilters: Filters = defaultSearchFilters;
export const statusLabels: Record<InvitationStatus, string> = {
  sent: 'Отправлено', viewed: 'Просмотрено', accepted: 'Принято', rejected: 'Отклонено',
};
export const ownCandidateId = 'candidate-anna';
export const storageKey = 'predel:platform:v2';

function oldTestDate() {
  const date = new Date();
  date.setDate(date.getDate() - 100);
  return date.toISOString();
}

function candidate(
  id: string, name: string, specialization: Specialization, grade: Grade,
  score: number, stack: string[], city: string, experience: string, fsp: boolean,
): Candidate {
  return {
    id, name, specialization, desiredGrade: grade,
    confirmed: { specialization, grade, score, date: oldTestDate() }, gradeChangedAt: oldTestDate(),
    stack, city, experience, format: 'Удалённо',
    industry: 'ИТ', professionalRole: 'Разработчик', softSkills: ['Коммуникация', 'Работа в команде'], surveyCompletedAt: oldTestDate(),
    bio: specialization === 'Frontend'
      ? 'Разрабатываю интерфейсы веб-приложений. Работаю с дизайн-системами, доступностью и производительностью.'
      : 'Разрабатываю API и сервисы. Работаю с базами данных, интеграциями и автоматизацией.',
    email: id.replace('candidate-', '') + '@example.com', phone: '',
    fspId: fsp ? 'DEMO-' + id.slice(-4).toUpperCase() : '',
    achievements: fsp ? [{ title: 'Командное программирование', result: 'Финалист соревнования', year: '2025' }] : [],
    visible: true, consent: true,
  };
}

export const otherCandidates: Candidate[] = [
  candidate('candidate-mikhail', 'Михаил Соколов', 'Frontend', 'Middle', 91, ['React', 'TypeScript', 'JavaScript', 'CSS'], 'Москва', '4 года', true),
  candidate('candidate-daria', 'Дарья Волкова', 'Frontend', 'Middle', 89, ['React', 'TypeScript', 'CSS'], 'Санкт-Петербург', '3 года', false),
  candidate('candidate-artem', 'Артём Лебедев', 'Backend', 'Middle', 94, ['Python', 'FastAPI', 'PostgreSQL', 'Docker'], 'Казань', '5 лет', true),
  candidate('candidate-sofia', 'София Белова', 'Frontend', 'Junior', 82, ['React', 'JavaScript', 'CSS'], 'Москва', '1 год', false),
  candidate('candidate-nikita', 'Никита Орлов', 'Backend', 'Middle', 88, ['Node.js', 'TypeScript', 'PostgreSQL', 'Docker'], 'Екатеринбург', '3 года', false),
  candidate('candidate-egor', 'Егор Крылов', 'Backend', 'Junior', 85, ['Python', 'FastAPI', 'PostgreSQL'], 'Новосибирск', '1 год', false),
];

export function createInitialState(): PlatformState {
  const profile: Candidate = {
    id: ownCandidateId, name: '', email: '', phone: '', bio: '', city: '', format: 'Удалённо',
    careerAchievements: '', education: '', workHistory: '', portfolio: '', languages: '',
    industry: '', professionalRole: '', softSkills: [], surveyCompletedAt: null,
    specialization: 'Frontend', desiredGrade: 'Junior', confirmed: null,
    stack: [], experience: '', fspId: '', achievements: [], visible: false, consent: false,
  };
  return {
    version: 2, profile,
    company: { id: 'company-line', name: 'Линия', industry: 'Продуктовая разработка', website: 'https://example.com', contact: 'team@example.com', description: 'Разрабатываем цифровые продукты для бизнеса.' },
    invitations: [], history: [], surveys: [],
    savedSearches: [],
    hiringNeeds: [],
    candidateDecisions: [],
  };
}

export function readState(): PlatformState {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? localStorage.getItem('predel:platform:v1') ?? 'null');
    if ((stored?.version === 1 || stored?.version === 2) && stored.profile?.id === ownCandidateId
      && Array.isArray(stored.profile.stack) && Array.isArray(stored.profile.achievements)
      && stored.company?.id && Array.isArray(stored.invitations)
      && Array.isArray(stored.history) && Array.isArray(stored.savedSearches)) {
      const legacy = stored.version === 1;
      const history = stored.history.filter((item: TestResult) => item.id !== 'test-initial')
        .map((item: TestResult) => ({ ...item, surveyId: item.surveyId || null }));
      const confirmedWasSeed = legacy && stored.profile.confirmed
        && stored.history.some((item: TestResult) => item.id === 'test-initial' && item.date === stored.profile.confirmed.date);
      const profile: Candidate = {
        ...stored.profile,
        careerAchievements: typeof stored.profile.careerAchievements === 'string' ? stored.profile.careerAchievements.slice(0, resumeTextLimits.careerAchievements) : '',
        education: typeof stored.profile.education === 'string' ? stored.profile.education.slice(0, resumeTextLimits.education) : '',
        workHistory: typeof stored.profile.workHistory === 'string' ? stored.profile.workHistory.slice(0, resumeTextLimits.workHistory) : '',
        portfolio: typeof stored.profile.portfolio === 'string' ? stored.profile.portfolio.slice(0, 1000) : '',
        languages: typeof stored.profile.languages === 'string' ? stored.profile.languages.slice(0, 500) : '',
        industry: typeof stored.profile.industry === 'string' ? stored.profile.industry : '',
        professionalRole: typeof stored.profile.professionalRole === 'string' ? stored.profile.professionalRole : '',
        softSkills: Array.isArray(stored.profile.softSkills) ? stored.profile.softSkills.filter((skill: string) => softSkillOptions.includes(skill)) : [],
        surveyCompletedAt: legacy ? null : stored.profile.surveyCompletedAt || null,
        confirmed: confirmedWasSeed ? null : stored.profile.confirmed,
        gradeChangedAt: confirmedWasSeed ? undefined : stored.profile.gradeChangedAt,
        consent: confirmedWasSeed ? false : stored.profile.consent,
        visible: confirmedWasSeed ? false : stored.profile.visible,
      };
      const state: PlatformState = {
        ...stored, version: 2, profile, history,
        invitations: legacy ? stored.invitations.filter((item: Invitation) => item.id !== 'invitation-initial') : stored.invitations,
        surveys: !legacy && Array.isArray(stored.surveys) ? stored.surveys : [],
        hiringNeeds: normalizeHiringNeeds(stored.hiringNeeds),
        candidateDecisions: Array.isArray(stored.candidateDecisions) ? stored.candidateDecisions.filter((item: CandidateDecision) =>
          item && typeof item.candidateId === 'string' && item.candidateId.length > 0 && item.candidateId.length <= 100
          && ['liked', 'passed'].includes(item.decision) && typeof item.date === 'string' && Number.isFinite(Date.parse(item.date))).slice(0, 2000) : [],
      };
      if (!currentSurvey(state)) state.profile.surveyCompletedAt = null;
      return state;
    }
  } catch { /* Storage can be disabled or contain an older draft. */ }
  return createInitialState();
}

// Every attempt uses the saved questionnaire, including its self-reported skills.
export function currentSurvey(state: PlatformState): CandidateSurvey | undefined {
  const profile = state.profile;
  if (!profile.surveyCompletedAt || !profile.name.trim() || !profile.email.trim()
    || !industryOptions.includes(profile.industry) || !isSpecialization(profile.specialization) || !profile.professionalRole.trim()
    || !profile.stack.length || !profile.experience.trim()) return undefined;
  const same = (a: string[], b: string[]) => a.length === b.length && a.every(value => b.includes(value));
  return state.surveys.find(survey => survey.date === profile.surveyCompletedAt
    && survey.industry === profile.industry && survey.professionalRole === profile.professionalRole
    && survey.specialization === profile.specialization && survey.desiredGrade === profile.desiredGrade
    && survey.experience === profile.experience && same(survey.stack, profile.stack) && same(survey.softSkills, profile.softSkills));
}

export function categoryChangeUnlock(profile: Candidate, specialization: Specialization, grade: Grade): number {
  const category = profile.confirmed;
  if (!category || (category.specialization === specialization && category.grade === grade)) return 0;
  const date = new Date(profile.gradeChangedAt || category.date);
  date.setDate(date.getDate() + 90);
  return date.getTime();
}

export function saveState(state: PlatformState): boolean {
  try { localStorage.setItem(storageKey, JSON.stringify(state)); return true; }
  catch { return false; }
}

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('');
}

export function money(value: number) {
  return new Intl.NumberFormat('ru-RU').format(value);
}

export function dateLabel(value: string) {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
}

export function hasContactAccess(state: PlatformState, candidateId: string) {
  return state.invitations.some(invitation => invitation.candidateId === candidateId
    && invitation.companyId === state.company.id && invitation.status === 'accepted');
}
