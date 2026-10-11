import { useRef, useState, type FormEvent } from 'react';
import { BadgeCheck, Eye, FileText, Medal, UserRound } from 'lucide-react';
import { gradeLabels, gradeOptions, professionalRoleOptions, specializationOptions, specializationLabels, type PlatformState } from '../model';
import { FormHeader } from './Company';
import { resumeTextLimits } from '../../../shared/resume-limits';
import { employmentTypes } from '../../../shared/search.ts';
import { deriveExperienceMonths, deriveLanguageCodes } from '../candidate-preferences';
import { SoftSkillsField } from '../components/SoftSkillsField';
import { ResumeSectionsFields, ResumeUpload, StackField } from '../components/ResumeProfileFields';
import { createResumeDraft, mergeResumeImport, resumeDraftError, resumeDraftValues, workFormats, type ResumeDraft } from '../resume-form';
import { CandidateHistory } from '../components/CandidateHistory';
import { FspLink } from '../components/FspLink';
import { IntegrationPanel } from '../components/IntegrationPanel';
import { ReadinessPanel } from '../components/ReadinessPanel';

// Where each unfinished readiness item is edited in the profile form.
const readinessFields: Record<string, string> = {
  stack: '.competency-field', story: '.resume-section[aria-label="Опыт работы"]', contacts: '[name="phone"]',
  published: '.profile-publication', fsp: '.profile-fsp', terms: '[name="salaryFrom"]',
};

function sameValues(left: string[], right: string[]) {
  const leftValues = new Set(left);
  const rightValues = new Set(right);
  return leftValues.size === rightValues.size && [...leftValues].every(value => rightValues.has(value));
}

