import { useEffect, useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { gradeLabels, gradeOptions, isGrade, isSpecialization, money, specializationNames, specializationOptions, type PlatformState } from '../model';
import { closeVacancy, createVacancy, listOwnVacancies, updateVacancy, type Vacancy, type VacancyInput } from '../companies-api';
import { Dialog } from './Dialog';
import { MAX_STACK_SKILLS, resumeTextLimits } from '../../../shared/resume-limits';

type SyncStatus = 'loading' | 'saving' | 'saved' | 'error';
const emptyOffer: VacancyInput = { title: '', description: '', salaryFrom: 0, salaryTo: 0,
  specialization: 'Frontend', grade: 'Junior', city: '', format: 'Удалённо', stack: [] };
const messageOf = (cause: unknown) => cause instanceof Error ? cause.message : 'Не удалось сохранить предложение.';

export function CompanyOffers({ company, syncStatus = 'saved', notify }: {
  company: PlatformState['company']; syncStatus?: SyncStatus; notify: (message: string) => void;
}) {
  const [offers, setOffers] = useState<Vacancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState<{ original: Vacancy | null; input: VacancyInput } | null>(null);
  const [closing, setClosing] = useState<Vacancy | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ready = syncStatus === 'saved' && Boolean(company.name.trim() && company.contact.trim());

  useEffect(() => {
    if (syncStatus !== 'saved') return;
    const controller = new AbortController();
    setLoading(true); setLoadError('');
    listOwnVacancies(controller.signal).then(result => {
      if (!controller.signal.aborted) { setOffers(result.items); setLoading(false); }
    }).catch(cause => {
      if (!controller.signal.aborted) { setLoadError(messageOf(cause)); setLoading(false); }
    });
    return () => controller.abort();
  }, [reload, company.name, company.contact, syncStatus]);

  function openEditor(original: Vacancy | null) {
    const input: VacancyInput = original ? {
      title: original.title, description: original.description, salaryFrom: original.salaryFrom, salaryTo: original.salaryTo,
      specialization: original.specialization, grade: original.grade, city: original.city, format: original.format, stack: [...original.stack],
    } : { ...emptyOffer, stack: [] };
    setError(''); setEditing({ original, input });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || busy || !ready) return;
    const fields = new FormData(event.currentTarget);
    const title = String(fields.get('title') || '').trim(), description = String(fields.get('description') || '').trim();
    const salaryFrom = Number(fields.get('salaryFrom')), salaryTo = Number(fields.get('salaryTo'));
    const specialization = String(fields.get('specialization')), grade = String(fields.get('grade'));
    const stack = [...new Set(String(fields.get('stack') || '').split(',').map(value => value.trim()).filter(Boolean))];
    if (!title || !description) { setError('Укажите название и описание предложения.'); return; }
    if (!Number.isSafeInteger(salaryFrom) || !Number.isSafeInteger(salaryTo) || salaryFrom <= 0 || salaryTo <= 0
      || salaryFrom > 10000000 || salaryTo > 10000000 || salaryFrom > salaryTo) {
      setError('Укажите зарплатный диапазон в рублях: положительные целые числа, от меньшей суммы к большей.'); return;
    }
    if (!isSpecialization(specialization) || !isGrade(grade)) { setError('Выберите специализацию и грейд.'); return; }
    if (!stack.length || stack.length > MAX_STACK_SKILLS || stack.some(value => value.length > 80)) { setError(`Укажите стек через запятую: до ${MAX_STACK_SKILLS} навыков, каждый не длиннее 80 символов.`); return; }
    const input: VacancyInput = { title, description, salaryFrom, salaryTo, specialization, grade, stack,
      city: String(fields.get('city') || '').trim(), format: String(fields.get('format') || '') };
    setBusy(true); setError('');
    try {
      const offer = editing.original ? await updateVacancy(editing.original.id, input) : await createVacancy(input);
      setOffers(previous => [offer, ...previous.filter(item => item.id !== offer.id)]);
      setEditing(null); notify(editing.original ? 'Предложение обновлено' : 'Предложение опубликовано');
    } catch (cause) { setError(messageOf(cause)); }
    finally { setBusy(false); }
  }

  async function confirmClose() {
    if (!closing || busy) return;
    setBusy(true); setError('');
    try {
      const offer = await closeVacancy(closing.id);
      setOffers(previous => previous.map(item => item.id === offer.id ? offer : item));
      setClosing(null); notify('Позиция закрыта');
    } catch (cause) { setError(messageOf(cause)); }
    finally { setBusy(false); }
  }

  return <section className="company-offers" aria-labelledby="company-offers-heading">
    <div className="company-offers-header"><h2 id="company-offers-heading">Открытые позиции</h2>
      <button className="button primary" disabled={!ready || busy} onClick={() => openEditor(null)}><Plus size={17} />Добавить предложение</button></div>
    {!ready && <p className="field-help">{syncStatus === 'saving' || syncStatus === 'loading' ? 'Сохраняем профиль компании…' : 'Сначала сохраните название и контактный email компании.'}</p>}
    {loading && syncStatus === 'saved' && <p role="status">Загружаем позиции…</p>}
    {loadError && <div className="form-error" role="alert">{loadError}<button className="text-button" onClick={() => setReload(value => value + 1)}>Повторить загрузку позиций</button></div>}
    {!loading && !loadError && !offers.length && <div className="panel empty-state"><p>Предложений пока нет</p><p className="muted">Опишите задачи и укажите зарплату, чтобы кандидаты могли откликнуться.</p></div>}
    <div className="company-offers-list">{offers.map(offer => <article className="panel company-offer-card" data-vacancy-id={offer.id} key={offer.id}>
      <div className="company-offers-header"><h3>{offer.title}</h3><span className={'application-status ' + offer.status}>{offer.status === 'open' ? 'Открыта' : 'Закрыта'}</span></div>
      <p className="offer-meta">{specializationNames[offer.specialization]} · {gradeLabels[offer.grade]} · {offer.city || 'Любой город'} · {offer.format}</p>
      <p className="offer-salary">{money(offer.salaryFrom)}–{money(offer.salaryTo)} ₽ в месяц</p>
      <p className="body-copy offer-description">{offer.description}</p>
      <div className="tags">{offer.stack.map(skill => <span className="tag" key={skill}>{skill}</span>)}</div>
      {offer.synthetic && <p className="field-help">Вымышленное демонстрационное предложение</p>}
      {offer.status === 'open' && <div className="offer-actions"><button className="button secondary" disabled={!ready || busy} onClick={() => openEditor(offer)}>Редактировать</button>
        <button className="button secondary" disabled={busy} onClick={() => { setError(''); setClosing(offer); }}>Закрыть позицию</button></div>}
    </article>)}</div>
    {editing && <Dialog title={editing.original ? 'Редактировать предложение' : 'Добавить предложение'} onClose={() => { if (!busy) setEditing(null); }} wide>
      <form className="offer-form" onSubmit={submit} onChange={() => setError('')}>
        <label className="field"><span>Название позиции</span><input name="title" required maxLength={200} defaultValue={editing.input.title} /></label>
        <label className="field"><span>Описание предложения</span><textarea name="description" required rows={5} maxLength={4000} defaultValue={editing.input.description} /></label>
        <div className="form-grid"><label className="field"><span>Зарплата от, ₽</span><input name="salaryFrom" type="number" required min={1} max={10000000} step={1} defaultValue={editing.input.salaryFrom || ''} /></label>
          <label className="field"><span>Зарплата до, ₽</span><input name="salaryTo" type="number" required min={1} max={10000000} step={1} defaultValue={editing.input.salaryTo || ''} /></label></div>
        <p className="field-help">Укажите зарплату в рублях за месяц.</p>
        <div className="form-grid"><label className="field"><span>Специализация</span><select name="specialization" defaultValue={editing.input.specialization}>{specializationOptions.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
          <label className="field"><span>Грейд</span><select name="grade" defaultValue={editing.input.grade}>{gradeOptions.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label></div>
        <div className="form-grid"><label className="field"><span>Город</span><input name="city" maxLength={100} defaultValue={editing.input.city} placeholder="Любой город" /></label>
          <label className="field"><span>Формат работы</span><select name="format" defaultValue={editing.input.format}><option>Удалённо</option><option>Гибрид</option><option>Офис</option></select></label></div>
        <label className="field"><span>Стек</span><input name="stack" required maxLength={resumeTextLimits.stack} defaultValue={editing.input.stack.join(', ')} placeholder="React, TypeScript" /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="dialog-actions"><button type="button" className="button secondary" disabled={busy} onClick={() => setEditing(null)}>Отмена</button>
          <button className="button primary" disabled={busy || !ready}>{busy ? 'Сохраняем…' : editing.original ? 'Сохранить предложение' : 'Опубликовать'}</button></div>
      </form>
    </Dialog>}
    {closing && <Dialog title="Закрыть позицию" onClose={() => { if (!busy) setClosing(null); }}>
      <p className="body-copy">Закрыть «{closing.title}» для новых откликов? Уже полученные отклики сохранятся.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="dialog-actions"><button className="button secondary" disabled={busy} onClick={() => setClosing(null)}>Отмена</button>
        <button className="button primary" disabled={busy} onClick={() => { void confirmClose(); }}>{busy ? 'Закрываем…' : 'Закрыть позицию'}</button></div>
    </Dialog>}
  </section>;
}
