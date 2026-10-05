export type Role = 'employer' | 'candidate';
export type Specialization = 'Frontend' | 'Backend';
export type Grade = 'Junior' | 'Middle';
export type InvitationStatus = 'sent' | 'viewed' | 'accepted' | 'rejected';
export type Page = 'candidates' | 'invitations' | 'company' | 'profile' | 'assessment';

export interface TestResult {
  id: string;
  date: string;
  specialization: Specialization;
  grade: Grade;
  score: number;
  passed: boolean;
}

export interface Candidate {
  id: string;
  name: string;
  specialization: Specialization;
  desiredGrade: Grade;
  confirmed: { specialization: Specialization; grade: Grade; score: number; date: string } | null;
  gradeChangedAt?: string;
  stack: string[];
  experience: string;
  city: string;
  format: string;
  bio: string;
  email: string;
  phone: string;
  fspId: string;
  achievements: { title: string; result: string; year: string }[];
  visible: boolean;
  consent: boolean;
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

export interface Filters {
  specialization: string;
  grade: string;
  format: string;
  stack: string[];
  fsp: boolean;
}

export interface PlatformState {
  version: 1;
  profile: Candidate;
  company: { id: string; name: string; industry: string; website: string; contact: string; description: string };
  invitations: Invitation[];
  history: TestResult[];
  savedSearches: { id: string; title: string; query: string; filters: Filters }[];
}

export const emptyFilters: Filters = { specialization: '', grade: '', format: '', stack: [], fsp: false };
export const statusLabels: Record<InvitationStatus, string> = {
  sent: 'Отправлено', viewed: 'Просмотрено', accepted: 'Принято', rejected: 'Отклонено',
};
export const specializationLabels: Record<Specialization, string> = {
  Frontend: 'Frontend-разработчик', Backend: 'Backend-разработчик',
};
export const stackOptions = ['React', 'TypeScript', 'JavaScript', 'CSS', 'Python', 'FastAPI', 'Node.js', 'PostgreSQL', 'Docker'];
export const ownCandidateId = 'candidate-anna';
const storageKey = 'predel:platform:v1';

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
  const profile = candidate(ownCandidateId, 'Анна Морозова', 'Frontend', 'Middle', 86, ['React', 'TypeScript', 'CSS'], 'Москва', '3 года', false);
  return {
    version: 1, profile,
    company: { id: 'company-line', name: 'Линия', industry: 'Продуктовая разработка', website: 'https://example.com', contact: 'team@example.com', description: 'Разрабатываем цифровые продукты для бизнеса.' },
    invitations: [{
      id: 'invitation-initial', candidateId: ownCandidateId, companyId: 'company-line', company: 'Линия',
      title: 'Frontend-разработчик', description: 'Развитие интерфейса продукта на React и TypeScript. Небольшая команда, удалённая работа, участие в проектировании.',
      contact: 'team@example.com', salaryFrom: 180000, salaryTo: 240000,
      status: 'sent', date: new Date().toISOString(),
    }],
    history: [{ id: 'test-initial', date: profile.confirmed!.date, specialization: 'Frontend', grade: 'Middle', score: 86, passed: true }],
    savedSearches: [],
  };
}

export function readState(): PlatformState {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (stored?.version === 1 && stored.profile?.id === ownCandidateId
      && Array.isArray(stored.profile.stack) && Array.isArray(stored.profile.achievements)
      && stored.company?.id && Array.isArray(stored.invitations)
      && Array.isArray(stored.history) && Array.isArray(stored.savedSearches)) return stored;
  } catch { /* Storage can be disabled or contain an older draft. */ }
  return createInitialState();
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

// Filter the confirmed category before ranking; the FSP bonus cannot override it.
export function searchCandidates(candidates: Candidate[], filters: Filters, query: string) {
  const normalized = query.toLowerCase().trim();
  const requestedStack = stackOptions.filter(skill => normalized.includes(skill.toLowerCase()));
  const requestedSpecialization = /frontend|фронтенд|фронтэнд|интерфейс/.test(normalized) ? 'Frontend'
    : /backend|бэкенд|бекенд|api/.test(normalized) ? 'Backend' : '';
  const requestedGrade = /junior|джуниор/.test(normalized) ? 'Junior' : /middle|мидл/.test(normalized) ? 'Middle' : '';
  const recognized = requestedStack.length > 0 || requestedSpecialization || requestedGrade;
  const requiredStack = [...new Set([...filters.stack, ...requestedStack])];
  return candidates.filter(person => {
    if (!person.visible || !person.consent || !person.confirmed) return false;
    const category = person.confirmed;
    if ((filters.specialization && category.specialization !== filters.specialization)
      || (requestedSpecialization && category.specialization !== requestedSpecialization)
      || (filters.grade && category.grade !== filters.grade)
      || (requestedGrade && category.grade !== requestedGrade)
      || (filters.format && person.format !== filters.format)
      || (filters.fsp && !person.achievements.length)) return false;
    if (!requiredStack.every(skill => person.stack.includes(skill))) return false;
    if (normalized && !recognized) {
      const words = normalized.split(/\s+/).filter(word => word.length > 1);
      const text = [person.name, person.city, person.bio, ...person.stack, category.specialization].join(' ').toLowerCase();
      if (!words.every(word => text.includes(word))) return false;
    }
    return true;
  }).map(person => ({
    person,
    rank: person.confirmed!.score + Math.min(person.achievements.length * 3, 6),
    reason: requiredStack.length ? 'Совпадает стек: ' + requiredStack.join(', ')
      : 'Подтверждённый ' + person.confirmed!.grade + (person.achievements.length ? ' · достижения ФСП' : ' · результат теста'),
  })).sort((a, b) => b.rank - a.rank || a.person.name.localeCompare(b.person.name, 'ru'));
}
