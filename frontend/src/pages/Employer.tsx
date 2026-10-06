import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUpRight, BadgeCheck, Bookmark, Check, ChevronDown, Info, MapPin, Medal, Search, SlidersHorizontal, X } from 'lucide-react';
import { defaultStackOptions, gradeLabels, gradeOptions, initials, isSpecialization, specializationLabels, specializationNames, specializationOptions, specializationStacks, type Candidate, type PlatformState } from '../model';
import { defaultSearchFilters, employmentTypes, languageOptions, normalizeSearchFilters, type SearchFilters } from '../../../shared/search.ts';
import { directoryOptions, searchDirectory, type DirectoryOptions, type DirectorySearch } from '../directory-api';

type Props = {
  state: PlatformState; candidates: Candidate[];
  update: (fn: (state: PlatformState) => PlatformState) => void;
  onProfile: (person: Candidate) => void; onInvite: (person: Candidate) => void;
  notify: (message: string) => void; directoryRevision?: number;
};
function readSearch(): { draft: string; query: string; filters: SearchFilters } {
  try {
    const stored = JSON.parse(sessionStorage.getItem('predel:search') || 'null');
    if (typeof stored?.query === 'string' && typeof stored.draft === 'string') return { draft: stored.draft, query: stored.query, filters: normalizeSearchFilters(stored.filters) };
  } catch { /* Search remains usable without browser storage. */ }
  return { draft: '', query: '', filters: normalizeSearchFilters(defaultSearchFilters) };
}
const amount = (value: number) => new Intl.NumberFormat('ru-RU').format(value);
const years = (months: number | null) => months === null ? '' : Number((months / 12).toFixed(2));
function countLabel(count: number) {
  const last = count % 10, ending = count % 100;
  return count + ' ' + (last === 1 && ending !== 11 ? 'специалист' : last >= 2 && last <= 4 && !(ending >= 12 && ending <= 14) ? 'специалиста' : 'специалистов');
}

