import { useEffect, useId, useRef, useState } from 'react';
import { Paperclip, Plus, Search, Trash2, X } from 'lucide-react';
import { competenceOptions, normalizeStackSkill, normalizeStackSkills } from '../../../shared/catalog';
import { MAX_STACK_SKILLS, resumeSectionLimits } from '../../../shared/resume-limits';
import { MAX_WORK_EXPERIENCES, MAX_PET_PROJECTS, MAX_RESUME_ITEMS, type WorkExperience, type PetProject } from '../../../shared/resume-structure';
import { competencySuggestions, MAX_VISIBLE_COMPETENCY_RESULTS, recognizeResumeFields, resumeFieldLabels, type ResumeDraft } from '../resume-form';
import './ResumeProfileFields.css';

export function StackField({ value, onChange, title = 'Стек', name = 'stack' }: {
  value: string[]; onChange: (value: string[]) => void; title?: string; name?: string;
}) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const all = normalizeStackSkills([...value, ...competenceOptions]);
  const suggestions = competencySuggestions(value, query, expanded);
  const searching = Boolean(query.trim());
  const custom = normalizeStackSkill(query);
  const canAdd = custom && custom.length <= resumeSectionLimits.projectSkill && !all.some(skill => skill.toLowerCase() === custom.toLowerCase()) && value.length < MAX_STACK_SKILLS;
  const addCustom = () => { if (canAdd) { onChange([...value, custom]); setQuery(''); } };
  const chips = (skills: string[]) => <div className="competency-options">
    {skills.map(skill => <label className={'competency-chip' + (value.includes(skill) ? ' selected' : '')} key={skill}>
      <input type="checkbox" name={name} value={skill} checked={value.includes(skill)} disabled={!value.includes(skill) && value.length >= MAX_STACK_SKILLS}
        onChange={event => onChange(event.target.checked ? normalizeStackSkills([...value, skill]) : value.filter(item => item !== skill))} />
      <span>{skill}</span>
    </label>)}
  </div>;
  return <fieldset className="competency-field">
    <legend>{title} <span className="field-caption">Выбрано: {value.length}</span></legend>
    <div className="competency-search-box">
      <Search size={18} aria-hidden="true" />
      <label className="field competency-search"><span className="sr-only">Найти компетенцию: {title}</span>
        <input type="search" maxLength={resumeSectionLimits.projectSkill} value={query} onChange={event => setQuery(event.target.value)} placeholder="Поиск навыка или своя компетенция"
          aria-describedby={searching ? `${id}-status` : undefined} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addCustom(); } }} /></label>
      {query && <button className="competency-search-clear" type="button" aria-label={`Очистить поиск: ${title}`} onClick={() => setQuery('')}><X size={16} aria-hidden="true" /></button>}
    </div>
    {suggestions.selected.length > 0 && <div className="competency-selected" role="group" aria-label="Выбранные компетенции">
      <p className="competency-group-label">Выбрано</p>{chips(suggestions.selected)}
    </div>}
    <div className="competency-results" id={id}>
      <p className="competency-group-label">{searching ? 'Результаты поиска' : expanded ? 'Все компетенции' : 'Популярные компетенции'}</p>
      {chips(suggestions.options)}
      {searching && <p className="competency-result-count" id={`${id}-status`} role="status" aria-live="polite">
        {suggestions.total > MAX_VISIBLE_COMPETENCY_RESULTS ? `Показано ${MAX_VISIBLE_COMPETENCY_RESULTS} из ${suggestions.total}. Уточните запрос.`
          : suggestions.total > 0 ? `Найдено: ${suggestions.total}.`
            : suggestions.selectedMatches.length ? `Уже выбрано: ${suggestions.selectedMatches.join(', ')}.`
              : 'Совпадений нет. Добавьте свою компетенцию или измените запрос.'}
      </p>}
    </div>
    <div className="competency-actions">
      {!searching && <button className="text-button" type="button" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(!expanded)}>{expanded ? 'Свернуть список' : 'Все компетенции'}</button>}
      {canAdd && <button className="competency-add" type="button" onClick={addCustom}><Plus size={16} aria-hidden="true" /><span>Добавить «{custom}»</span></button>}
      {value.length >= MAX_STACK_SKILLS && <span className="field-help">Можно выбрать до {MAX_STACK_SKILLS} компетенций. Снимите галочку, чтобы заменить навык.</span>}
    </div>
  </fieldset>;
}

