import { useEffect, useState, type FormEvent } from 'react';
import { ArrowUpRight, BadgeCheck, Bookmark, Check, ChevronDown, Info, MapPin, Medal, Search, SlidersHorizontal, X } from 'lucide-react';
import {
  defaultStackOptions, emptyFilters, gradeLabels, gradeOptions, initials, isSpecialization, searchCandidates, specializationLabels, specializationNames, specializationOptions, specializationStacks,
  type Candidate, type Filters, type PlatformState,
} from '../model';

type Props = {
  state: PlatformState;
  candidates: Candidate[];
  update: (fn: (state: PlatformState) => PlatformState) => void;
  onProfile: (person: Candidate) => void;
  onInvite: (person: Candidate) => void;
  notify: (message: string) => void;
};

function readSearch(): { draft: string; query: string; filters: Filters } {
  try {
    const stored = JSON.parse(sessionStorage.getItem('predel:search') || 'null');
    if (typeof stored?.query === 'string' && typeof stored.draft === 'string'
      && typeof stored.filters?.specialization === 'string' && typeof stored.filters.grade === 'string'
      && typeof stored.filters.format === 'string' && typeof stored.filters.fsp === 'boolean'
      && Array.isArray(stored.filters.stack)) return stored;
  } catch { /* Fall back when browser storage is unavailable. */ }
  return { draft: '', query: '', filters: { ...emptyFilters, stack: [] } };
}

