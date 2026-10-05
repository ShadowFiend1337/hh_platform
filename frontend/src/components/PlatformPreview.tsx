import { BadgeCheck, Check, LockKeyhole, Search } from 'lucide-react';
import { initials, otherCandidates, type Role } from '../model';

export function PlatformPreview({ variant, compact = false, onStart }: {
  variant: number; compact?: boolean; onStart?: (role: Role) => void;
}) {
  const people = otherCandidates.filter(person => person.confirmed?.specialization === 'Frontend' && person.confirmed.grade === 'Middle').slice(0, 3);
  return <div className={'platform-preview preview-' + variant + (compact ? ' preview-compact' : '')}>
    {variant === 0 ? <>
      <h3>Кандидаты</h3>
      <div className="preview-search"><Search /><span>Frontend · React · Middle</span></div>
      <div className="preview-people">{people.map(person => <div className="preview-person" key={person.id}>
        <span className="preview-avatar">{initials(person.name)}</span>
        <div><strong>{person.name}</strong><span>{person.confirmed?.specialization} · {person.confirmed?.grade}</span></div>
        <BadgeCheck />
      </div>)}</div>
    </> : variant === 1 ? <>
      <div className="preview-profile"><span className="preview-avatar">АМ</span><h3>Анна Морозова</h3><p>Frontend-разработчик</p></div>
      <div className="preview-category"><BadgeCheck /><div><span>Подтверждённый грейд</span><strong>Middle</strong></div><b>86<small>/100</small></b></div>
      <div className="preview-skills"><span>React</span><span>TypeScript</span><span>CSS</span></div>
    </> : <>
      <span className="preview-company">Линия</span><h3>Frontend-разработчик</h3><p className="preview-salary">180 000 – 240 000 ₽</p>
      <div className="preview-offer-lines"><span><Check />Удалённая работа</span><span><Check />React и TypeScript</span><span><LockKeyhole />Контакты по согласию</span></div>
      <span className="preview-accept">Принять приглашение</span>
    </>}
    {!compact && <button className="preview-open" onClick={() => onStart?.(variant === 0 ? 'employer' : 'candidate')}>Открыть кабинет</button>}
  </div>;
}
