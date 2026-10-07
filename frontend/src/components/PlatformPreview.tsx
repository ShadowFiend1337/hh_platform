import { BadgeCheck, Check, LockKeyhole, Search } from 'lucide-react';
import type { Role } from '../model';

export function PlatformPreview({ variant, compact = false, onStart }: {
  variant: number; compact?: boolean; onStart?: (role: Role) => void;
}) {
  const examples = ['React · TypeScript', 'Дизайн-системы', 'Доступность интерфейсов'];
  return <div className={'platform-preview preview-' + variant + (compact ? ' preview-compact' : '')}>
    {variant === 0 ? <>
      <h3>Пример подбора</h3>
      <div className="preview-search"><Search /><span>Frontend · React · Middle</span></div>
      <div className="preview-people">{examples.map((example, index) => <div className="preview-person" key={example}>
        <span className="preview-avatar">0{index + 1}</span>
        <div><strong>{example}</strong><span>Frontend · Middle</span></div>
        <BadgeCheck />
      </div>)}</div>
    </> : variant === 1 ? <>
      <div className="preview-profile"><span className="preview-avatar">01</span><h3>Пример профиля</h3><p>Frontend-разработчик</p></div>
      <div className="preview-category"><BadgeCheck /><div><span>Подтверждённый грейд</span><strong>Middle</strong></div><b>86<small>/100</small></b></div>
      <div className="preview-skills"><span>React</span><span>TypeScript</span><span>CSS</span></div>
    </> : <>
      <span className="preview-company">Пример приглашения</span><h3>Frontend-разработчик</h3><p className="preview-salary">180 000 – 240 000 ₽</p>
      <div className="preview-offer-lines"><span><Check />Удалённая работа</span><span><Check />React и TypeScript</span><span><LockKeyhole />Контакты по согласию</span></div>
      <span className="preview-accept">Принять приглашение</span>
    </>}
    {!compact && <button className="preview-open" onClick={() => onStart?.(variant === 0 ? 'employer' : 'candidate')}>Открыть кабинет</button>}
  </div>;
}
