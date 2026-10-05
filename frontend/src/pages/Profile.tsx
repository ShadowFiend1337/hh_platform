import { useState, type FormEvent } from 'react';
import { BadgeCheck, Eye, FileText, Medal, UserRound } from 'lucide-react';
import { dateLabel, specializationLabels, type Grade, type PlatformState, type Specialization } from '../model';
import { FormHeader } from './Company';

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
    if (!name || !stack.length) { setError('Заполните имя и стек.'); return; }
    update(previous => ({ ...previous, profile: {
      ...previous.profile, name, stack,
      specialization: String(fields.get('specialization')) as Specialization,
      desiredGrade: String(fields.get('desiredGrade')) as Grade,
      city: String(fields.get('city')).trim(),
      experience: String(fields.get('experience')).trim(),
      format: String(fields.get('format')),
      email: String(fields.get('email')).trim(),
      phone: String(fields.get('phone')).trim(),
      bio: String(fields.get('bio')).trim(),
      fspId: fspId.trim(), achievements: fspId.trim() === previous.profile.fspId ? previous.profile.achievements : [],
      consent, visible: visible && consent,
    } }));
    setVisible(visible && consent); setError(''); notify('Профиль сохранён');
  }
  return <>
    <div className="page-heading"><h1>Мой профиль</h1><button className="button secondary compact" onClick={onPreview}><Eye size={16} />Предпросмотр</button></div>
    <div className="profile-layout">
      <form className="panel profile-form" onSubmit={submit}>
        <FormHeader title="Личные данные" Icon={UserRound} />
        <div className="form-grid"><label className="field"><span>Имя и фамилия</span><input name="name" required maxLength={100} defaultValue={profile.name} /></label><label className="field"><span>Город</span><input name="city" required maxLength={100} defaultValue={profile.city} /></label></div>
        <div className="form-grid"><label className="field"><span>Email</span><input name="email" type="email" required defaultValue={profile.email} /></label><label className="field"><span>Телефон</span><input name="phone" type="tel" maxLength={30} defaultValue={profile.phone} placeholder="+7" /></label></div>
        <div className="section-divider" />
        <FormHeader title="Навыки" Icon={FileText} />
        <div className="form-grid"><label className="field"><span>Специализация</span><select name="specialization" defaultValue={profile.specialization}><option>Frontend</option><option>Backend</option></select></label><label className="field"><span>Предполагаемый грейд</span><select name="desiredGrade" defaultValue={profile.desiredGrade}><option>Junior</option><option>Middle</option></select></label></div>
        <div className="form-grid"><label className="field"><span>Опыт работы</span><input name="experience" required maxLength={100} defaultValue={profile.experience} /></label><label className="field"><span>Формат работы</span><select name="format" defaultValue={profile.format}><option>Удалённо</option><option>Гибрид</option><option>Офис</option></select></label></div>
        <label className="field"><span>Стек</span><input name="stack" required maxLength={500} defaultValue={profile.stack.join(', ')} placeholder="React, TypeScript, CSS" /></label>
        <label className="field"><span>О себе</span><textarea name="bio" rows={4} maxLength={3000} defaultValue={profile.bio} /></label>
        <div className="section-divider" />
        <FormHeader title="ФСП" Icon={Medal} />
        <label className="field"><span>ID участника</span><input value={fspId} maxLength={100} onChange={event => setFspId(event.target.value)} placeholder="Необязательно" /></label>
        {fspId && <p className="field-help">Привязка ожидает проверки</p>}
        <div className="section-divider" />
        <label className="checkbox-field"><input type="checkbox" checked={visible} onChange={event => setVisible(event.target.checked)} /><span>Показывать профиль работодателям</span></label>
        <label className="checkbox-field"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} /><span>Согласен на обработку и публикацию данных профиля</span></label>
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
