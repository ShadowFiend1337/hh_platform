import { BadgeCheck, LockKeyhole, MapPin, Medal, Printer } from 'lucide-react';
import { dateLabel, gradeLabels, initials, specializationLabels, type Candidate } from '../model';

import { CandidateEvidence } from './EvidenceList';

export function CandidateDetails({ person, contacts, onInvite, contactNote = 'Откроются после принятия приглашения' }: {
  person: Candidate; contacts: boolean; onInvite?: () => void; contactNote?: string;
}) {
  const sectionText = (value?: string) => person.synthetic ? (value || '').split(/\r?\n/u)
    .filter(line => !/^(?:Вымышленный демонстрационный профиль\.|Демонстрационный профиль:|Демонстрационные данные:|Результат демонстрационного проекта:)/u.test(line.trimStart()))
    .join('\n').replace(/^Вымышленный проект /u, 'Проект ') : value;
  const workHistory = sectionText(person.workHistory);
  const careerAchievements = sectionText(person.careerAchievements);
  const education = sectionText(person.education);
  const achievements = person.achievements.filter(achievement => !person.synthetic
    || !/демонстрац|вымышлен/iu.test(achievement.title + ' ' + achievement.result));
  return <div className="candidate-details">
    <div className="detail-person">
      <div className="avatar avatar-large">{initials(person.name)}</div>
      <div><h3>{person.name}</h3><p>{specializationLabels[person.confirmed?.specialization || person.specialization]}</p>
      {(person.industry || person.professionalRole) && <p className="muted">{[person.industry, person.professionalRole].filter(Boolean).join(' · ')}</p>}
      <span className="metadata">{person.city && <><MapPin size={14} />{person.city} · </>}{person.format}</span></div>
    </div>
    <div className="detail-grid">
      <div><span className="field-caption">Опыт</span><strong>{person.experience}</strong></div>
      <div><span className="field-caption">Тестирование</span><strong>{person.confirmed ? person.confirmed.score + ' из 100' : 'Не пройдено'}</strong></div>
      <div><span className="field-caption">Грейд</span><strong className="inline-icon">{person.confirmed && <BadgeCheck size={16} />}{person.confirmed ? gradeLabels[person.confirmed.grade] : 'Не подтверждён'}</strong>{person.confirmed && <time className="confirmed-date" dateTime={person.confirmed.date}>{dateLabel(person.confirmed.date)}</time>}</div>
    </div>
    <section><h4>О себе</h4><p className="body-copy">{person.bio || 'Пока не заполнено'}</p></section>
    <section><h4>Стек</h4><div className="tags">{person.stack.map(skill => <span className="tag" key={skill}>{skill}</span>)}</div></section>
    {workHistory && <section><h4>Места работы и проекты</h4><p className="body-copy resume-copy">{workHistory}</p></section>}
    {careerAchievements && <section><h4>Достижения</h4><p className="body-copy resume-copy">{careerAchievements}</p></section>}
    {education && <section><h4>Образование</h4><p className="body-copy resume-copy">{education}</p></section>}
    {person.languages && <section><h4>Языки</h4><p className="body-copy resume-copy">{person.languages}</p></section>}
    {(person.synthetic || achievements.length > 0) && <section><h4 className="inline-icon"><Medal size={17} />Достижения ФСП</h4>
      {achievements.length ? achievements.map((achievement, index) => <div key={index} className="achievement"><strong>{achievement.title}</strong><span>{achievement.result} · {achievement.year}</span></div>)
        : <p className="muted">Истории ФСП пока нет</p>}
    </section>}
    {!person.synthetic && <CandidateEvidence candidateId={person.id} />}
    <section className="contact-section"><h4>Контакты</h4>
      {contacts ? <div className="contact-data"><a href={'mailto:' + person.email}>{person.email}</a>{person.phone && <a href={'tel:' + person.phone}>{person.phone}</a>}</div>
        : <div className="privacy-note"><LockKeyhole size={17} />{contactNote}</div>}
      {contacts && person.portfolio && <p className="body-copy resume-copy">{person.portfolio}</p>}
    </section>
    <div className="dialog-actions no-print">
      <button className="button secondary" onClick={() => window.print()}><Printer size={16} />PDF-профиль</button>
      {onInvite && <button className="button primary" onClick={onInvite}>Пригласить</button>}
    </div>
  </div>;
}
