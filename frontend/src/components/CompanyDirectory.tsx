import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowUpRight, Building2, Check, MapPin, Search, Send } from 'lucide-react';
import { applyToVacancy, listApplications, listCompanies, listVacancies, type CompanyDirectoryItem, type Vacancy } from '../companies-api';
import { gradeLabels, initials, money, specializationLabels } from '../model';
import { Dialog } from './Dialog';
import { VacancyDeck } from './VacancyDeck';

function readMode(): 'list' | 'deck' {
  try { return sessionStorage.getItem('predel:company-mode') === 'deck' ? 'deck' : 'list'; }
  catch { return 'list'; }
}

export function CompanyDirectory({ notify, onApplied, syncStatus }: {
  notify: (message: string) => void; onApplied: () => void;
  syncStatus: 'loading' | 'saving' | 'saved' | 'error';
}) {
  const [companies, setCompanies] = useState<CompanyDirectoryItem[]>([]);
  const [vacancies, setVacancies] = useState<Vacancy[]>([]);
  const [mode, setMode] = useState(readMode);
  const [applied, setApplied] = useState(new Set<string>());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [offersLoading, setOffersLoading] = useState(true);
  const [offersError, setOffersError] = useState('');
  const [applicationsLoading, setApplicationsLoading] = useState(true);
  const [applicationsError, setApplicationsError] = useState('');
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(12);
  const [selected, setSelected] = useState<CompanyDirectoryItem | null>(null);
  const [vacancy, setVacancy] = useState<Vacancy | null>(null);
  const [sending, setSending] = useState(false);
  const [applyError, setApplyError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    listCompanies(controller.signal).then(catalog => {
      if (controller.signal.aborted) return;
      setCompanies(catalog.items);
    }).catch(cause => { if (!controller.signal.aborted) setError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [retry]);

  useEffect(() => {
    const controller = new AbortController();
    setApplicationsLoading(true); setApplicationsError('');
    listApplications('candidate', controller.signal).then(applications => {
      if (!controller.signal.aborted) setApplied(new Set(applications.items.map(item => item.vacancyId)));
    }).catch(cause => { if (!controller.signal.aborted) setApplicationsError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setApplicationsLoading(false); });
    return () => controller.abort();
  }, [retry]);

  useEffect(() => {
    try { sessionStorage.setItem('predel:company-mode', mode); }
    catch { /* The selected view remains usable without browser storage. */ }
    if (mode !== 'deck') return;
    const controller = new AbortController();
    setOffersLoading(true); setOffersError('');
    listVacancies(controller.signal).then(result => {
      if (!controller.signal.aborted) setVacancies(result.items);
    }).catch(cause => { if (!controller.signal.aborted) setOffersError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setOffersLoading(false); });
    return () => controller.abort();
  }, [mode, retry]);

  const filtered = useMemo(() => {
    const text = query.trim().toLocaleLowerCase('ru');
    return companies.filter(company => !text || [company.name, company.industry,
      ...company.vacancies.map(item => [item.title, specializationLabels[item.specialization], item.city].join(' ')),
    ].join(' ').toLocaleLowerCase('ru').includes(text));
  }, [companies, query]);

  const filteredOffers = useMemo(() => {
    const text = query.trim().toLocaleLowerCase('ru');
    return vacancies.filter(item => !text || [item.company, item.title, item.description,
      specializationLabels[item.specialization], gradeLabels[item.grade], item.city, item.format, ...item.stack,
    ].join(' ').toLocaleLowerCase('ru').includes(text));
  }, [vacancies, query]);
  const busy = applicationsLoading || (mode === 'deck' ? offersLoading : loading);
  const loadError = applicationsError || (mode === 'deck' ? offersError : error);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!vacancy || sending) return;
    const message = String(new FormData(event.currentTarget).get('message') || '').trim();
    setSending(true); setApplyError('');
    try {
      await applyToVacancy(vacancy.id, message);
      setApplied(previous => new Set([...previous, vacancy.id]));
      setVacancy(null); notify('Отклик отправлен'); onApplied();
    } catch (cause) {
      setApplyError(cause instanceof Error ? cause.message : 'Не удалось отправить отклик.');
    } finally { setSending(false); }
  }

  return <>
    <div className="page-heading company-directory-heading"><h1>{mode === 'deck' ? 'Найти предложения' : 'Найти компании'}</h1>
      <div className="directory-view-controls">
        <div className="directory-view-switch" role="group" aria-label="Вид предложений">
          <button aria-pressed={mode === 'list'} onClick={() => setMode('list')}>Обычный режим</button>
          <button aria-pressed={mode === 'deck'} onClick={() => setMode('deck')}>Предельный режим</button>
        </div>
      </div>
    </div>
    <label className="search-panel company-search"><Search size={20} /><span className="sr-only">Компания или направление</span>
      <input value={query} placeholder="Компания или направление" onChange={event => { setQuery(event.target.value); setLimit(12); }} /></label>
    {busy ? <div className="empty-state"><p role="status">{mode === 'deck' ? 'Загружаем предложения…' : 'Загружаем компании…'}</p></div>
      : loadError ? <div className="empty-state"><p role="alert">{loadError}</p><button className="button secondary" onClick={() => setRetry(value => value + 1)}>Повторить</button></div>
        : mode === 'deck' ? filteredOffers.length ? <VacancyDeck key={query.trim().toLocaleLowerCase('ru')} items={filteredOffers} applied={applied}
          onApply={item => { setSelected(null); setVacancy(item); setApplyError(''); }} />
          : <div className="empty-state"><Building2 size={32} /><h2>Предложения не найдены</h2>{query && <button className="text-button" onClick={() => setQuery('')}>Сбросить поиск</button>}</div>
        : filtered.length ? <div className="company-directory">
          {filtered.slice(0, limit).map(company => <article className="company-card" key={company.id}>
            <div className="company-card-top"><div className="company-avatar">{initials(company.name)}</div></div>
            <h2>{company.name}</h2><p className="company-industry">{company.industry}</p>
            <p className="company-description">{company.description}</p>
            <div className="company-card-bottom"><span className="muted">Предложений: {company.vacancies.length}</span>
              <button className="button secondary compact" onClick={() => setSelected(company)}>Посмотреть предложения<ArrowUpRight size={16} /></button></div>
          </article>)}
          {filtered.length > limit && <button className="button secondary company-load-more" onClick={() => setLimit(value => value + 12)}>Показать ещё</button>}
        </div> : <div className="empty-state"><Building2 size={32} /><h2>Компании не найдены</h2>{query && <button className="text-button" onClick={() => setQuery('')}>Сбросить поиск</button>}</div>}
    {(selected || vacancy) && <Dialog title={vacancy ? 'Отклик на предложение' : selected?.name || 'Предложения'} wide onClose={() => { if (!sending) { if (vacancy) { setVacancy(null); setApplyError(''); } else setSelected(null); } }}>
      {vacancy ? <form className="company-apply-form" onSubmit={submit}>
        <button type="button" className="text-button" disabled={sending} onClick={() => { setVacancy(null); setApplyError(''); }}>{selected ? '← К предложениям' : '← К карточке'}</button>
        <h3>{vacancy.title}</h3><Salary vacancy={vacancy} />
        <label className="field"><span>Сообщение</span><textarea name="message" rows={4} maxLength={2000} placeholder="Необязательно" disabled={sending} /></label>
        <p className="privacy-note">Компания получит ваш профиль и контакты.</p>
        {applyError && <p className="offer-error" role="alert">{applyError}</p>}
        {syncStatus !== 'saved' && <p className="muted" role="status">{syncStatus === 'error' ? 'Сначала сохраните профиль.' : 'Сохраняем профиль…'}</p>}
        <div className="form-actions"><button className="button primary" type="submit" disabled={sending || syncStatus !== 'saved'}><Send size={16} />{sending ? 'Отправляем…' : 'Отправить отклик'}</button></div>
      </form> : selected && <div className="company-detail">
        <p className="muted">{selected.industry}</p><p className="company-detail-description">{selected.description}</p>
        <div className="vacancy-list">{selected.vacancies.map(item => <article className="vacancy-card" key={item.id}>
          <h2>{item.title}</h2><Salary vacancy={item} />
          <div className="offer-meta"><span>{specializationLabels[item.specialization]}</span><span>{gradeLabels[item.grade]}</span>{item.city && <span className="inline-icon"><MapPin size={14} />{item.city}</span>}{item.format && <span>{item.format}</span>}</div>
          <p className="offer-description">{item.description}</p>
          {item.stack.length > 0 && <div className="company-stack">{item.stack.map(skill => <span key={skill}>{skill}</span>)}</div>}
          <div className="offer-actions"><button className={'button ' + (applied.has(item.id) ? 'secondary' : 'primary')} disabled={applied.has(item.id)} onClick={() => { setVacancy(item); setApplyError(''); }}>{applied.has(item.id) ? <><Check size={16} />Отклик отправлен</> : <>Откликнуться<ArrowUpRight size={16} /></>}</button></div>
        </article>)}</div>
      </div>}
    </Dialog>}
  </>;
}

function Salary({ vacancy }: { vacancy: Vacancy }) {
  return <p className="salary">{money(vacancy.salaryFrom)} – {money(vacancy.salaryTo)} ₽<span> / месяц, до налогов</span></p>;
}