export function WorkExperienceField({ value, onChange }: { value: WorkExperience[]; onChange: (value: WorkExperience[]) => void }) {
  const change = (index: number, key: keyof WorkExperience, text: string) => onChange(value.map((item, i) => i === index ? { ...item, [key]: text } : item));
  return <section className="resume-section" aria-label="Опыт работы">
    <div className="resume-section-heading"><h2>Опыт работы</h2><span className="field-caption">Места работы и задачи</span></div>
    {value.length === 0 && <p className="field-help">Добавьте место работы или загрузите резюме. Если опыта пока нет, блок можно оставить пустым.</p>}
    <div className="resume-entry-list">{value.map((item, index) => <fieldset className="resume-entry" key={index}>
      <legend>Место работы {index + 1}</legend>
      <button className="resume-entry-remove" type="button" aria-label={`Удалить место работы ${index + 1}`} onClick={() => onChange(value.filter((_, i) => i !== index))}><Trash2 size={16} /></button>
      <div className="form-grid">
        <label className="field"><span>Период работы</span><input aria-label={`Период работы ${index + 1}`} name={`workPeriod${index}`} maxLength={resumeSectionLimits.workPeriod} value={item.period} onChange={event => change(index, 'period', event.target.value)} placeholder="Май 2024 — настоящее время" /></label>
        <label className="field"><span>Компания</span><input aria-label={`Компания ${index + 1}`} name={`workCompany${index}`} maxLength={resumeSectionLimits.workCompany} value={item.company} onChange={event => change(index, 'company', event.target.value)} placeholder="Название компании" /></label>
      </div>
      <label className="field"><span>Какие задачи выполняли</span><textarea aria-label={`Задачи ${index + 1}`} name={`workTasks${index}`} rows={3} maxLength={resumeSectionLimits.workTasks} value={item.tasks} onChange={event => change(index, 'tasks', event.target.value)} placeholder="Ваша роль, задачи и результаты работы" /></label>
    </fieldset>)}</div>
    <button className="button secondary compact" type="button" disabled={value.length >= MAX_WORK_EXPERIENCES} onClick={() => onChange([...value, { period: '', company: '', tasks: '' }])}><Plus size={16} />Добавить место работы</button>
  </section>;
}

export function PetProjectsField({ value, onChange }: { value: PetProject[]; onChange: (value: PetProject[]) => void }) {
  const change = (index: number, patch: Partial<PetProject>) => onChange(value.map((item, i) => i === index ? { ...item, ...patch } : item));
  return <section className="resume-section" aria-label="Pet-проекты">
    <div className="resume-section-heading"><h2>Pet-проекты</h2><span className="field-caption">Личные и учебные проекты</span></div>
    {value.length === 0 && <p className="field-help">Расскажите о своих проектах: что сделали и какие технологии использовали.</p>}
    <div className="resume-entry-list">{value.map((item, index) => <fieldset className="resume-entry" key={index}>
      <legend>Проект {index + 1}</legend>
      <button className="resume-entry-remove" type="button" aria-label={`Удалить проект ${index + 1}`} onClick={() => onChange(value.filter((_, i) => i !== index))}><Trash2 size={16} /></button>
      <label className="field"><span>Название</span><input aria-label={`Название проекта ${index + 1}`} name={`projectName${index}`} maxLength={resumeSectionLimits.projectName} value={item.name} onChange={event => change(index, { name: event.target.value })} placeholder="Название pet-проекта" /></label>
      <label className="field"><span>Описание</span><textarea aria-label={`Описание проекта ${index + 1}`} name={`projectDescription${index}`} rows={3} maxLength={resumeSectionLimits.projectDescription} value={item.description} onChange={event => change(index, { description: event.target.value })} placeholder="Идея, ваша работа и результат" /></label>
      <StackField title={`Стек проекта ${index + 1}`} name={`petProjectStack${index}`} value={item.stack} onChange={stack => change(index, { stack })} />
    </fieldset>)}</div>
    <button className="button secondary compact" type="button" disabled={value.length >= MAX_PET_PROJECTS} onClick={() => onChange([...value, { name: '', description: '', stack: [] }])}><Plus size={16} />Добавить pet-проект</button>
  </section>;
}

