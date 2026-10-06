import { useState, type FormEvent } from 'react';
import { BadgeCheck, Eye, FileText, Medal, UserRound } from 'lucide-react';
import { dateLabel, industryOptions, isSpecialization, specializationOptions, specializationLabels, type Grade, type PlatformState, type Specialization } from '../model';
import { FormHeader } from './Company';
import { MAX_STACK_SKILLS, resumeTextLimits } from '../../../shared/resume-limits';

function sameValues(left: string[], right: string[]) {
  const leftValues = new Set(left);
  const rightValues = new Set(right);
  return leftValues.size === rightValues.size && [...leftValues].every(value => rightValues.has(value));
}

export function Profile({ state, update, notify, onTest, onPreview }: {
  state: PlatformState; update: (fn: (state: PlatformState) => PlatformState) => void;
  notify: (message: string) => void; onTest: () => void; onPreview: () => void;
}) {
  const [fspId, setFspId] = useState(state.profile.fspId);
  const [consent, setConsent] = useState(state.profile.consent);
  const [visible, setVisible] = useState(state.profile.visible);
  const [error, setError] = useState('');
  const profile = state.profile;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const name = String(fields.get('name')).trim();
    const stack = [...new Set(String(fields.get('stack')).split(',').map(skill => skill.trim()).filter(Boolean))];
    const industry = String(fields.get('industry') || '').trim();
    const professionalRole = String(fields.get('professionalRole') || '').trim();
    const softSkills: string[] = [];
    const specialization = String(fields.get('specialization')) as Specialization;
    const desiredGrade = String(fields.get('desiredGrade')) as Grade;
    const experience = String(fields.get('experience')).trim();
    if (!name || !stack.length) { setError('Заполните имя и стек.'); return; }
    if (!industryOptions.includes(industry)) { setError('Выберите отрасль.'); return; }
    if (!isSpecialization(specialization)) { setError('Выберите специализацию.'); return; }
    if (!professionalRole || professionalRole.length > 100) { setError('Укажите роль в команде: не более 100 символов.'); return; }
    if (stack.length > MAX_STACK_SKILLS || stack.some(skill => skill.length > 80)) { setError(`Укажите до ${MAX_STACK_SKILLS} навыков, не более 80 символов каждый.`); return; }
    update(previous => {
      const professionalChanged = specialization !== previous.profile.specialization
        || desiredGrade !== previous.profile.desiredGrade
        || industry !== previous.profile.industry
        || professionalRole !== previous.profile.professionalRole
        || experience !== previous.profile.experience
        || !sameValues(stack, previous.profile.stack)
        || !sameValues(softSkills, previous.profile.softSkills || []);
      return { ...previous, profile: {
        ...previous.profile, name, stack, specialization, desiredGrade, industry, professionalRole, softSkills, experience,
        surveyCompletedAt: professionalChanged ? null : previous.profile.surveyCompletedAt,
        city: String(fields.get('city')).trim(),
        format: String(fields.get('format')),
        email: String(fields.get('email')).trim(),
        phone: String(fields.get('phone')).trim(),
        bio: String(fields.get('bio')).trim(),
        careerAchievements: String(fields.get('careerAchievements') || '').trim(),
        education: String(fields.get('education') || '').trim(),
        workHistory: String(fields.get('workHistory') || '').trim(),
        portfolio: String(fields.get('portfolio') || '').trim(),
        languages: String(fields.get('languages') || '').trim(),
        fspId: fspId.trim(), achievements: fspId.trim() === previous.profile.fspId ? previous.profile.achievements : [],
        consent, visible: visible && consent,
      } };
    });
    setVisible(visible && consent); setError(''); notify('Профиль сохранён');
  }
  return <>
    <div className="page-heading"><h1>Мой профиль</h1><button className="button secondary compact" onClick={onPreview}><Eye size={16} />Предпросмотр</button></div>
    <div className="profile-layout">
      <form className="panel profile-form" onSubmit={submit} onChange={() => setError('')}>
        <FormHeader title="Личные данные" Icon={UserRound} />
        <div className="form-grid"><label className="field"><span>Имя и фамилия</span><input name="name" required maxLength={100} defaultValue={profile.name} /></label><label className="field"><span>Город</span><input name="city" maxLength={100} defaultValue={profile.city} placeholder="Необязательно" /></label></div>
        <div className="form-grid"><label className="field"><span>Email</span><input name="email" type="email" required defaultValue={profile.email} /></label><label className="field"><span>Телефон</span><input name="phone" type="tel" maxLength={30} defaultValue={profile.phone} placeholder="+7" /></label></div>
        <div className="section-divider" />
        <FormHeader title="Навыки" Icon={FileText} />
        <div className="form-grid"><label className="field"><span>Специализация</span><select name="specialization" defaultValue={profile.specialization}>{specializationOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label><label className="field"><span>Предполагаемый грейд</span><select name="desiredGrade" defaultValue={profile.desiredGrade}><option>Junior</option><option>Middle</option></select></label></div>
        <div className="form-grid"><label className="field"><span>Отрасль</span><select name="industry" required defaultValue={profile.industry || ''}><option value="">Выберите отрасль</option>{industryOptions.map(industry => <option key={industry}>{industry}</option>)}</select></label><label className="field"><span>Роль в команде</span><input name="professionalRole" required maxLength={100} defaultValue={profile.professionalRole} placeholder="Например, разработчик интерфейсов" /></label></div>
        <div className="form-grid"><label className="field"><span>Общий стаж</span><input name="experience" required maxLength={100} defaultValue={profile.experience} /></label><label className="field"><span>Формат работы</span><select name="format" defaultValue={profile.format}><option>Удалённо</option><option>Гибрид</option><option>Офис</option></select></label></div>
        <label className="field"><span>Стек</span><input name="stack" required maxLength={resumeTextLimits.stack} defaultValue={profile.stack.join(', ')} placeholder="React, TypeScript, CSS" /></label>
        <label className="field"><span>Места работы и проекты</span><textarea name="workHistory" rows={6} maxLength={resumeTextLimits.workHistory} defaultValue={profile.workHistory || ''} /></label>
        <label className="field"><span>О себе</span><textarea name="bio" rows={4} maxLength={3000} defaultValue={profile.bio} /></label>
        <label className="field"><span>Достижения</span><textarea name="careerAchievements" rows={3} maxLength={resumeTextLimits.careerAchievements} defaultValue={profile.careerAchievements || ''} placeholder="Результаты проектов, награды, соревнования" /></label>
        <details className="onboarding-details"><summary>Подробнее о себе</summary>
          <label className="field"><span>Образование</span><textarea name="education" rows={2} maxLength={resumeTextLimits.education} defaultValue={profile.education || ''} /></label>
          <div className="form-grid"><label className="field"><span>Языки</span><input name="languages" maxLength={500} defaultValue={profile.languages || ''} /></label><label className="field"><span>Портфолио</span><input name="portfolio" maxLength={1000} defaultValue={profile.portfolio || ''} placeholder="GitHub или ссылка на проекты" /></label></div>
        </details>
        <div className="section-divider" />
        <FormHeader title="ФСП" Icon={Medal} />
        <label className="field"><span>ID участника</span><input value={fspId} maxLength={100} onChange={event => setFspId(event.target.value)} placeholder="Необязательно" /></label>
        {fspId && <p className="field-help">Привязка ожидает проверки</p>}
        <div className="section-divider" />
        <label className="checkbox-field"><input type="checkbox" disabled={!consent} checked={visible && consent} onChange={event => setVisible(event.target.checked)} /><span>Показывать профиль работодателям</span></label>
        <label className="checkbox-field"><input type="checkbox" checked={consent} onChange={event => { setConsent(event.target.checked); if (!event.target.checked) setVisible(false); }} /><span>Согласен на обработку персональных данных</span></label>
        <a className="privacy-policy-link" href="/privacy" target="_blank" rel="noopener noreferrer">Политика конфиденциальности</a>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-actions"><button type="submit" className="button primary">Сохранить изменения</button></div>
      </form>
      <aside className="profile-sidebar">
        <section className="panel category-panel"><h2 className="sr-only">Подтверждённая категория</h2><p className="muted">{specializationLabels[profile.confirmed?.specialization || profile.specialization]}</p>
          <div className="category-status"><BadgeCheck size={20} /><div><span className="field-caption">Подтверждённый грейд</span><strong>{profile.confirmed?.grade || 'Не подтверждён'}</strong></div></div>
          {profile.confirmed && <div className="category-score" aria-label={'Результат теста: ' + profile.confirmed.score + ' из 100'}><strong>{profile.confirmed.score}<span>/100</span></strong></div>}
          <button className="button primary full-width" onClick={onTest}>{profile.confirmed ? 'Пройти тест' : 'Подтвердить грейд'}</button>
        </section>
        <section className="panel test-history"><h2>История тестов</h2>{state.history.length ? state.history.slice(0, 5).map(result => <div className="history-item" key={result.id}><div><strong>{result.specialization} · {result.grade}</strong><span>{dateLabel(result.date)}</span></div><span className={'history-score ' + (result.passed ? 'passed' : 'failed')}>{result.score}/100</span></div>) : <p className="muted">Тестов пока нет</p>}</section>
      </aside>
    </div>
  </>;
}