export function Employer({ state, update, onProfile, onInvite, notify, directoryRevision = 0 }: Props) {
  const [initialSearch] = useState(readSearch);
  const [draft, setDraft] = useState(initialSearch.draft);
  const [query, setQuery] = useState(initialSearch.query);
  const [filters, setFilters] = useState<SearchFilters>(initialSearch.filters);
  const [showFilters, setShowFilters] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [response, setResponse] = useState<DirectorySearch | null>(null);
  const [options, setOptions] = useState<DirectoryOptions>({ cities: [], industries: [], languages: languageOptions, employmentTypes });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [pageError, setPageError] = useState('');
  const [retry, setRetry] = useState(0);
  const generation = useRef(0);
  const pageRequest = useRef<AbortController | null>(null);
  const previousRequest = useRef<{ query: string; retry: number; revision: number } | null>(null);
  const filterStackOptions = [...new Set([...(isSpecialization(filters.specialization) ? specializationStacks[filters.specialization] : defaultStackOptions), ...filters.stack])];
  const filterCount = Object.entries(filters).reduce((count, [key, value]) => count + (key === 'stack' ? filters.stack.length : Number(value !== '' && value !== null && value !== false)), 0);
  const extraCount = ['city', 'industry', 'salaryMax', 'experienceMin', 'experienceMax', 'employmentType', 'language', 'hasPortfolio', 'minScore']
    .filter(key => { const value = filters[key as keyof SearchFilters]; return value !== '' && value !== null && value !== false; }).length;
  useEffect(() => {
    try { sessionStorage.setItem('predel:search', JSON.stringify({ draft, query, filters })); }
    catch { /* Search remains usable without persistence. */ }
  }, [draft, query, filters]);
  useEffect(() => {
    const controller = new AbortController();
    void directoryOptions(controller.signal).then(setOptions).catch(() => { /* Search reports its own availability. */ });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const version = ++generation.current;
    pageRequest.current?.abort(); pageRequest.current = null;
    const previous = previousRequest.current;
    const immediate = !previous || previous.query !== query || previous.retry !== retry || previous.revision !== directoryRevision;
    previousRequest.current = { query, retry, revision: directoryRevision };
    setLoading(true); setLoadingMore(false); setError(''); setPageError('');
    const timer = window.setTimeout(() => {
      void searchDirectory(query, filters, 0, controller.signal).then(result => {
        if (!controller.signal.aborted && generation.current === version) setResponse(result);
      }).catch(cause => {
        if (!controller.signal.aborted && generation.current === version) setError(cause instanceof Error ? cause.message : 'Не удалось получить подборку.');
      }).finally(() => {
        if (!controller.signal.aborted && generation.current === version) setLoading(false);
      });
    }, immediate ? 0 : 250);
    return () => { window.clearTimeout(timer); controller.abort(); pageRequest.current?.abort(); };
  }, [query, filters, retry, directoryRevision]);
  const change = <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) => setFilters(previous => ({ ...previous, [key]: value }));
  const changeNumber = (key: 'salaryMax' | 'experienceMin' | 'experienceMax' | 'minScore', value: string, multiplier = 1) => {
    const maximum = key === 'minScore' ? 100 : key === 'salaryMax' ? 10_000_000 : 1200;
    change(key, value === '' ? null : Math.min(maximum, Math.max(0, Math.round(Number(value) * multiplier))));
  };
  const reset = () => { setFilters(normalizeSearchFilters(defaultSearchFilters)); setQuery(''); setDraft(''); };
  function submit(event: FormEvent) { event.preventDefault(); setQuery(draft.trim()); setRetry(value => value + 1); }
  function saveSearch() {
    const title = query || [isSpecialization(filters.specialization) ? specializationNames[filters.specialization] : '', filters.grade, ...filters.stack].filter(Boolean).join(' · ') || 'Все кандидаты';
    update(previous => ({ ...previous, savedSearches: [
      { id: crypto.randomUUID(), title, query, filters: normalizeSearchFilters(filters) }, ...previous.savedSearches,
    ].slice(0, 10) }));
    notify('Подборка сохранена');
  }
  async function loadMore() {
    if (!response || loading || loadingMore || error || pageRequest.current) return;
    const controller = new AbortController(); pageRequest.current = controller;
    const version = generation.current;
    setLoadingMore(true); setPageError('');
    try {
      const result = await searchDirectory(query, filters, response.items.length, controller.signal);
      if (controller.signal.aborted || generation.current !== version) return;
      setResponse(previous => previous ? { ...result, offset: 0, items: [...previous.items, ...result.items.filter(item => !previous.items.some(old => old.person.id === item.person.id))] } : result);
    } catch (cause) {
      if (!controller.signal.aborted && generation.current === version) setPageError(cause instanceof Error ? cause.message : 'Не удалось загрузить следующую страницу.');
    } finally {
      if (pageRequest.current === controller) { pageRequest.current = null; setLoadingMore(false); }
    }
  }
  const interpreted = response?.interpreted;
  const interpretation = [
    interpreted?.salaryMax !== undefined ? 'Зарплата до ' + amount(interpreted.salaryMax) + ' ₽' : '',
    interpreted?.specialization ? specializationOptions.find(item => item.value === interpreted.specialization)?.label || interpreted.specialization : '',
    interpreted?.grade ? gradeOptions.find(item => item.value === interpreted.grade)?.label || interpreted.grade : '',
    interpreted?.format || '', interpreted?.city || '',
  ].filter(Boolean);
  const unavailable = Boolean(query && response?.model.status === 'unavailable');
  return <>
    <div className="page-heading"><h1>Кандидаты</h1><div className="button-group">
      <button className="icon-button save-search" aria-label="Сохранить подборку" title="Сохранить подборку" onClick={saveSearch}><Bookmark size={18} /></button>
      <div className="saved-control"><button className="button secondary compact" aria-expanded={showSaved} onClick={() => setShowSaved(!showSaved)}>Подборки<ChevronDown size={15} /></button>
        {showSaved && <div className="saved-popover">{state.savedSearches.length ? state.savedSearches.map(saved => <div className="saved-item" key={saved.id}>
          <button onClick={() => { setQuery(saved.query); setDraft(saved.query); setFilters(normalizeSearchFilters(saved.filters)); setShowSaved(false); }}>{saved.title}<ArrowUpRight size={15} /></button>
          <button className="icon-button" aria-label={'Удалить подборку ' + saved.title} onClick={() => update(previous => ({ ...previous, savedSearches: previous.savedSearches.filter(search => search.id !== saved.id) }))}><X size={14} /></button>
        </div>) : <p className="muted">Подборок пока нет</p>}</div>}
      </div></div></div>
    <p className="directory-intro">Поиск по смыслу. Опишите задачи, нужный опыт и условия предложения.</p>
    <form className="search-panel" onSubmit={submit}>
      <Search size={21} aria-hidden="true" /><input value={draft} onChange={event => setDraft(event.target.value)} maxLength={1200} aria-label="Потребность работодателя" placeholder="Например: разработчик сервисов на Python, удалённо, до 200 000 ₽" />
      {draft && <button type="button" className="icon-button search-clear" aria-label="Очистить поиск" onClick={() => { setDraft(''); setQuery(''); }}><X size={16} /></button>}
      <button className="button primary" type="submit">Подобрать</button>
    </form>
    {query && query !== draft.trim() && <p className="search-context" role="status">Результаты по запросу «{query}»</p>}
    {response?.query === query && interpretation.length > 0 && <div className="directory-interpretation" aria-label="Условия из запроса"><span>Учтено в запросе:</span>{interpretation.map(value => <span className="tag" key={value}>{value}</span>)}</div>}
    <button className="button secondary mobile-filter-button" onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters}><SlidersHorizontal size={16} />Фильтры{filterCount > 0 && ' · ' + filterCount}</button>
    <div className="search-layout">
      <aside className={'filters' + (showFilters ? ' filters-open' : '')} aria-label="Фильтры кандидатов">
        <div className="filter-heading"><h2>Фильтры</h2>{filterCount > 0 && <button className="text-button" onClick={() => setFilters(normalizeSearchFilters(defaultSearchFilters))}>Сбросить</button>}</div>
        <label className="field"><span>Специализация</span><select value={filters.specialization} onChange={event => change('specialization', event.target.value)}><option value="">Все направления</option>{specializationOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label>
        <fieldset className="filter-group"><legend>Грейд</legend><div className="segmented">{[{ value: '', label: 'Все' }, ...gradeOptions].map(({ value, label }) => <button key={value} type="button" aria-pressed={filters.grade === value} className={filters.grade === value ? 'selected' : ''} onClick={() => change('grade', value)}>{label}</button>)}</div></fieldset>
        <label className="field"><span>Формат работы</span><select value={filters.format} onChange={event => change('format', event.target.value)}><option value="">Любой</option><option>Удалённо</option><option>Гибрид</option><option>Офис</option></select></label>
        <fieldset className="filter-group"><legend>Стек</legend><div className="stack-filters">{filterStackOptions.map(skill => <button type="button" key={skill} className={'filter-chip' + (filters.stack.includes(skill) ? ' selected' : '')} aria-pressed={filters.stack.includes(skill)} onClick={() => change('stack', filters.stack.includes(skill) ? filters.stack.filter(value => value !== skill) : [...filters.stack, skill])}>{filters.stack.includes(skill) && <Check size={12} />}{skill}</button>)}</div></fieldset>
        <label className="checkbox-field fsp-filter"><input type="checkbox" checked={filters.fsp} onChange={event => change('fsp', event.target.checked)} /><span><Medal size={16} />Есть достижения ФСП</span></label>
        <details className="directory-extra"><summary>Дополнительные фильтры{extraCount > 0 ? ' · ' + extraCount : ''}</summary><div className="directory-extra-fields">
          <label className="field"><span>Город</span><select value={filters.city} onChange={event => change('city', event.target.value)}><option value="">Любой</option>{[...new Set([...options.cities, filters.city].filter(Boolean))].map(city => <option key={city}>{city}</option>)}</select></label>
          <label className="field"><span>Отрасль</span><select value={filters.industry} onChange={event => change('industry', event.target.value)}><option value="">Любая</option>{[...new Set([...options.industries, filters.industry].filter(Boolean))].map(industry => <option key={industry}>{industry}</option>)}</select></label>
          <label className="field"><span>Зарплата до, ₽/мес.</span><input type="number" min="0" max="10000000" step="1000" value={filters.salaryMax ?? ''} onChange={event => changeNumber('salaryMax', event.target.value)} placeholder="Без ограничения" /></label>
          <div className="directory-range">
            <label className="field"><span>Стаж от, лет</span><input type="number" min="0" max="100" step="0.5" value={years(filters.experienceMin)} onChange={event => changeNumber('experienceMin', event.target.value, 12)} /></label>
            <label className="field"><span>Стаж до, лет</span><input type="number" min="0" max="100" step="0.5" value={years(filters.experienceMax)} onChange={event => changeNumber('experienceMax', event.target.value, 12)} /></label>
          </div>
          {filters.experienceMin !== null && filters.experienceMax !== null && filters.experienceMin > filters.experienceMax && <p className="field-help">Начало диапазона больше конца. Измените границы стажа.</p>}
          <label className="field"><span>Занятость</span><select value={filters.employmentType} onChange={event => change('employmentType', event.target.value)}><option value="">Любая</option>{options.employmentTypes.map(value => <option key={value}>{value}</option>)}</select></label>
          <label className="field"><span>Язык</span><select value={filters.language} onChange={event => change('language', event.target.value)}><option value="">Любой</option>{options.languages.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="field"><span>Баллы теста от</span><input type="number" min="0" max="100" step="1" value={filters.minScore ?? ''} onChange={event => changeNumber('minScore', event.target.value)} placeholder="Из 100" /></label>
          <label className="checkbox-field"><input type="checkbox" checked={filters.hasPortfolio} onChange={event => change('hasPortfolio', event.target.checked)} /><span>Есть портфолио</span></label>
        </div></details>
      </aside>
      <section className="candidate-list" aria-label="Результаты подбора" aria-busy={loading || loadingMore}>
        <div className="list-heading"><span>{response ? countLabel(response.total) : 'Загружаем каталог…'}</span><span className="muted">{response?.query ? 'По смыслу запроса' : 'По профилю'}</span></div>
        <div className={loading ? 'directory-feedback' : 'sr-only'} role="status" aria-live="polite">{loading ? 'Подбираем кандидатов…' : !error && response ? 'Найдено: ' + countLabel(response.total) : ''}</div>
        {error && <div className="directory-error" role="alert"><p>{error}</p>{response && <p className="muted">Показаны предыдущие результаты.</p>}<button className="button secondary compact" onClick={() => setRetry(value => value + 1)}>Повторить поиск</button></div>}
        {!loading && !error && unavailable && <div className="directory-error" role="alert"><p>Поиск по смыслу сейчас недоступен.</p><button className="button secondary compact" onClick={() => setRetry(value => value + 1)}>Повторить поиск</button></div>}
        {!loading && !error && response?.warnings?.length ? <div className="directory-warnings">{response.warnings.map(warning => <p key={warning}>{warning}</p>)}</div> : null}
        {response?.items.map(({ person, reason }, index) => {
          const pending = state.invitations.some(invitation => invitation.companyId === state.company.id && invitation.candidateId === person.id && (invitation.status === 'sent' || invitation.status === 'viewed'));
          const demo = Boolean(person.synthetic);
          const category = person.confirmed;
          const salaryFrom = typeof person.salaryFrom === 'number' && Number.isFinite(person.salaryFrom) ? person.salaryFrom : null;
          const salaryTo = typeof person.salaryTo === 'number' && Number.isFinite(person.salaryTo) ? person.salaryTo : null;
          return <article className="candidate-row" key={person.id}>
            <button className={'avatar avatar-tone-' + (index % 4)} onClick={() => onProfile(person)} aria-label={'Открыть профиль ' + person.name}>{initials(person.name)}</button>
            <div className="candidate-main">
              <button className="person-link" onClick={() => onProfile(person)}>{person.name}{category && <BadgeCheck size={17} className="confirmed-icon" aria-label={demo ? 'Демонстрационная категория' : 'Категория подтверждена'} />}</button>{demo && <span className="directory-demo">Демо</span>}
              <p className="candidate-specialization">{specializationLabels[category?.specialization || person.specialization]}<span className="dot-divider">·</span>{category ? gradeLabels[category.grade] : 'Грейд не подтверждён'}</p>
              <span className="metadata"><MapPin size={13} />{person.city || 'Город не указан'}<span className="dot-divider">·</span>{person.experience}<span className="dot-divider">·</span>{person.format}</span>
              {(salaryFrom !== null || salaryTo !== null) && <p className="directory-salary">{salaryFrom !== null && salaryTo !== null ? amount(salaryFrom) + '–' + amount(salaryTo) : salaryFrom !== null ? 'от ' + amount(salaryFrom) : 'до ' + amount(salaryTo!)} ₽/мес.</p>}
              <div className="tags">{person.stack.slice(0, 4).map(skill => <span className="tag" key={skill}>{skill}</span>)}{person.achievements.length > 0 && <span className="tag fsp-tag"><Medal size={12} />ФСП</span>}</div>
            </div>
            <div className="candidate-action"><div className="score-with-context"><div className="test-score" title={category ? (demo ? 'Демонстрационный результат теста' : 'Результат теста') + ': ' + category.score + ' из 100' : 'Тест не пройден'}><strong>{category?.score ?? '—'}<span>/100</span></strong></div><details className="match-details" name="matching"><summary aria-label={'Почему подходит ' + person.name} title="Почему подходит"><Info size={15} /></summary><p>{reason}</p></details></div>
              <button className="button secondary compact" disabled={pending} onClick={() => onInvite(person)}>{pending ? 'Отправлено' : 'Пригласить'}</button>
            </div>
          </article>;
        })}
        {!loading && !error && !unavailable && response?.items.length === 0 && <div className="empty-state"><Search size={30} /><h3>Кандидатов пока нет</h3><p>Попробуйте изменить запрос или фильтры.</p><button className="button secondary" onClick={reset}>Сбросить поиск</button></div>}
        {response && response.items.length < response.total && <div className="directory-pagination"><span className="muted">Показано {response.items.length} из {response.total}</span><button className="button secondary" disabled={loading || loadingMore || Boolean(error)} onClick={() => void loadMore()}>{loadingMore ? 'Загружаем…' : 'Показать ещё'}</button></div>}
        {pageError && <div className="directory-error" role="alert"><p>{pageError}</p><button className="button secondary compact" disabled={loading || loadingMore} onClick={() => void loadMore()}>Повторить загрузку</button></div>}
      </section>
    </div>
    <p className="directory-demo-note">Профили с отметкой «Демо» вымышлены. Их грейды, достижения и результаты тестов приведены для демонстрации.</p>
  </>;
}
