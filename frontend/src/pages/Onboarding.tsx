import { useEffect, useRef, useState, type FormEvent } from 'react';
import { resumeTextLimits as textLimits } from '../../../shared/resume-limits';
import { CandidateSteps } from '../components/CandidateSteps';
import { SoftSkillsField } from '../components/SoftSkillsField';
import { ResumeSectionsFields, ResumeUpload, StackField } from '../components/ResumeProfileFields';
import { gradeOptions, professionalRoleOptions, specializationOptions, type CandidateSurvey, type PlatformState } from '../model';
import { employmentTypes } from '../../../shared/search.ts';
import { deriveExperienceMonths, deriveLanguageCodes } from '../candidate-preferences';
import { createResumeDraft, mergeResumeImport, resumeDraftError, resumeDraftValues, resumeSurveyValues, workFormats, type ResumeDraft } from '../resume-form';

export function Onboarding({ state, update, onComplete, accountPrefill }: {
  state: PlatformState; update: (fn: (state: PlatformState) => PlatformState) => void; onComplete: () => void;
  accountPrefill?: { name?: string; email?: string };
}) {
  const profile = state.profile;
  const [draft, setDraft] = useState<ResumeDraft>(() => ({
    ...createResumeDraft(profile),
    name: profile.name || accountPrefill?.name || '', email: profile.email || accountPrefill?.email || '',
    specialization: state.surveys.length || profile.confirmed ? profile.specialization : '',
    desiredGrade: state.surveys.length || profile.confirmed ? profile.desiredGrade : '',
  }));
  const [error, setError] = useState('');
  const [consent, setConsent] = useState(profile.consent);
  const [visible, setVisible] = useState(profile.visible && profile.consent);
  const [reading, setReading] = useState(false);
  const edited = useRef(new Set<keyof ResumeDraft>());
  useEffect(() => {
    if (!accountPrefill?.name && !accountPrefill?.email) return;
    setDraft(previous => ({
      ...previous,
      name: previous.name || accountPrefill.name || '',
      email: previous.email || accountPrefill.email || '',
    }));
  }, [accountPrefill?.name, accountPrefill?.email]);

  function change<K extends keyof ResumeDraft>(field: K, value: ResumeDraft[K]) {
    edited.current.add(field);
    setDraft(previous => ({ ...previous, [field]: value }));
    setError('');
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if ([...event.currentTarget.querySelectorAll<HTMLTextAreaElement>('.chip-editor textarea')].some(field => field.value.trim())) {
      setError('Завершите редактирование достижений и интересов: нажмите «Добавить» или «Готово» в соответствующем разделе.'); return;
    }
    const validation = resumeDraftError(draft);
    if (validation) { setError(validation); return; }
    if (!consent) { setError('Нужно согласие на обработку персональных данных.'); return; }
    const values = resumeDraftValues(draft);
    const survey: CandidateSurvey = { id: crypto.randomUUID(), date: new Date().toISOString(), ...resumeSurveyValues(draft) };
    update(previous => ({
      ...previous, surveys: [survey, ...previous.surveys],
      profile: {
        ...previous.profile, ...values, consent, visible: visible && consent, surveyCompletedAt: survey.date,
        experienceMonths: deriveExperienceMonths(values.experience), languageCodes: deriveLanguageCodes(values.languages),
      },
    }));
    onComplete();
  }
  return <div className="onboarding-layout">
    <CandidateSteps step={0} />
    <div className="page-heading"><h1>Анкета</h1></div>
    <ResumeUpload draft={draft} onReadingChange={setReading} onImportStart={() => edited.current.clear()} onImported={(imported, original) => setDraft(previous => mergeResumeImport(previous, original, imported, edited.current))} />
    <form className="panel onboarding-form" onSubmit={submit}>
      <div className="form-grid">
        <label className="field"><span>Имя и фамилия</span><input name="name" required maxLength={100} autoComplete="name" value={draft.name} onChange={event => change('name', event.target.value)} /></label>
        <label className="field"><span>Email</span><input name="email" type="email" required maxLength={254} autoComplete="email" value={draft.email} onChange={event => change('email', event.target.value)} /></label>
      </div>
      <label className="field"><span>Роль в команде</span><select name="professionalRole" required value={draft.professionalRole} onChange={event => change('professionalRole', event.target.value)}><option value="">Выберите роль</option>{professionalRoleOptions.map(role => <option key={role}>{role}</option>)}</select></label>
      <div className="form-grid">
        <label className="field"><span>Специализация</span><select name="specialization" required value={draft.specialization} onChange={event => change('specialization', event.target.value)}><option value="">Выберите</option>{specializationOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="field"><span>Предполагаемый грейд</span><select name="desiredGrade" required value={draft.desiredGrade} onChange={event => change('desiredGrade', event.target.value)}><option value="">Выберите</option>{gradeOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
      <StackField value={draft.stack} onChange={value => change('stack', value)} />
      <SoftSkillsField value={draft.softSkills} onChange={value => change('softSkills', value)} />
      <div className="form-grid">
        <label className="field"><span>Общий стаж</span><input name="experience" required maxLength={100} value={draft.experience} onChange={event => change('experience', event.target.value)} placeholder="3 года 4 месяца или без опыта" aria-describedby={draft.experience.trim() && deriveExperienceMonths(draft.experience) === null ? 'onboarding-experience-help' : undefined} /></label>
        <label className="field"><span>Город</span><input name="city" maxLength={100} autoComplete="address-level2" value={draft.city} onChange={event => change('city', event.target.value)} placeholder="Необязательно" /></label>
      </div>
      {draft.experience.trim() && deriveExperienceMonths(draft.experience) === null && <p className="field-help" id="onboarding-experience-help">Для подбора по стажу укажите точную продолжительность, например «3 года 4 месяца». Приблизительный стаж останется в профиле.</p>}
      <fieldset className="salary-fields"><legend>Условия работы <span className="field-caption">Необязательно</span></legend>
        <div className="form-grid">
          <label className="field"><span>Желаемая зарплата от, ₽/мес.</span><input name="salaryFrom" type="number" min="0" max="10000000" step="1" value={draft.salaryFrom} onChange={event => change('salaryFrom', event.target.value)} placeholder="Не указана" /></label>
          <label className="field"><span>Желаемая зарплата до, ₽/мес.</span><input name="salaryTo" type="number" min="0" max="10000000" step="1" value={draft.salaryTo} onChange={event => change('salaryTo', event.target.value)} placeholder="Необязательно" /></label>
        </div>
        <label className="field"><span>Занятость</span><select name="employmentType" value={draft.employmentType} onChange={event => change('employmentType', event.target.value)}><option value="">Не указана</option>{employmentTypes.map(value => <option key={value}>{value}</option>)}</select></label>
      </fieldset>
      <ResumeSectionsFields draft={draft} onChange={change} onInteracting={field => edited.current.add(field)} />
      <details className="onboarding-details">
        <summary>Подробнее о себе</summary>
        <label className="field"><span>О себе</span><textarea name="bio" rows={3} maxLength={3000} value={draft.bio} onChange={event => change('bio', event.target.value)} /></label>
        <label className="field"><span>Образование</span><textarea name="education" rows={3} maxLength={textLimits.education} value={draft.education} onChange={event => change('education', event.target.value)} /></label>
        <div className="form-grid">
          <label className="field"><span>Языки</span><input name="languages" maxLength={500} value={draft.languages} onChange={event => change('languages', event.target.value)} placeholder="Английский B2" /></label>
          <label className="field"><span>Телефон</span><input name="phone" type="tel" maxLength={30} autoComplete="tel" value={draft.phone} onChange={event => change('phone', event.target.value)} /></label>
        </div>
        <div className="form-grid">
          <label className="field"><span>Портфолио</span><input name="portfolio" maxLength={1000} value={draft.portfolio} onChange={event => change('portfolio', event.target.value)} placeholder="GitHub или ссылка на проекты" /></label>
          <label className="field"><span>Формат работы</span><select name="format" value={draft.format} onChange={event => change('format', event.target.value)}><option value="">Выберите</option>{workFormats.map(format => <option key={format}>{format}</option>)}</select></label>
        </div>
      </details>
      <div className="onboarding-privacy">
        <label className="checkbox-field"><input name="consent" type="checkbox" required checked={consent} onChange={event => { setConsent(event.target.checked); if (!event.target.checked) setVisible(false); setError(''); }} /><span>Согласен на обработку персональных данных</span></label>
        <a className="privacy-policy-link" href="/privacy" target="_blank" rel="noopener noreferrer">Политика конфиденциальности</a>
        <label className="checkbox-field"><input name="visible" type="checkbox" disabled={!consent} checked={visible && consent} onChange={event => setVisible(event.target.checked)} /><span>Показывать профиль работодателям</span></label>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions"><button className="button primary" type="submit" disabled={reading}>К тесту</button></div>
    </form>
  </div>;
}
