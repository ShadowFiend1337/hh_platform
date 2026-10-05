import { BadgeCheck, LockKeyhole, MapPin, Medal, Printer } from 'lucide-react';
import { dateLabel, initials, specializationLabels, type Candidate } from '../model';

export function CandidateDetails({ person, contacts, onInvite }: {
  person: Candidate; contacts: boolean; onInvite?: () => void;
}) {
  return <div className="candidate-details">
    <div className="detail-person">
      <div className="avatar avatar-large">{initials(person.name)}</div>
      <div><h3>{person.name}</h3><p>{specializationLabels[person.confirmed?.specialization || person.specialization]}</p>
      <span className="metadata"><MapPin size={14} />{person.city} · {person.format}</span></div>
    </div>
    <div className="detail-grid">
      <div><span className="field-caption">Опыт</span><strong>{person.experience}</strong></div>
      <div><span className="field-caption">Тестирование</span><strong>{person.confirmed ? person.confirmed.score + ' из 100' : 'Не пройдено'}</strong></div>
      <div><span className="field-caption">Грейд</span><strong className="inline-icon">{person.confirmed && <BadgeCheck size={16} />}{person.confirmed?.grade || 'Не подтверждён'}</strong>{person.confirmed && <time className="confirmed-date" dateTime={person.confirmed.date}>{dateLabel(person.confirmed.date)}</time>}</div>
    </div>
    <section><h4>О себе</h4><p className="body-copy">{person.bio || 'Пока не заполнено'}</p></section>
    <section><h4>Стек</h4><div className="tags">{person.stack.map(skill => <span className="tag" key={skill}>{skill}</span>)}</div></section>
    <section><h4 className="inline-icon"><Medal size={17} />Достижения ФСП</h4>
      {person.achievements.length ? person.achievements.map((achievement, index) => <div key={index} className="achievement"><strong>{achievement.title}</strong><span>{achievement.result} · {achievement.year}</span></div>)
        : <p className="muted">Истории ФСП пока нет</p>}
    </section>
    <section className="contact-section"><h4>Контакты</h4>
      {contacts ? <div className="contact-data"><a href={'mailto:' + person.email}>{person.email}</a>{person.phone && <a href={'tel:' + person.phone}>{person.phone}</a>}</div>
        : <div className="privacy-note"><LockKeyhole size={17} />Откроются после принятия приглашения</div>}
    </section>
    <div className="dialog-actions no-print">
      <button className="button secondary" onClick={() => window.print()}><Printer size={16} />PDF-профиль</button>
      {onInvite && <button className="button primary" onClick={onInvite}>Пригласить</button>}
    </div>
  </div>;
}
