import { useState } from 'react';
import { BadgeCheck, Download, LockKeyhole, MapPin, Medal } from 'lucide-react';
import { dateLabel, gradeLabels, initials, specializationLabels, type Candidate } from '../model';
import { resumeSections } from '../../../shared/resume-structure';
import { ResumeSummary } from './ResumeSummary';

import { CandidateEvidence } from './EvidenceList';

export function CandidateDetails({ person, contacts, onInvite, contactNote = 'Откроются после принятия приглашения' }: {
  person: Candidate; contacts: boolean; onInvite?: () => void; contactNote?: string;
}) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const showContacts = contacts && !person.demoProfile;
  async function downloadPdf() {
    if (exporting) return;
    setExporting(true); setExportError('');
    try {
      const [{ createProfilePdf }, response] = await Promise.all([import('../profile-pdf'), fetch('/assets/fonts/manrope.ttf')]);
      if (!response.ok) throw new Error('Не удалось загрузить шрифт для PDF. Повторите попытку.');
      const bytes = await createProfilePdf(person, showContacts, new Uint8Array(await response.arrayBuffer()));
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
  const resume = resumeSections(person);
  const sections = {
    workExperiences: resume.workExperiences.map(entry => ({ ...entry, company: sectionText(entry.company) || '', tasks: sectionText(entry.tasks) || '' })),
    petProjects: resume.petProjects.map(entry => ({ ...entry, description: sectionText(entry.description) || '' })),
    achievementItems: resume.achievementItems.map(item => sectionText(item) || '').filter(Boolean),
    interests: resume.interests,
  };
  const education = sectionText(person.education);
  const achievements = person.achievements;
  const specializationLabel = specializationLabels[person.confirmed?.specialization || person.specialization];
  return <div className="candidate-details">
    <div className="detail-person">
      <div className="avatar avatar-large">{initials(person.name)}</div>
      <div><h3>{person.name}</h3>{person.demoProfile && <span className="tag" title="Вымышленный профиль для проверки подбора">Демо</span>}<p>{specializationLabel}</p>
      {person.professionalRole && person.professionalRole !== specializationLabel && <p className="muted">{person.professionalRole}</p>}
      <span className="metadata">{person.city && <><MapPin size={14} />{person.city} · </>}{person.format}</span></div>
    </div>
    <div className="detail-grid">
      <div><span className="field-caption">Опыт</span><strong>{person.experience}</strong></div>
      <div><span className="field-caption">Тестирование</span><strong>{person.confirmed ? person.confirmed.score + ' из 100' : 'Не пройдено'}</strong></div>
      <div><span className="field-caption">Грейд</span><strong className="inline-icon">{person.confirmed && <BadgeCheck size={16} />}{person.confirmed ? gradeLabels[person.confirmed.grade] : 'Не подтверждён'}</strong>{person.confirmed && <time className="confirmed-date" dateTime={person.confirmed.date}>{dateLabel(person.confirmed.date)}</time>}</div>
      {!person.confirmed && <div><span className="field-caption">Желаемый грейд</span><strong>{gradeLabels[person.desiredGrade]}</strong></div>}
    </div>
    <section><h4>О себе</h4><p className="body-copy">{person.bio || 'Пока не заполнено'}</p></section>
    <section><h4>Стек</h4><div className="tags">{person.stack.map(skill => <span className="tag" key={skill}>{skill}</span>)}</div></section>
    {person.softSkills?.length > 0 && <section><h4>Софт-скиллы <span className="field-caption">Самооценка</span></h4><div className="tags">{person.softSkills.map(skill => <span className="tag" key={skill}>{skill}</span>)}</div></section>}
    <ResumeSummary sections={sections} />
    {education && <section><h4>Образование</h4><p className="body-copy resume-copy">{education}</p></section>}
    {person.languages && <section><h4>Языки</h4><p className="body-copy resume-copy">{person.languages}</p></section>}
    {(person.synthetic || person.fspEvidence?.mode === 'demo' || achievements.length > 0) && <section><h4 className="inline-icon" title={person.synthetic || person.fspEvidence?.mode === 'demo' ? 'Вымышленные результаты; личность ФСП не подтверждена' : 'Сведения из профиля'}><Medal size={17} />{person.synthetic || person.fspEvidence?.mode === 'demo' ? 'ФСП · демо' : 'Достижения ФСП'}</h4>
      {achievements.length ? achievements.map((achievement, index) => <div key={index} className="achievement"><strong>{achievement.title}</strong><span>{achievement.result} · {achievement.year}</span></div>)
        : <p className="muted">Истории ФСП пока нет</p>}
    </section>}
    {!person.synthetic && <CandidateEvidence candidateId={person.id} />}
    <section className="contact-section"><h4>Контакты</h4>
      {showContacts ? <div className="contact-data"><a href={'mailto:' + person.email}>{person.email}</a>{person.phone && <a href={'tel:' + person.phone}>{person.phone}</a>}</div>
        : <div className="privacy-note"><LockKeyhole size={17} />{person.demoProfile ? 'Недоступны для демопрофиля' : contactNote}</div>}
      {showContacts && person.portfolio && <p className="body-copy resume-copy">{person.portfolio}</p>}
    </section>
    <div className="dialog-actions no-print">
      <button className="button secondary" disabled={exporting} onClick={() => { void downloadPdf(); }}><Download size={16} />{exporting ? 'Готовим PDF…' : 'PDF-профиль'}</button>
      {onInvite && !person.demoProfile && <button className="button primary" onClick={onInvite}>Пригласить</button>}
    </div>
    {exportError && <p className="form-error no-print" role="alert">{exportError}</p>}
  </div>;
}