export function Profile({ state, update, notify, onTest, onSurvey, onPreview, onFspChange, syncStatus, accountId }: {
  state: PlatformState; update: (fn: (state: PlatformState) => PlatformState) => void;
  notify: (message: string) => void; onTest: () => void; onSurvey?: () => void; onPreview: () => void;
  onFspChange: () => Promise<void>; syncStatus: string;
  accountId?: string;
}) {
  const [fspId, setFspId] = useState(state.profile.fspId);
  const [consent, setConsent] = useState(state.profile.consent);
  const [visible, setVisible] = useState(state.profile.visible);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState(() => createResumeDraft(state.profile));
  const [reading, setReading] = useState(false);
  const edited = useRef(new Set<keyof ResumeDraft>());
  const profile = state.profile;
  function change<K extends keyof ResumeDraft>(field: K, value: ResumeDraft[K]) {
    edited.current.add(field);
    setDraft(previous => ({ ...previous, [field]: value })); setError('');
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if ([...event.currentTarget.querySelectorAll<HTMLTextAreaElement>('.chip-editor textarea')].some(field => field.value.trim())) {
      setError('Завершите редактирование достижений и интересов: нажмите «Добавить» или «Готово» в соответствующем разделе.'); return;
    }
    const validation = resumeDraftError(draft);
    if (validation) { setError(validation); return; }
    const values = resumeDraftValues(draft);
    update(previous => {
      const professionalChanged = values.specialization !== previous.profile.specialization
        || values.desiredGrade !== previous.profile.desiredGrade
        || values.professionalRole !== previous.profile.professionalRole
        || values.experience !== previous.profile.experience
        || !sameValues(values.stack, previous.profile.stack)
        || !sameValues(values.softSkills, previous.profile.softSkills || []);
      return { ...previous, profile: {
        ...previous.profile, ...values,
        surveyCompletedAt: professionalChanged ? null : previous.profile.surveyCompletedAt,
        languageCodes: deriveLanguageCodes(values.languages), experienceMonths: deriveExperienceMonths(values.experience),
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
        <ResumeUpload draft={draft} onReadingChange={setReading} onImportStart={() => edited.current.clear()} onImported={(imported, original) => setDraft(previous => mergeResumeImport(previous, original, imported, edited.current))} />
        <FormHeader title="Личные данные" Icon={UserRound} />
        <div className="form-grid"><label className="field"><span>Имя и фамилия</span><input name="name" required maxLength={100} value={draft.name} onChange={event => change('name', event.target.value)} /></label><label className="field"><span>Город</span><input name="city" maxLength={100} value={draft.city} onChange={event => change('city', event.target.value)} placeholder="Необязательно" /></label></div>
        <div className="form-grid"><label className="field"><span>Email</span><input name="email" type="email" required value={draft.email} onChange={event => change('email', event.target.value)} /></label><label className="field"><span>Телефон</span><input name="phone" type="tel" maxLength={30} value={draft.phone} onChange={event => change('phone', event.target.value)} placeholder="+7" /></label></div>
        <div className="section-divider" />
        <FormHeader title="Навыки" Icon={FileText} />
        <div className="form-grid"><label className="field"><span>Специализация</span><select name="specialization" value={draft.specialization} onChange={event => change('specialization', event.target.value)}>{specializationOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label><label className="field"><span>Предполагаемый грейд</span><select name="desiredGrade" value={draft.desiredGrade} onChange={event => change('desiredGrade', event.target.value)}>{gradeOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label></div>
        <label className="field"><span>Роль в команде</span><select name="professionalRole" required value={draft.professionalRole} onChange={event => change('professionalRole', event.target.value)}><option value="">Выберите роль</option>{professionalRoleOptions.map(role => <option key={role}>{role}</option>)}</select></label>
        <div className="form-grid"><label className="field"><span>Общий стаж</span><input name="experience" required maxLength={100} value={draft.experience} onChange={event => change('experience', event.target.value)} aria-describedby={draft.experience.trim() && deriveExperienceMonths(draft.experience) === null ? 'profile-experience-help' : undefined} /></label><label className="field"><span>Формат работы</span><select name="format" value={draft.format} onChange={event => change('format', event.target.value)}><option value="">Выберите</option>{workFormats.map(format => <option key={format}>{format}</option>)}</select></label></div>
        {draft.experience.trim() && deriveExperienceMonths(draft.experience) === null && <p className="field-help" id="profile-experience-help">Для подбора по стажу укажите точную продолжительность, например «3 года 4 месяца». Приблизительный стаж останется в профиле.</p>}
        <StackField value={draft.stack} onChange={value => change('stack', value)} />
        <SoftSkillsField value={draft.softSkills} onChange={value => change('softSkills', value)} />
        <ResumeSectionsFields draft={draft} onChange={change} onInteracting={field => edited.current.add(field)} />
        <label className="field"><span>О себе</span><textarea name="bio" rows={4} maxLength={3000} value={draft.bio} onChange={event => change('bio', event.target.value)} /></label>
        <details className="onboarding-details"><summary>Подробнее о себе</summary>
          <label className="field"><span>Образование</span><textarea name="education" rows={2} maxLength={resumeTextLimits.education} value={draft.education} onChange={event => change('education', event.target.value)} /></label>
          <div className="form-grid"><label className="field"><span>Языки</span><input name="languages" maxLength={500} value={draft.languages} onChange={event => change('languages', event.target.value)} /></label><label className="field"><span>Портфолио</span><input name="portfolio" maxLength={1000} value={draft.portfolio} onChange={event => change('portfolio', event.target.value)} placeholder="GitHub или ссылка на проекты" /></label></div>
        </details>
        <fieldset className="salary-fields"><legend>Условия работы <span className="field-caption">Необязательно</span></legend>
          <div className="form-grid">
            <label className="field"><span>Желаемая зарплата от, ₽/мес.</span><input name="salaryFrom" type="number" min="0" max="10000000" step="1" value={draft.salaryFrom} onChange={event => change('salaryFrom', event.target.value)} placeholder="Не указана" /></label>
            <label className="field"><span>Желаемая зарплата до, ₽/мес.</span><input name="salaryTo" type="number" min="0" max="10000000" step="1" value={draft.salaryTo} onChange={event => change('salaryTo', event.target.value)} placeholder="Необязательно" /></label>
          </div>
          <label className="field"><span>Занятость</span><select name="employmentType" value={draft.employmentType} onChange={event => change('employmentType', event.target.value)}><option value="">Не указана</option>{employmentTypes.map(value => <option key={value}>{value}</option>)}</select></label>
        </fieldset>
        <div className="section-divider" />
        <div className="profile-fsp"><FormHeader title="ФСП" Icon={Medal} /></div>
        <FspLink disabled={!consent || consent !== profile.consent || syncStatus !== 'saved'} onChange={async result => {
          setFspId(result.fspId); await onFspChange();
        }} />
        <div className="section-divider" />
        <label className="checkbox-field profile-publication"><input type="checkbox" disabled={!consent} checked={visible && consent} onChange={event => setVisible(event.target.checked)} /><span>Показывать профиль работодателям</span></label>
        <label className="checkbox-field"><input type="checkbox" checked={consent} onChange={event => { setConsent(event.target.checked); if (!event.target.checked) setVisible(false); }} /><span>Согласен на обработку персональных данных</span></label>
        <a className="privacy-policy-link" href="/privacy" target="_blank" rel="noopener noreferrer">Политика конфиденциальности</a>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="form-actions"><button type="submit" className="button primary" disabled={reading}>Сохранить изменения</button></div>
      </form>
      <aside className="profile-sidebar">
        <ReadinessPanel state={state} onAction={(action, key) => {
          if (action === 'assessment') { onTest(); return; }
          if (action === 'onboarding') { (onSurvey || onTest)(); return; }
          const field = document.querySelector<HTMLElement>(readinessFields[key] || '.profile-form');
          field?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          (field?.matches('input, textarea, select') ? field : field?.querySelector<HTMLElement>('input, textarea, select'))?.focus({ preventScroll: true });
        }} />
        <section className="panel category-panel"><h2 className="sr-only">Подтверждённая категория</h2><p className="muted">{specializationLabels[profile.confirmed?.specialization || profile.specialization]}</p>
          <div className="category-status"><BadgeCheck size={20} /><div><span className="field-caption">Подтверждённый грейд</span><strong>{profile.confirmed ? gradeLabels[profile.confirmed.grade] : 'Не подтверждён'}</strong></div></div>
          {profile.confirmed && <div className="category-score" aria-label={'Результат теста: ' + profile.confirmed.score + ' из 100'}><strong>{profile.confirmed.score}<span>/100</span></strong></div>}
          <button className="button primary full-width" onClick={onTest}>{profile.confirmed ? 'Пройти тест' : 'Подтвердить грейд'}</button>
        </section>
        <IntegrationPanel accountId={accountId} consent={consent && profile.consent && syncStatus === 'saved'} onChange={onFspChange} />
        <CandidateHistory state={state} />
      </aside>
    </div>
  </>;
}
