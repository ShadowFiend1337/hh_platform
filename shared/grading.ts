/** Public grade names; question content and answer keys stay on the server. */
export const gradeOptions = [
  { value: 'Intern', label: 'Стажёр' },
  { value: 'Junior', label: 'Junior' },
  { value: 'Middle', label: 'Middle' },
  { value: 'Senior', label: 'Senior' },
  { value: 'Lead', label: 'Lead' },
] as const;

export type Grade = typeof gradeOptions[number]['value'];
export const gradeLabels = Object.fromEntries(gradeOptions.map(item => [item.value, item.label])) as Record<Grade, string>;
export function isGrade(value: string): value is Grade {
  return gradeOptions.some(item => item.value === value);
}

const aliases: Array<[Grade, RegExp]> = [
  ['Intern', /(?<![\p{L}\p{N}])(?:intern|trainee|стаж[её]р(?:ка)?|стажировка)(?![\p{L}\p{N}])/iu],
  ['Junior', /(?<![\p{L}\p{N}])(?:junior|джуниор|джун)(?![\p{L}\p{N}])/iu],
  ['Middle', /(?<![\p{L}\p{N}])(?:middle|мидл|миддл)(?![\p{L}\p{N}])/iu],
  ['Senior', /(?<![\p{L}\p{N}])(?:senior|сеньор|синьор)(?![\p{L}\p{N}])/iu],
  ['Lead', /(?<![\p{L}\p{N}])(?:lead|team[ -]?lead|tech[ -]?lead|тимлид|техлид|лид)(?![\p{L}\p{N}])/iu],
];

export function detectGrade(text: string): Grade | undefined {
  const matches = aliases.filter(([, expression]) => expression.test(text));
  return matches.length === 1 ? matches[0][0] : undefined;
}