export function Employer({ state, candidates, update, onProfile, onInvite, notify }: Props) {
  const [initialSearch] = useState(readSearch);
  const [draft, setDraft] = useState(initialSearch.draft);
  const [query, setQuery] = useState(initialSearch.query);
  const [filters, setFilters] = useState<Filters>(initialSearch.filters);
  const [showFilters, setShowFilters] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const results = searchCandidates(candidates, filters, query);
  const filterStackOptions = [...new Set([...(isSpecialization(filters.specialization) ? specializationStacks[filters.specialization] : defaultStackOptions), ...filters.stack])];
  const filterCount = Number(Boolean(filters.specialization)) + Number(Boolean(filters.grade))
    + Number(Boolean(filters.format)) + filters.stack.length + Number(filters.fsp);
  useEffect(() => {
    try { sessionStorage.setItem('predel:search', JSON.stringify({ draft, query, filters })); }
    catch { /* The current search remains usable without persistence. */ }
  }, [draft, query, filters]);
  const change = (key: keyof Filters, value: string | string[] | boolean) => setFilters(previous => ({ ...previous, [key]: value }));
  function submit(event: FormEvent) { event.preventDefault(); setQuery(draft.trim()); }
  function saveSearch() {
    const title = query || [isSpecialization(filters.specialization) ? specializationNames[filters.specialization] : '', filters.grade, ...filters.stack].filter(Boolean).join(' · ') || 'Все кандидаты';
    update(previous => ({
      ...previous, savedSearches: [
        { id: crypto.randomUUID(), title, query, filters: { ...filters, stack: [...filters.stack] } },
        ...previous.savedSearches,
      ].slice(0, 10),
    }));
    notify('Подборка сохранена');
  }
  return <>
    <div className="page-heading"><h1>Кандидаты</h1>
      <div className="button-group">
      <button className="icon-button save-search" aria-label="Сохранить подборку" title="Сохранить подборку" onClick={saveSearch}><Bookmark size={18} /></button>
      <div className="saved-control">
        <button className="button secondary compact" aria-expanded={showSaved} onClick={() => setShowSaved(!showSaved)}>Подборки<ChevronDown size={15} /></button>
        {showSaved && <div className="saved-popover">
          {state.savedSearches.length ? state.savedSearches.map(saved => <div className="saved-item" key={saved.id}>
            <button onClick={() => {
              setQuery(saved.query); setDraft(saved.query); setFilters({ ...saved.filters, stack: [...saved.filters.stack] }); setShowSaved(false);
            }}>{saved.title}<ArrowUpRight size={15} /></button>
            <button className="icon-button" aria-label={'Удалить подборку ' + saved.title} onClick={() => update(previous => ({ ...previous, savedSearches: previous.savedSearches.filter(search => search.id !== saved.id) }))}><X size={14} /></button>
          </div>) : <p className="muted">Подборок пока нет</p>}
        </div>}
      </div></div>
    </div>
    <form className="search-panel" onSubmit={submit}>
      <Search size={21} aria-hidden="true" />
      <input value={draft} onChange={event => setDraft(event.target.value)} aria-label="Потребность работодателя" placeholder="Специализация, грейд, стек…" />
      {draft && <button type="button" className="icon-button search-clear" aria-label="Очистить поиск" onClick={() => { setDraft(''); setQuery(''); }}><X size={16} /></button>}
      <button className="button primary" type="submit">Подобрать</button>
    </form>
    {query && query !== draft.trim() && <p className="search-context" role="status">Результаты по запросу «{query}»</p>}
    <button className="button secondary mobile-filter-button" onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters}><SlidersHorizontal size={16} />Фильтры{filterCount > 0 && ' · ' + filterCount}</button>
    <div className="search-layout">
      <aside className={'filters' + (showFilters ? ' filters-open' : '')} aria-label="Фильтры кандидатов">
        <div className="filter-heading"><h2>Фильтры</h2>{filterCount > 0 && <button className="text-button" onClick={() => setFilters({ ...emptyFilters, stack: [] })}>Сбросить</button>}</div>
        <label className="field"><span>Специализация</span><select value={filters.specialization} onChange={event => change('specialization', event.target.value)}><option value="">Все направления</option>{specializationOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label>
        <fieldset className="filter-group"><legend>Грейд</legend><div className="segmented">{[{ value: '', label: 'Все' }, ...gradeOptions].map(({ value, label }) => <button key={value} type="button" aria-pressed={filters.grade === value} className={filters.grade === value ? 'selected' : ''} onClick={() => change('grade', value)}>{label}</button>)}</div></fieldset>
        <label className="field"><span>Формат работы</span><select value={filters.format} onChange={event => change('format', event.target.value)}><option value="">Любой</option><option>Удалённо</option><option>Гибрид</option><option>Офис</option></select></label>
        <fieldset className="filter-group"><legend>Стек</legend><div className="stack-filters">{filterStackOptions.map(skill => <button type="button" key={skill} className={'filter-chip' + (filters.stack.includes(skill) ? ' selected' : '')} aria-pressed={filters.stack.includes(skill)} onClick={() => change('stack', filters.stack.includes(skill) ? filters.stack.filter(value => value !== skill) : [...filters.stack, skill])}>{filters.stack.includes(skill) && <Check size={12} />}{skill}</button>)}</div></fieldset>
        <label className="checkbox-field fsp-filter"><input type="checkbox" checked={filters.fsp} onChange={event => change('fsp', event.target.checked)} /><span><Medal size={16} />Есть достижения ФСП</span></label>
      </aside>
      <section className="candidate-list" aria-label="Результаты подбора">
        <div className="list-heading"><span>{results.length} {results.length === 1 ? 'специалист' : results.length > 1 && results.length < 5 ? 'специалиста' : 'специалистов'}</span><span className="muted">По релевантности</span></div>
        {results.length ? results.map(({ person, reason }, index) => {
          const pending = state.invitations.some(invitation => invitation.companyId === state.company.id && invitation.candidateId === person.id && (invitation.status === 'sent' || invitation.status === 'viewed'));
          return <article className="candidate-row" key={person.id}>
            <button className={'avatar avatar-tone-' + (index % 4)} onClick={() => onProfile(person)} aria-label={'Открыть профиль ' + person.name}>{initials(person.name)}</button>
            <div className="candidate-main">
              <button className="person-link" onClick={() => onProfile(person)}>{person.name}<BadgeCheck size={17} className="confirmed-icon" aria-label="Категория подтверждена" /></button>
              <p className="candidate-specialization">{specializationLabels[person.confirmed!.specialization]}<span className="dot-divider">·</span>{gradeLabels[person.confirmed!.grade]}</p>
              <span className="metadata"><MapPin size={13} />{person.city}<span className="dot-divider">·</span>{person.experience}<span className="dot-divider">·</span>{person.format}</span>
              <div className="tags">{person.stack.slice(0, 4).map(skill => <span className="tag" key={skill}>{skill}</span>)}{person.achievements.length > 0 && <span className="tag fsp-tag"><Medal size={12} />ФСП</span>}</div>
            </div>
            <div className="candidate-action"><div className="score-with-context"><div className="test-score" title={'Результат теста: ' + person.confirmed!.score + ' из 100'}><strong>{person.confirmed!.score}<span>/100</span></strong></div><details className="match-details" name="matching"><summary aria-label={'Почему подходит ' + person.name} title="Почему подходит"><Info size={15} /></summary><p>{reason}</p></details></div>
              <button className="button secondary compact" disabled={pending} onClick={() => onInvite(person)}>{pending ? 'Отправлено' : 'Пригласить'}</button>
            </div>
          </article>;
        }) : <div className="empty-state"><Search size={30} /><h3>Кандидатов пока нет</h3><p>Попробуйте изменить запрос или фильтры.</p><button className="button secondary" onClick={() => { setFilters({ ...emptyFilters, stack: [] }); setQuery(''); setDraft(''); }}>Сбросить поиск</button></div>}
      </section>
    </div>
  </>;
}
