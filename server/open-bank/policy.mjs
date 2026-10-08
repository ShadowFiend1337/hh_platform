// Private authoring policy. Practical cases are not synonymous with code.
export const extraPracticalGroup = Object.freeze({
  Frontend: 'B', Backend: 'B', Fullstack: 'C', Mobile: 'C', ML: 'C',
  DataAnalysis: 'A', DataEngineering: 'C', DevOps: 'D', QA: 'B', Security: 'C',
  UXUI: 'D', BusinessAnalysis: 'D', ProductManagement: 'C', Embedded: 'C',
});

// Existing text cases require a concrete design, recovery or verification plan.
// This classification is an authoring decision, not a difficulty calibration.
const practicalTextFamilies = new Set([
  'open-frontend-form-state-machine', 'open-backend-transfer-ledger',
  'open-mobile-network-timeout', 'open-devops-burn-budget', 'open-devops-restore-drill',
  'open-security-ssrf-redirect', 'open-security-private-cache',
  'open-uxui-task-wording', 'open-uxui-leading-interview',
  'open-uxui-navigation-test', 'open-uxui-card-sort',
  'open-uxui-component-states', 'open-uxui-modal-focus',
  'open-uxui-contrast-check', 'open-uxui-reflow-zoom',
  'open-uxui-error-association', 'open-uxui-keyboard-trap',
]);

export function isPracticalFamily(family) {
  return family.practical === true || family.answerFormat === 'code' || practicalTextFamilies.has(family.id);
}

export function practicalQuota(specialization, group, perGroup = 5) {
  return Math.min(perGroup, extraPracticalGroup[specialization] === group ? 2 : 1);
}