export function EditableChips({ title, itemLabel, value, onChange, placeholder, onInteracting, limit = resumeSectionLimits.achievementItems }: {
  title: string; itemLabel: string; value: string[]; onChange: (value: string[]) => void; placeholder: string; onInteracting?: () => void; limit?: number;
}) {
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<number | null>(null);
  function save() {
    const next = text.trim();
    if (!next || value.filter((_, i) => i !== editing).includes(next)) return;
    const updated = editing === null ? [...value, next] : value.map((item, index) => index === editing ? next : item);
    if (updated.join('\n').length > limit || updated.length > MAX_RESUME_ITEMS) return;
    onChange(updated); setText(''); setEditing(null);
  }
  const duplicate = value.filter((_, i) => i !== editing).includes(text.trim());
  const tooLong = [...value.filter((_, i) => i !== editing), text.trim()].join('\n').length > limit;
  return <section className="resume-section" aria-label={title}>
    <h2>{title}</h2>
    <div className="editable-chips">{value.map((item, index) => <div className="editable-chip" key={index}>
      <button className="editable-chip-text" type="button" aria-label={`Редактировать ${itemLabel} ${index + 1}`} onClick={() => { onInteracting?.(); setEditing(index); setText(item); }}>{item}</button>
      <button className="editable-chip-remove" type="button" aria-label={`Удалить ${itemLabel} ${index + 1}`} onClick={() => { onChange(value.filter((_, i) => i !== index)); setEditing(null); setText(''); }}><X size={14} /></button>
    </div>)}</div>
    <div className="chip-editor">
      <label className="field"><span className="sr-only">{editing === null ? `Добавить ${itemLabel}` : `Редактировать ${itemLabel}`}</span>
        <textarea aria-label={editing === null ? `Добавить ${itemLabel}` : `Редактировать ${itemLabel}`} rows={2} maxLength={limit} value={text} onChange={event => { onInteracting?.(); setText(event.target.value); }} placeholder={placeholder} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); save(); } }} /></label>
      <button className="competency-add" type="button" disabled={!text.trim() || duplicate || tooLong || (editing === null && value.length >= MAX_RESUME_ITEMS)} onClick={save}>{editing === null && <Plus size={16} aria-hidden="true" />}{editing === null ? 'Добавить' : 'Готово'}</button>
      {editing !== null && <button className="text-button" type="button" onClick={() => { setEditing(null); setText(''); }}>Отмена</button>}
    </div>
    {tooLong && <p className="form-error" role="alert">В разделе допустимо до {limit} символов.</p>}
    {duplicate && <p className="field-help">Такая запись уже добавлена.</p>}
  </section>;
}

