import { useState } from 'react';
import { BadgeCheck, Download, LockKeyhole, MapPin, Medal } from 'lucide-react';
import { dateLabel, gradeLabels, initials, specializationLabels, type Candidate } from '../model';

export function CandidateDetails({ person, contacts, onInvite, contactNote = 'Откроются после принятия приглашения' }: {
  person: Candidate; contacts: boolean; onInvite?: () => void; contactNote?: string;
}) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  async function downloadPdf() {
    if (exporting) return;
    setExporting(true); setExportError('');
    try {
      const [{ createProfilePdf }, response] = await Promise.all([import('../profile-pdf'), fetch('/assets/fonts/manrope.ttf')]);
      if (!response.ok) throw new Error('Не удалось загрузить шрифт для PDF. Повторите попытку.');
      const bytes = await createProfilePdf(person, contacts, new Uint8Array(await response.arrayBuffer()));
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }));
      const link = document.createElement('a'); link.href = url;
      link.download = 'predel-' + (person.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'profile') + '.pdf';
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (cause) { setExportError(cause instanceof Error ? cause.message : 'Не удалось сформировать PDF.'); }
    finally { setExporting(false); }
  }
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
    {person.softSkills?.length > 0 && <section><h4>Софт-скиллы <span className="field-caption">Самооценка</span></h4><div className="tags">{person.softSkills.map(skill => <span className="tag" key={skill}>{skill}</span>)}</div></section>}
    {workHistory && <section><h4>Места работы и проекты</h4><p className="body-copy resume-copy">{workHistory}</p></section>}
    {careerAchievements && <section><h4>Достижения</h4><p className="body-copy resume-copy">{careerAchievements}</p></section>}
    {education && <section><h4>Образование</h4><p className="body-copy resume-copy">{education}</p></section>}
    {person.languages && <section><h4>Языки</h4><p className="body-copy resume-copy">{person.languages}</p></section>}
    <section><h4 className="inline-icon"><Medal size={17} />Достижения ФСП</h4>
      {achievements.length ? achievements.map((achievement, index) => <div key={index} className="achievement"><strong>{achievement.title}</strong><span>{achievement.result} · {achievement.year}</span></div>)
        : <p className="muted">Истории ФСП пока нет</p>}
    </section>
    <section className="contact-section"><h4>Контакты</h4>
      {contacts ? <div className="contact-data"><a href={'mailto:' + person.email}>{person.email}</a>{person.phone && <a href={'tel:' + person.phone}>{person.phone}</a>}</div>
        : <div className="privacy-note"><LockKeyhole size={17} />{contactNote}</div>}
      {contacts && person.portfolio && <p className="body-copy resume-copy">{person.portfolio}</p>}
    </section>
    <div className="dialog-actions no-print">
      <button className="button secondary" disabled={exporting} onClick={() => { void downloadPdf(); }}><Download size={16} />{exporting ? 'Готовим PDF…' : 'PDF-профиль'}</button>
      {onInvite && <button className="button primary" onClick={onInvite}>Пригласить</button>}
    </div>
    {exportError && <p className="form-error no-print" role="alert">{exportError}</p>}
  </div>;
}
