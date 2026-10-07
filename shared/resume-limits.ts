/** Keep resume import, forms and saved profiles within the same field limits. */
export const resumeTextLimits = {
  name: 100, email: 254, phone: 30, city: 100, industry: 100, professionalRole: 100,
  specialization: 20, desiredGrade: 20, stack: 4000, experience: 100,
  careerAchievements: 4000, education: 4000, workHistory: 20000,
  portfolio: 1000, languages: 500, format: 50,
} as const;

export const MAX_STACK_SKILLS = 100;
export const MAX_SOFT_SKILLS = 10;