export function ResumeSectionsFields({ draft, onChange, onInteracting }: {
  draft: ResumeDraft; onChange: <K extends keyof ResumeDraft>(field: K, value: ResumeDraft[K]) => void;
  onInteracting: (field: keyof ResumeDraft) => void;
}) {
  return <>
    <WorkExperienceField value={draft.workExperiences} onChange={value => onChange('workExperiences', value)} />
    <PetProjectsField value={draft.petProjects} onChange={value => onChange('petProjects', value)} />
    <EditableChips title="Достижения" itemLabel="достижение" value={draft.achievementItems} onChange={value => onChange('achievementItems', value)} onInteracting={() => onInteracting('achievementItems')} placeholder="Результат проекта, награда или соревнование" />
    <EditableChips title="Интересы / дополнительно" itemLabel="интерес" value={draft.interests} onChange={value => onChange('interests', value)} onInteracting={() => onInteracting('interests')} limit={resumeSectionLimits.interests} placeholder="Добавьте интерес или дополнительную информацию" />
  </>;
}

export function ResumeUpload({ draft, onImportStart, onImported, onReadingChange }: {
  draft: ResumeDraft; onImportStart: () => void;
  onImported: (imported: Partial<ResumeDraft>, original: ResumeDraft) => void;
  onReadingChange?: (reading: boolean) => void;
}) {
  const [fileName, setFileName] = useState('');
  const [reading, setReading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const pending = useRef<AbortController | null>(null);
  const headingId = useId();
  useEffect(() => () => pending.current?.abort(), []);
  const setBusy = (value: boolean) => { setReading(value); onReadingChange?.(value); };
  function remove() {
    pending.current?.abort(); pending.current = null;
    setBusy(false); setStatus(''); setError(''); setFileName('');
    if (fileInput.current) fileInput.current.value = '';
  }
  async function attach(file: File) {
    pending.current?.abort();
    const controller = new AbortController(); pending.current = controller;
    const original = draft;
    onImportStart(); setFileName(file.name); setBusy(true); setError(''); setStatus('Читаем резюме…');
    try {
      const { readResume } = await import('../resume');
      if (controller.signal.aborted) return;
      const result = await readResume(file, { signal: controller.signal, onProgress: message => { if (!controller.signal.aborted) setStatus(message); } });
      if (controller.signal.aborted) return;
      const imported = recognizeResumeFields(result.fields);
      onImported(imported, original);
      const message = Object.keys(imported).length ? 'Проверьте перенесённые данные. Правки, сделанные во время чтения, сохранены.' : 'Текст прочитан, но поля не распознаны. Заполните анкету вручную.';
      const truncated = result.truncatedFields.length ? `Сокращены длинные поля: ${[...new Set(result.truncatedFields.map(key => resumeFieldLabels[key]))].join(', ')}. Проверьте содержимое.` : '';
      setStatus([message, truncated, ...result.warnings].filter(Boolean).join(' '));
    } catch (cause) {
      if (controller.signal.aborted) return;
      setStatus(''); setError(cause instanceof Error ? cause.message : 'Не удалось прочитать резюме. Попробуйте другой файл.');
    } finally {
      if (pending.current === controller) { pending.current = null; setBusy(false); }
    }
  }
  return <section className="panel resume-import" aria-labelledby={headingId} aria-busy={reading}>
    <div className="resume-import-row">
      <div><h2 id={headingId}>Прикрепить резюме</h2><p>Данные заполнят стандартизированную анкету. Их можно исправить перед сохранением.</p></div>
      <div className="resume-import-actions">
        <button className="button secondary" type="button" onClick={() => fileInput.current?.click()}><Paperclip size={16} aria-hidden="true" />{fileName ? 'Заменить резюме' : 'Добавить резюме'}</button>
        {fileName && !reading && <button className="button secondary" type="button" onClick={remove}><Trash2 size={16} aria-hidden="true" />Убрать файл</button>}
      </div>
    </div>
    <input ref={fileInput} className="sr-only" type="file" aria-label="Файл резюме" accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp" tabIndex={-1} onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void attach(file); }} />
    {fileName && <div className="resume-import-status"><span className="resume-file-name">{fileName}</span>{reading && <button className="text-button" type="button" onClick={remove}>Отменить</button>}</div>}
    <p className="resume-feedback" role="status" aria-live="polite">{status}</p>
    {error && <p className="form-error resume-feedback" role="alert">{error}</p>}
  </section>;
}
