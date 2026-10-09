/**
 * Candidate profile readiness: how ready the profile is to be found and invited.
 * Weights favour what employers actually filter on: the confirmed category
 * (server test) first, then publication, questionnaire and verifiable evidence.
 */
export type ReadinessAction = 'onboarding' | 'assessment' | 'profile';

export interface ReadinessItem {
  key: string;
  label: string;
  hint: string;
  weight: number;
  done: boolean;
  action: ReadinessAction;
}

export interface ReadinessInput {
  surveyComplete: boolean;
  confirmed: boolean;
  stack: string[];
  bio?: string;
  workHistory?: string;
  email?: string;
  phone?: string;
  consent: boolean;
  visible: boolean;
  fspLinked: boolean;
  salaryFrom?: number | null;
  salaryTo?: number | null;
  employmentType?: string;
}

export function profileReadiness(input: ReadinessInput) {
  const story = `${input.bio || ''} ${input.workHistory || ''}`.trim();
  const items: ReadinessItem[] = [
    { key: 'survey', label: 'Анкета пройдена', hint: 'Специализация, роль, стек и предполагаемый грейд.', weight: 15, done: input.surveyComplete, action: 'onboarding' },
    { key: 'confirmed', label: 'Грейд подтверждён тестом', hint: 'Работодатель ищет по подтверждённым категориям.', weight: 30, done: input.confirmed, action: 'assessment' },
    { key: 'stack', label: 'Стек из 3+ технологий', hint: 'По стеку работодатели фильтруют подборку.', weight: 10, done: input.stack.length >= 3, action: 'profile' },
    { key: 'story', label: 'Опыт и задачи описаны', hint: 'Подбор по смыслу сравнивает задачи из профиля с потребностью.', weight: 10, done: story.length >= 80, action: 'profile' },
    { key: 'contacts', label: 'Email и телефон', hint: 'Откроются работодателю только после вашего согласия.', weight: 5, done: Boolean(input.email?.trim() && input.phone?.trim()), action: 'profile' },
    { key: 'published', label: 'Профиль виден работодателям', hint: 'Нужны согласие на обработку и публикация профиля.', weight: 15, done: input.consent && input.visible, action: 'profile' },
    { key: 'fsp', label: 'Привязан ФСП', hint: 'Достижения ФСП поднимают профиль внутри категории.', weight: 10, done: input.fspLinked, action: 'profile' },
    { key: 'terms', label: 'Условия работы', hint: 'Желаемая зарплата или занятость помогают точнее подобрать предложения.', weight: 5,
      done: input.salaryFrom != null || input.salaryTo != null || Boolean(input.employmentType), action: 'profile' },
  ];
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  const percent = Math.round(items.filter(item => item.done).reduce((sum, item) => sum + item.weight, 0) / total * 100);
  const next = items.find(item => !item.done) || null;
  return { percent, items, next, level: percent >= 85 ? 'high' : percent >= 50 ? 'medium' : 'low' } as const;
}
