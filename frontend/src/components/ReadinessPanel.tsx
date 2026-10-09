import { Check, ChevronRight } from 'lucide-react';
import { profileReadiness, type ReadinessAction } from '../../../shared/readiness.ts';
import { currentSurvey, type PlatformState } from '../model';

const actionLabels: Record<ReadinessAction, string> = { onboarding: 'К анкете', assessment: 'К тесту', profile: 'Заполнить' };
const levelText = {
  high: 'Профиль готов к приглашениям.',
  medium: 'Ещё немного — и работодатель увидит полную картину.',
  low: 'Заполните ключевые пункты, чтобы попасть в подборки.',
} as const;

export function readinessFor(state: PlatformState) {
  const profile = state.profile;
  return profileReadiness({
    surveyComplete: Boolean(currentSurvey(state)), confirmed: Boolean(profile.confirmed), stack: profile.stack,
    bio: profile.bio, workHistory: profile.workHistory, email: profile.email, phone: profile.phone,
    consent: profile.consent, visible: profile.visible, fspLinked: Boolean(profile.fspId || profile.achievements.length),
    salaryFrom: profile.salaryFrom, salaryTo: profile.salaryTo, employmentType: profile.employmentType,
  });
}

export function ReadinessRing({ percent, size = 76 }: { percent: number; size?: number }) {
  const radius = size / 2 - 6;
  const length = 2 * Math.PI * radius;
  return <svg className="readiness-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
    <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#eef0f4" strokeWidth="7" />
    <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--accent)" strokeWidth="7" strokeLinecap="round"
      strokeDasharray={`${length * percent / 100} ${length}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fontSize={size / 4.4} fontWeight="700" fill="#202126">{percent}%</text>
  </svg>;
}

/** What is left before employers see a complete, confirmed profile. */
export function ReadinessPanel({ state, onAction }: { state: PlatformState; onAction: (action: ReadinessAction, key: string) => void }) {
  const readiness = readinessFor(state);
  return <section className="panel readiness-panel" aria-label={'Готовность профиля ' + readiness.percent + '%'}>
    <div className="readiness-head">
      <ReadinessRing percent={readiness.percent} />
      <div><span className="field-caption">Готовность профиля</span><p className="readiness-level">{levelText[readiness.level]}</p></div>
    </div>
    <ul className="readiness-list">{readiness.items.map(item => <li key={item.key} className={item.done ? 'done' : ''}>
      <span className="readiness-mark" aria-hidden="true">{item.done && <Check size={12} />}</span>
      <span className="readiness-label" title={item.hint}>{item.label}<span className="sr-only">{item.done ? ' — выполнено' : ' — не выполнено'}</span></span>
      {!item.done && <button className="text-button readiness-action" onClick={() => onAction(item.action, item.key)}>{actionLabels[item.action]}<ChevronRight size={13} /></button>}
    </li>)}</ul>
  </section>;
}
