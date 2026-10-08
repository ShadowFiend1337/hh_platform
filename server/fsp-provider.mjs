import { createHash } from 'node:crypto';
import { RequestError } from './assessment.mjs';

// Adapted from DemoFspProvider in origin/feature/API-integrations. These records
// are deliberately fictional: an authenticated platform session is not proof
// of a federation identity. A real provider must verify external ownership.
export const fspDemoScenarios = Object.freeze(['achievements', 'empty', 'revoked']);

export class DemoFspProvider {
  id = 'fsp-demo';
  mode = 'demo';
  identityVerified = false;

  identity(owner) {
    const subject = createHash('sha256').update(`fsp-demo\0${owner}`).digest('hex');
    return { subject, externalId: `DEMO-${subject.slice(0, 16).toUpperCase()}` };
  }

  load(owner, scenario = 'achievements') {
    if (!fspDemoScenarios.includes(scenario)) throw new RequestError(400, 'Неизвестный демонстрационный сценарий.');
    return { ...this.identity(owner), provider: this.id, mode: this.mode, identityVerified: false,
      evidence: scenario === 'empty' ? [] : [{ id: 'demo-contest-2026',
        title: 'Демонстрационное соревнование ФСП', result: 'Вымышленный финалист', year: '2026',
        discipline: 'algorithms', participation: 'individual',
        status: scenario === 'revoked' ? 'revoked' : 'active', source: 'demo', identityVerified: false }] };
  }
}
