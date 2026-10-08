import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUpRight, BadgeCheck, Bookmark, Check, ChevronDown, Heart, Info, MapPin, Medal, Pencil, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import { CandidateDeck } from '../components/CandidateDeck';
import { defaultStackOptions, gradeLabels, gradeOptions, initials, isSpecialization, specializationLabels, specializationNames, specializationOptions, specializationStacks, type Candidate, type HiringNeed, type PlatformState } from '../model';
import { HIRING_NEED_LIMITS, MAX_HIRING_NEEDS } from '../../../shared/hiring-needs.ts';
import { defaultSearchFilters, employmentTypes, languageOptions, normalizeSearchFilters, type SearchFilters } from '../../../shared/search.ts';
import { directoryOptions, searchDirectory, type DirectoryCategorySelection, type DirectoryOptions, type DirectorySearch } from '../directory-api';

type Props = {
  state: PlatformState; candidates: Candidate[];
  update: (fn: (state: PlatformState) => PlatformState) => void;
  onProfile: (person: Candidate) => void; onInvite: (person: Candidate) => void;
  notify: (message: string) => void; directoryRevision?: number;
};
function readSearch(): { draft: string; query: string; filters: SearchFilters; needId: string } {
  try {
    const stored = JSON.parse(sessionStorage.getItem('predel:search') || 'null');
    if (typeof stored?.query === 'string' && typeof stored.draft === 'string') return { draft: stored.draft, query: stored.query, filters: normalizeSearchFilters(stored.filters), needId: typeof stored.needId === 'string' ? stored.needId : '' };
  } catch { /* Search remains usable without browser storage. */ }
  return { draft: '', query: '', filters: normalizeSearchFilters(defaultSearchFilters), needId: '' };
}
type NeedEditor = HiringNeed & { stackText: string };
const amount = (value: number) => new Intl.NumberFormat('ru-RU').format(value);
const years = (months: number | null) => months === null ? '' : Number((months / 12).toFixed(2));
function readMode(): 'list' | 'deck' {
  try { return sessionStorage.getItem('predel:directory-mode') === 'deck' ? 'deck' : 'list'; }
  catch { return 'list'; }
}
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
  const [showNeeds, setShowNeeds] = useState(false);
  const [needId, setNeedId] = useState(initialSearch.needId);
  const [needEditor, setNeedEditor] = useState<NeedEditor | null>(null);
  const [needError, setNeedError] = useState('');
  const [category, setCategory] = useState<DirectoryCategorySelection | null>(null);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [response, setResponse] = useState<DirectorySearch | null>(null);
  const [options, setOptions] = useState<DirectoryOptions>({ cities: [], industries: [], languages: languageOptions, employmentTypes });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [pageError, setPageError] = useState('');
  const [pageNotice, setPageNotice] = useState('');
  const [exhausted, setExhausted] = useState(false);
  const [retry, setRetry] = useState(0);
  const [mode, setMode] = useState(readMode);
  const [favorites, setFavorites] = useState(false);
  const decisions = state.candidateDecisions || [];
  const likedCount = decisions.filter(item => item.decision === 'liked').length;
  const pendingIds = new Set(state.invitations.filter(item => item.companyId === state.company.id
    && (item.status === 'sent' || item.status === 'viewed')).map(item => item.candidateId));
  const generation = useRef(0);
  const pageRequest = useRef<AbortController | null>(null);
  const pageOffset = useRef(0);
  const previousRequest = useRef<{ query: string; retry: number; revision: number } | null>(null);
  const [responseSearch, setResponseSearch] = useState('');
  const requestSearch = JSON.stringify([query, filters, category, retry, directoryRevision]);
  const recommendationsCurrent = !loading && !error && responseSearch === requestSearch;
  const categories = response?.categories || [];
  const visibleCategories = showAllCategories ? categories : categories.filter((item, index) => index < 6
    || category?.specialization === item.specialization && category.grade === item.grade);
  const needs = state.hiringNeeds || [];
  const filterStackOptions = [...new Set([...(isSpecialization(filters.specialization) ? specializationStacks[filters.specialization] : defaultStackOptions), ...filters.stack])];
  const filterCount = Object.entries(filters).reduce((count, [key, value]) => count + (key === 'stack' ? filters.stack.length : Number(value !== '' && value !== null && value !== false)), 0);
  const extraCount = ['city', 'industry', 'salaryMax', 'experienceMin', 'experienceMax', 'employmentType', 'language', 'hasPortfolio', 'minScore']
    .filter(key => { const value = filters[key as keyof SearchFilters]; return value !== '' && value !== null && value !== false; }).length;
  useEffect(() => {
    try { sessionStorage.setItem('predel:search', JSON.stringify({ draft, query, filters, needId })); }
    catch { /* Search remains usable without persistence. */ }
  }, [draft, query, filters, needId]);
  useEffect(() => {
    try { sessionStorage.setItem('predel:directory-mode', mode); }
    catch { /* The selected view remains usable without browser storage. */ }
  }, [mode]);
  useEffect(() => { setShowAllCategories(false); }, [query, filters, needId]);
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
    setLoading(true); setLoadingMore(false); setError(''); setPageError(''); setPageNotice('');
    const timer = window.setTimeout(() => {
      void searchDirectory(query, filters, 0, controller.signal, category).then(result => {
        if (!controller.signal.aborted && generation.current === version) {
          pageOffset.current = result.offset + result.items.length;
          setExhausted(result.items.length === 0 || pageOffset.current >= result.total);
          setResponse(result);
          setResponseSearch(requestSearch);
        }
      }).catch(cause => {
        if (!controller.signal.aborted && generation.current === version) setError(cause instanceof Error ? cause.message : 'Не удалось получить подборку.');
      }).finally(() => {
        if (!controller.signal.aborted && generation.current === version) setLoading(false);
      });
    }, immediate ? 0 : 250);
    return () => { window.clearTimeout(timer); controller.abort(); pageRequest.current?.abort(); };
  }, [query, filters, category, retry, directoryRevision]);
  const change = <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) => {
    setCategory(null); setNeedId(''); setFilters(previous => ({ ...previous, [key]: value }));
  };
  const changeNumber = (key: 'salaryMax' | 'experienceMin' | 'experienceMax' | 'minScore', value: string, multiplier = 1) => {
    const maximum = key === 'minScore' ? 100 : key === 'salaryMax' ? 10_000_000 : 1200;
    change(key, value === '' ? null : Math.min(maximum, Math.max(0, Math.round(Number(value) * multiplier))));
  };
  const reset = () => { setCategory(null); setNeedId(''); setFilters(normalizeSearchFilters(defaultSearchFilters)); setQuery(''); setDraft(''); };
  function submit(event: FormEvent) {
    event.preventDefault(); setCategory(null);
    if (query !== draft.trim()) setNeedId('');
    setQuery(draft.trim()); setRetry(value => value + 1);
  }
  function selectNeed(need: HiringNeed) {
    setNeedId(need.id); setQuery(need.tasks); setDraft(need.tasks);
    setFilters(normalizeSearchFilters(need.filters)); setCategory(null); setRetry(value => value + 1);
  }
  function editNeed(need?: HiringNeed) {
    const snapshot = normalizeSearchFilters(need?.filters || filters);
    setNeedEditor({ id: need?.id || '', title: need?.title || '', team: need?.team || '', tasks: need?.tasks ?? draft.trim(), filters: snapshot, stackText: snapshot.stack.join(', ') });
    setNeedError(''); setShowNeeds(true);
  }
  function saveNeed(event: FormEvent) {
    event.preventDefault();
    if (!needEditor) return;
    const savedFilters = normalizeSearchFilters({ ...needEditor.filters, stack: needEditor.stackText.split(',').map(value => value.trim()).filter(Boolean) });
    const title = needEditor.title.trim(), tasks = needEditor.tasks.trim();
    if (!title) { setNeedError('Добавьте название потребности.'); return; }
    if (!tasks && !savedFilters.specialization && !savedFilters.stack.length) { setNeedError('Добавьте задачи, специализацию или стек.'); return; }
    if (!needs.some(item => item.id === needEditor.id) && needs.length >= MAX_HIRING_NEEDS) { setNeedError('Сохранено максимум потребностей: ' + MAX_HIRING_NEEDS + '.'); return; }
    const need: HiringNeed = { id: needEditor.id || crypto.randomUUID(), title, team: needEditor.team.trim(), tasks, filters: savedFilters };
    update(previous => {
      const currentNeeds = previous.hiringNeeds || [];
      const existing = currentNeeds.some(item => item.id === need.id);
      if (!existing && currentNeeds.length >= MAX_HIRING_NEEDS) return previous;
      return { ...previous, hiringNeeds: existing ? currentNeeds.map(item => item.id === need.id ? need : item) : [need, ...currentNeeds] };
    });
    selectNeed(need); setNeedEditor(null); setNeedError('');
  }
  function deleteNeed(need: HiringNeed) {
    update(previous => ({ ...previous, hiringNeeds: (previous.hiringNeeds || []).filter(item => item.id !== need.id) }));
    if (needId === need.id) setNeedId('');
    if (needEditor?.id === need.id) { setNeedEditor(null); setNeedError(''); }
  }
  function saveSearch() {
    const title = query || [isSpecialization(filters.specialization) ? specializationNames[filters.specialization] : '', filters.grade, ...filters.stack].filter(Boolean).join(' · ') || 'Все кандидаты';
    update(previous => ({ ...previous, savedSearches: [
      { id: crypto.randomUUID(), title, query, filters: normalizeSearchFilters(filters) }, ...previous.savedSearches,
    ].slice(0, 10) }));
    notify('Подборка сохранена');
  }
  function decide(candidateId: string, decision: 'liked' | 'passed' | null) {
    update(previous => ({ ...previous, candidateDecisions: [
      ...(previous.candidateDecisions || []).filter(item => item.candidateId !== candidateId),
      ...(decision ? [{ candidateId, decision, date: new Date().toISOString() }] : []),
    ] }));
  }
  function resetPassed() {
    const ids = new Set(response?.items.map(item => item.person.id));
    update(previous => ({ ...previous, candidateDecisions: (previous.candidateDecisions || [])
      .filter(item => item.decision !== 'passed' || !ids.has(item.candidateId)) }));
  }
  async function loadMore() {
    if (!response || loading || loadingMore || error || exhausted || pageRequest.current) return;
    const controller = new AbortController(); pageRequest.current = controller;
    const version = generation.current;
    setLoadingMore(true); setPageError('');
    try {
      const requestedOffset = pageOffset.current;
      const result = await searchDirectory(query, filters, requestedOffset, controller.signal, category);
      if (controller.signal.aborted || generation.current !== version) return;
      const nextOffset = result.offset + result.items.length;
      pageOffset.current = Math.max(requestedOffset, nextOffset);
      const atEnd = result.items.length === 0 || nextOffset <= requestedOffset || nextOffset >= result.total;
      setExhausted(atEnd);
      const added = result.items.filter(item => !response.items.some(old => old.person.id === item.person.id));
      const items = [...response.items, ...added];
      if (added.length !== result.items.length || atEnd && items.length !== result.total) {
        setPageNotice('Каталог изменился. Обновите подборку.');
      }
      setResponse({ ...result, offset: 0, items });
    } catch (cause) {
      if (!controller.signal.aborted && generation.current === version) setPageError(cause instanceof Error ? cause.message : 'Не удалось загрузить следующую страницу.');
    } finally {
      if (pageRequest.current === controller) { pageRequest.current = null; setLoadingMore(false); }
    }
  }
  const interpreted = response?.interpreted;
  const effective = response?.effectiveFilters;
  const constraintLabel = (key: string, value: string) => key === 'specialization'
    ? specializationOptions.find(item => item.value === value)?.label || value
    : key === 'grade' ? gradeLabels[value as keyof typeof gradeLabels] || value
    : key === 'language' ? languageOptions.find(item => item.value === value)?.label || value : value;
  const interpretation = [
    interpreted?.salaryMax !== undefined ? 'Зарплата до ' + amount(effective?.salaryMax ?? interpreted.salaryMax) + ' ₽' : '',
    interpreted?.specialization ? specializationOptions.find(item => item.value === interpreted.specialization)?.label || interpreted.specialization : '',
    interpreted?.grade ? gradeOptions.find(item => item.value === interpreted.grade)?.label || interpreted.grade : '',
    interpreted?.format || '', interpreted?.city || '',
    interpreted?.experienceMin !== undefined ? 'Стаж от ' + years(effective?.experienceMin ?? interpreted.experienceMin) + ' лет' : '',
    interpreted?.experienceMax !== undefined ? 'Стаж до ' + years(effective?.experienceMax ?? interpreted.experienceMax) + ' лет' : '',
    ...(interpreted?.stack || []),
    interpreted?.language ? constraintLabel('language', interpreted.language) : '',
    interpreted?.hasPortfolio ? 'Есть портфолио' : '',
    ...Object.entries(interpreted?.queryConstraints?.any || {}).filter(([, values]) => values.length > 1)
      .map(([key, values]) => values.map(value => constraintLabel(key, value)).join(' или ')),
    ...Object.entries(interpreted?.queryConstraints?.all || {}).filter(([key, values]) => key === 'language' && values.length > 1)
      .map(([key, values]) => values.map(value => constraintLabel(key, value)).join(' и ')),
    ...Object.entries(interpreted?.queryConstraints?.groups || {})
      .flatMap(([key, groups]) => groups.map(values => values.map(value => constraintLabel(key, value)).join(' или '))),
    ...Object.entries(interpreted?.queryConstraints?.exclude || {})
      .map(([key, values]) => 'Без: ' + values.map(value => constraintLabel(key, value)).join(', ')),
  ].filter(Boolean);
  const unavailable = Boolean(query && response?.model.status === 'unavailable');
  return <>
    <div className="page-heading employer-heading"><h1>Кандидаты</h1><div className="button-group">
      <button className="button secondary compact" aria-expanded={showNeeds} aria-controls="hiring-needs" onClick={() => setShowNeeds(!showNeeds)}>Потребности<ChevronDown size={15} /></button>
      <button className="icon-button save-search" aria-label="Сохранить подборку" title="Сохранить подборку" onClick={saveSearch}><Bookmark size={18} /></button>
      <div className="saved-control"><button className="button secondary compact" aria-expanded={showSaved} onClick={() => setShowSaved(!showSaved)}>Подборки<ChevronDown size={15} /></button>
        {showSaved && <div className="saved-popover">{state.savedSearches.length ? state.savedSearches.map(saved => <div className="saved-item" key={saved.id}>
          <button onClick={() => { setQuery(saved.query); setDraft(saved.query); setFilters(normalizeSearchFilters(saved.filters)); setCategory(null); setNeedId(''); setShowSaved(false); }}>{saved.title}<ArrowUpRight size={15} /></button>
          <button className="icon-button" aria-label={'Удалить подборку ' + saved.title} onClick={() => update(previous => ({ ...previous, savedSearches: previous.savedSearches.filter(search => search.id !== saved.id) }))}><X size={14} /></button>
        </div>) : <p className="muted">Подборок пока нет</p>}</div>}
      </div></div></div>
    {showNeeds && <section className="hiring-needs" id="hiring-needs" aria-label="Потребности работодателя">
      <div className="hiring-needs-heading"><h2>Потребности</h2><button className="button secondary compact" disabled={needs.length >= MAX_HIRING_NEEDS} title={needs.length >= MAX_HIRING_NEEDS ? 'Сохранено максимум потребностей: ' + MAX_HIRING_NEEDS : undefined} onClick={() => editNeed()}><Plus size={15} />Новая потребность</button></div>
      {needs.length > 0 && <div className="hiring-needs-list">{needs.map(need => <div className="hiring-need" key={need.id}>
        <button className="hiring-need-select" aria-label={'Подобрать для ' + need.title} aria-pressed={needId === need.id} title={need.team || undefined} onClick={() => selectNeed(need)}>{need.title}<ArrowUpRight size={14} /></button>
        <button className="icon-button" aria-label={'Изменить потребность ' + need.title} title="Изменить" onClick={() => editNeed(need)}><Pencil size={14} /></button>
        <button className="icon-button" aria-label={'Удалить потребность ' + need.title} title="Удалить" onClick={() => deleteNeed(need)}><X size={14} /></button>
      </div>)}</div>}
      {!needs.length && !needEditor && <p className="muted hiring-needs-empty">Сохраните задачи и условия для команды.</p>}
      {needEditor && <form className="hiring-need-form" aria-label="Потребность команды" onSubmit={saveNeed}>
        <div className="form-grid">
          <label className="field"><span>Название потребности</span><input aria-label="Название потребности" value={needEditor.title} maxLength={HIRING_NEED_LIMITS.title} required onChange={event => setNeedEditor({ ...needEditor, title: event.target.value })} placeholder="Например: разработчик платёжного сервиса" /></label>
          <label className="field"><span>Команда</span><textarea aria-label="Команда" value={needEditor.team} maxLength={HIRING_NEED_LIMITS.team} rows={2} onChange={event => setNeedEditor({ ...needEditor, team: event.target.value })} placeholder="Чем занимается команда" /></label>
        </div>
        <label className="field"><span>Задачи</span><textarea aria-label="Задачи" value={needEditor.tasks} maxLength={HIRING_NEED_LIMITS.tasks} rows={3} onChange={event => setNeedEditor({ ...needEditor, tasks: event.target.value })} placeholder="Что предстоит делать и какой опыт нужен" /></label>
        <div className="form-grid">
          <label className="field"><span>Специализация потребности</span><select aria-label="Специализация потребности" value={needEditor.filters.specialization} onChange={event => setNeedEditor({ ...needEditor, filters: { ...needEditor.filters, specialization: event.target.value } })}><option value="">Любая</option>{specializationOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="field"><span>Грейд потребности</span><select aria-label="Грейд потребности" value={needEditor.filters.grade} onChange={event => setNeedEditor({ ...needEditor, filters: { ...needEditor.filters, grade: event.target.value } })}><option value="">Любой</option>{gradeOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label>
        </div>
        <label className="field"><span>Стек потребности</span><input aria-label="Стек потребности" value={needEditor.stackText} maxLength={2000} onChange={event => setNeedEditor({ ...needEditor, stackText: event.target.value })} placeholder="Python, PostgreSQL, Docker" /></label>
        {needError && <p className="hiring-need-error" role="alert">{needError}</p>}
        <div className="hiring-need-actions"><button type="button" className="text-button" onClick={() => setNeedEditor({ ...needEditor, filters: normalizeSearchFilters(filters), stackText: filters.stack.join(', ') })}>Взять текущие фильтры</button><div className="button-group"><button type="button" className="button secondary compact" onClick={() => { setNeedEditor(null); setNeedError(''); }}>Отмена</button><button type="submit" className="button primary compact">Сохранить потребность</button></div></div>
      </form>}
    </section>}
    <p className="directory-intro">Поиск по смыслу. Опишите задачи, нужный опыт и условия предложения.</p>
    <form className="search-panel" onSubmit={submit}>
      <Search size={21} aria-hidden="true" /><input value={draft} onChange={event => setDraft(event.target.value)} maxLength={1200} aria-label="Потребность работодателя" placeholder="Например: разработчик сервисов на Python, удалённо, до 200 000 ₽" />
      {draft && <button type="button" className="icon-button search-clear" aria-label="Очистить поиск" onClick={() => { setDraft(''); setQuery(''); setCategory(null); setNeedId(''); }}><X size={16} /></button>}
      <button className="button primary" type="submit">Подобрать</button>
    </form>
    {query && query !== draft.trim() && <p className="search-context" role="status">Результаты по запросу «{query}»</p>}
    {category && !recommendationsCurrent && <div className="directory-category-context"><span>{specializationLabels[category.specialization]} · {gradeLabels[category.grade]}</span><button className="icon-button" aria-label="Сбросить категорию" title="Сбросить категорию" onClick={() => setCategory(null)}><X size={14} /></button></div>}
    {recommendationsCurrent && Boolean(response?.categories?.length) && <section className="recommended-categories" aria-label="Рекомендованные категории"><span>{query ? 'Рекомендуемые категории' : 'Категории'}</span><div className="recommended-category-options">
      <button className="filter-chip" aria-label="Все категории" aria-pressed={!category} onClick={() => setCategory(null)}>Все</button>
      {visibleCategories.map(item => <button className="filter-chip" key={item.specialization + ':' + item.grade} aria-label={specializationLabels[item.specialization] + ' · ' + gradeLabels[item.grade] + ' · ' + countLabel(item.count)} aria-pressed={category?.specialization === item.specialization && category.grade === item.grade}
        title={item.reason} onClick={() => setCategory({ specialization: item.specialization, grade: item.grade })}>{specializationLabels[item.specialization]}<span className="dot-divider">·</span>{gradeLabels[item.grade]}<span className="category-count">{item.count}</span>{item.approximate && <Info size={13} aria-label="Приблизительное совпадение" />}</button>)}
      {categories.length > 6 && <button className="text-button category-expand" aria-expanded={showAllCategories} onClick={() => setShowAllCategories(!showAllCategories)}>{showAllCategories ? 'Скрыть категории' : 'Ещё категории'}</button>}
    </div></section>}
    {response?.query === query && interpretation.length > 0 && <div className="directory-interpretation" aria-label="Условия из запроса"><span>Учтено в запросе:</span>{interpretation.map(value => <span className="tag" key={value}>{value}</span>)}</div>}
    <button className="button secondary mobile-filter-button" onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters}><SlidersHorizontal size={16} />Фильтры{filterCount > 0 && ' · ' + filterCount}</button>
    <div className="search-layout">
      <aside className={'filters' + (showFilters ? ' filters-open' : '')} aria-label="Фильтры кандидатов">
        <div className="filter-heading"><h2>Фильтры</h2>{filterCount > 0 && <button className="text-button" onClick={() => { setFilters(normalizeSearchFilters(defaultSearchFilters)); setCategory(null); setNeedId(''); }}>Сбросить</button>}</div>
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
        <div className="list-heading"><span>{response ? countLabel(response.total) : 'Загружаем каталог…'}</span><div className="directory-view-controls">
          {mode === 'deck' && <button className={'directory-favorites' + (favorites ? ' selected' : '')} aria-label="Избранные кандидаты" title="Избранные кандидаты"
            aria-pressed={favorites} onClick={() => setFavorites(!favorites)}><Heart size={17} fill={favorites ? 'currentColor' : 'none'} />{likedCount > 0 && <span>{likedCount}</span>}</button>}
          <div className="directory-view-switch" role="group" aria-label="Режим подбора">
            <button aria-pressed={mode === 'list'} onClick={() => setMode('list')}>Обычный режим</button>
            <button aria-pressed={mode === 'deck'} onClick={() => setMode('deck')}>Предельный режим</button>
          </div>
        </div></div>
        <div className={loading ? 'directory-feedback' : 'sr-only'} role="status" aria-live="polite">{loading ? 'Подбираем кандидатов…' : !error && response ? 'Найдено: ' + countLabel(response.total) : ''}</div>
        {error && <div className="directory-error" role="alert"><p>{error}</p>{response && <p className="muted">Показаны предыдущие результаты.</p>}<button className="button secondary compact" onClick={() => setRetry(value => value + 1)}>Повторить поиск</button></div>}
        {!loading && !error && unavailable && <div className="directory-error" role="alert"><p>Поиск по смыслу сейчас недоступен.</p><button className="button secondary compact" onClick={() => setRetry(value => value + 1)}>Повторить поиск</button></div>}
        {!loading && !error && response?.warnings?.length ? <div className="directory-warnings">{response.warnings.map(warning => <p key={warning}>{warning}</p>)}</div> : null}
        {mode === 'deck' && <CandidateDeck key={JSON.stringify([query, filters, category, favorites])}
          items={(response?.items || []).filter(item => item.person.id !== state.profile.id)} decisions={decisions} favorites={favorites}
          loading={loading} loadingMore={loadingMore} failed={Boolean(error || pageError || unavailable)}
          hasMore={Boolean(response && !exhausted && response.items.length < response.total)} onLoadMore={() => void loadMore()}
          onDecision={decide} onReset={resetPassed} onProfile={onProfile} onInvite={onInvite} pendingIds={pendingIds} />}
        {mode === 'list' && response?.items.map(({ person, reason }, index) => {
          const pending = state.invitations.some(invitation => invitation.companyId === state.company.id && invitation.candidateId === person.id && (invitation.status === 'sent' || invitation.status === 'viewed'));
          const category = person.confirmed;
          const salaryFrom = typeof person.salaryFrom === 'number' && Number.isFinite(person.salaryFrom) ? person.salaryFrom : null;
          const salaryTo = typeof person.salaryTo === 'number' && Number.isFinite(person.salaryTo) ? person.salaryTo : null;
          return <article className="candidate-row" key={person.id}>
            <button className={'avatar avatar-tone-' + (index % 4)} onClick={() => onProfile(person)} aria-label={'Открыть профиль ' + person.name}>{initials(person.name)}</button>
            <div className="candidate-main">
              <button className="person-link" onClick={() => onProfile(person)}>{person.name}{category && <BadgeCheck size={17} className="confirmed-icon" aria-label={person.synthetic ? 'Грейд' : 'Категория подтверждена'} />}</button>
              <p className="candidate-specialization">{specializationLabels[category?.specialization || person.specialization]}<span className="dot-divider">·</span>{category ? gradeLabels[category.grade] : 'Грейд не подтверждён'}</p>
              {!category && <p className="field-caption">Желаемый грейд: {gradeLabels[person.desiredGrade]}</p>}
              <span className="metadata"><MapPin size={13} />{person.city || 'Город не указан'}<span className="dot-divider">·</span>{person.experience}<span className="dot-divider">·</span>{person.format}</span>
              {(salaryFrom !== null || salaryTo !== null) && <p className="directory-salary">{salaryFrom !== null && salaryTo !== null ? amount(salaryFrom) + '–' + amount(salaryTo) : salaryFrom !== null ? 'от ' + amount(salaryFrom) : 'до ' + amount(salaryTo!)} ₽/мес.</p>}
              <div className="tags">{person.demoProfile && <span className="tag" title="Вымышленный профиль для проверки подбора">Демо</span>}{person.stack.slice(0, 4).map(skill => <span className="tag" key={skill}>{skill}</span>)}{person.achievements.length > 0 && <span className="tag fsp-tag" title={person.synthetic ? 'ФСП · демо: вымышленные результаты' : person.fspEvidence?.mode === 'demo' ? 'Вымышленные достижения; личность ФСП не подтверждена' : 'Сведения ФСП из профиля'}><Medal size={12} />{person.synthetic || person.fspEvidence?.mode === 'demo' ? 'ФСП · демо' : 'ФСП'}</span>}</div>
            </div>
            <div className="candidate-action"><div className="score-with-context"><div className="test-score" title={category ? 'Баллы теста: ' + category.score + ' из 100' : 'Категория не подтверждена'}><strong>{category?.score ?? '—'}{category && <span>/100</span>}</strong></div><details className="match-details" name="matching"><summary aria-label={'Почему подходит ' + person.name} title="Почему подходит"><Info size={15} /></summary><p>{reason}</p></details></div>
              {!person.demoProfile && <button className="button secondary compact" disabled={pending} onClick={() => onInvite(person)}>{pending ? 'Отправлено' : 'Пригласить'}</button>}
            </div>
          </article>;
        })}
        {mode === 'list' && !loading && !error && !unavailable && response?.items.length === 0 && <div className="empty-state"><Search size={30} /><h3>Кандидатов пока нет</h3><p>Попробуйте изменить запрос или фильтры.</p><button className="button secondary" onClick={reset}>Сбросить поиск</button></div>}
        {mode === 'list' && response && !exhausted && response.items.length < response.total && <div className="directory-pagination"><span className="muted">Показано {response.items.length} из {response.total}</span><button className="button secondary" disabled={loading || loadingMore || Boolean(error)} onClick={() => void loadMore()}>{loadingMore ? 'Загружаем…' : 'Показать ещё'}</button></div>}
        {pageNotice && <div className="directory-warnings"><p>{pageNotice}</p><button className="text-button" disabled={loading || loadingMore} onClick={() => setRetry(value => value + 1)}>Обновить подборку</button></div>}
        {pageError && <div className="directory-error" role="alert"><p>{pageError}</p><button className="button secondary compact" disabled={loading || loadingMore} onClick={() => void loadMore()}>Повторить загрузку</button></div>}
      </section>
    </div>
  </>;
}
