import { useState, type FormEvent } from 'react';
import { initials, type Candidate, type Invitation, type PlatformState } from '../model';

export function InviteForm({ person, state, onSubmit }: {
  person: Candidate; state: PlatformState; onSubmit: (invitation: Invitation) => void;
}) {
  const [error, setError] = useState('');
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const salaryFrom = Number(fields.get('salaryFrom'));
    const salaryTo = Number(fields.get('salaryTo'));
    if (!Number.isFinite(salaryFrom) || !Number.isFinite(salaryTo) || salaryFrom <= 0 || salaryTo <= 0 || salaryFrom > salaryTo) {
      setError('Укажите положительную вилку зарплаты: «от» не больше «до».'); return;
    }
    const title = String(fields.get('title') || '').trim();
    const description = String(fields.get('description') || '').trim();
    const contact = String(fields.get('contact') || '').trim();
    if (!title || !description || !contact || !state.company.name.trim()) { setError('Заполните предложение и профиль компании.'); return; }
    onSubmit({
      id: crypto.randomUUID(), candidateId: person.id, companyId: state.company.id,
      company: state.company.name, title, description, contact,
      salaryFrom, salaryTo, status: 'sent', date: new Date().toISOString(),
    });
  }
  return <form className="invite-form" onSubmit={submit}>
    <div className="invite-person"><div className="avatar">{initials(person.name)}</div><div><strong>{person.name}</strong><span>{person.confirmed?.specialization} · {person.confirmed?.grade}</span></div></div>
    <label className="field"><span>Предложение</span><input name="title" required maxLength={120} defaultValue={person.confirmed?.specialization + '-разработчик'} /></label>
    <fieldset className="salary-fields"><legend>Зарплата в месяц, ₽</legend><div className="form-grid"><label className="field"><span>От</span><input name="salaryFrom" type="number" min="1" max="10000000" step="1" required placeholder="180000" /></label><label className="field"><span>До</span><input name="salaryTo" type="number" min="1" max="10000000" step="1" required placeholder="240000" /></label></div><p className="field-help">До вычета налогов</p></fieldset>
    <label className="field"><span>Условия и задачи</span><textarea name="description" rows={4} required maxLength={3000} placeholder="Что предстоит делать, команда и формат работы" /></label>
    <div className="form-grid"><label className="field"><span>Компания</span><input value={state.company.name} readOnly /></label><label className="field"><span>Контакт для связи</span><input name="contact" type="email" required defaultValue={state.company.contact} /></label></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="dialog-actions"><button className="button primary" type="submit">Отправить приглашение</button></div>
  </form>;
}
