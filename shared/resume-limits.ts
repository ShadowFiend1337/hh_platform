/** Keep resume import, forms and saved profiles within the same field limits. */
export const resumeTextLimits = {
  name: 100, email: 254, phone: 30, city: 100, industry: 100, professionalRole: 100,
  specialization: 20, desiredGrade: 20, stack: 4000, experience: 100,
  careerAchievements: 4000, education: 4000, workHistory: 20000,
  portfolio: 1000, languages: 500, format: 50,
} as const;

export const MAX_STACK_SKILLS = 100;
export const MAX_SOFT_SKILLS = 30;

/** Field and projection budgets used by the importer, form and saved-profile normalization. */
export const resumeSectionLimits = {
  workPeriod: 100, workCompany: 200, workTasks: 4000, workHistory: 20_000,
  projectName: 200, projectDescription: 4000, projectSkill: 80, petProjects: 20_000,
  achievementItems: 4000, interests: 4000,
} as const;
