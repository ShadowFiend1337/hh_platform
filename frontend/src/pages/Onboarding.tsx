import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Paperclip, Trash2 } from 'lucide-react';
import { MAX_STACK_SKILLS, resumeTextLimits as textLimits } from '../../../shared/resume-limits';
import { CandidateSteps } from '../components/CandidateSteps';
import { industryOptions, isSpecialization, specializationOptions, type CandidateSurvey, type Grade, type PlatformState, type Specialization } from '../model';
import type { ResumeFields } from '../resume-parser';

type Draft = {
  name: string; email: string; phone: string; city: string; industry: string; professionalRole: string;
  specialization: string; desiredGrade: string; stack: string; experience: string;
  careerAchievements: string; education: string; workHistory: string; portfolio: string; languages: string; format: string;
};

const workFormats = ['Удалённо', 'Гибрид', 'Офис'];
const fieldLabels: Record<keyof ResumeFields, string> = {
  name: 'Имя и фамилия', email: 'Email', phone: 'Телефон', city: 'Город',
  industry: 'Отрасль', professionalRole: 'Роль в команде', specialization: 'Специализация',
  desiredGrade: 'Предполагаемый грейд', experience: 'Общий стаж', softSkills: 'Софт-скиллы',
  workHistory: 'Места работы и проекты', careerAchievements: 'Достижения',
  education: 'Образование', stack: 'Стек', portfolio: 'Портфолио', languages: 'Языки', format: 'Формат работы',
};

export function Onboarding({ state, update, onComplete }: {
  state: PlatformState; update: (fn: (state: PlatformState) => PlatformState) => void; onComplete: () => void;
}) {
  const profile = state.profile;
  const [draft, setDraft] = useState<Draft>(() => ({
    name: profile.name, email: profile.email, phone: profile.phone, city: profile.city,
    industry: profile.industry, professionalRole: profile.professionalRole,
    specialization: state.surveys.length || profile.confirmed ? profile.specialization : '',
    desiredGrade: state.surveys.length || profile.confirmed ? profile.desiredGrade : '',
    stack: profile.stack.join(', '), experience: profile.experience,
    careerAchievements: profile.careerAchievements || '', education: profile.education || '',
    workHistory: profile.workHistory || '', portfolio: profile.portfolio || '', languages: profile.languages || '',
    format: profile.format,
  }));
  const [error, setError] = useState('');
  const [consent, setConsent] = useState(profile.consent);
  const [visible, setVisible] = useState(profile.visible && profile.consent);
  const [fileName, setFileName] = useState('');
  const [reading, setReading] = useState(false);
  const [resumeStatus, setResumeStatus] = useState('');
  const [resumeError, setResumeError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  function change<K extends keyof Draft>(field: K, value: Draft[K]) {
    setDraft(previous => ({ ...previous, [field]: value }));
    setError('');
  }
  async function attachResume(file: File) {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    const original = draft;
    setFileName(file.name); setReading(true); setResumeError(''); setResumeStatus('Читаем резюме…');
    try {
      const { readResume } = await import('../resume');
      if (controller.signal.aborted) return;
      const result = await readResume(file, {
        signal: controller.signal,
        onProgress: message => { if (!controller.signal.aborted) setResumeStatus(message); },
      });
      if (controller.signal.aborted) return;
      const recognized: Partial<Draft> = {};
      const truncated = new Set(result.truncatedFields);
      for (const key of Object.keys(textLimits) as (keyof Draft)[]) {
        if (key === 'stack') continue;
        const value = result.fields[key];
        if (typeof value !== 'string' || !value.trim()) continue;
        if (key === 'industry' && !industryOptions.includes(value)) continue;
        if (key === 'specialization' && !isSpecialization(value)) continue;
        if (key === 'desiredGrade' && !['Junior', 'Middle'].includes(value)) continue;
        if (key === 'format' && !workFormats.includes(value)) continue;
        if (value.trim().length > textLimits[key]) truncated.add(key);
        recognized[key] = value.trim().slice(0, textLimits[key]);
      }
      if (result.fields.stack?.length) {
        const skills = [...new Set(result.fields.stack.map(skill => skill.trim().slice(0, 80)).filter(Boolean))].slice(0, MAX_STACK_SKILLS);
        if (skills.length < result.fields.stack.length || skills.join(', ').length > textLimits.stack) truncated.add('stack');
        while (skills.join(', ').length > textLimits.stack) skills.pop();
        if (skills.length) recognized.stack = skills.join(', ');
      }
      setDraft(previous => {
        const next = { ...previous };
        for (const key of Object.keys(recognized) as (keyof Draft)[]) {
          const unchanged = previous[key] === original[key];
          if (unchanged) Object.assign(next, { [key]: recognized[key] });
        }
        return next;
      });
      const status = Object.keys(recognized).length
        ? 'Проверьте данные и заполните пустые обязательные поля.'
        : 'Текст прочитан, но поля не распознаны. Заполните анкету.';
      const labels = [...truncated].map(key => fieldLabels[key]);
      setResumeStatus(labels.length ? `${status} Сокращены длинные поля: ${labels.join(', ')}. Проверьте их содержимое.` : status);
    } catch (cause) {
      if (controller.signal.aborted) return;
      setResumeStatus('');
      setResumeError(cause instanceof Error ? cause.message : 'Не удалось прочитать резюме. Попробуйте другой файл.');
    } finally {
      if (pending.current === controller) { pending.current = null; setReading(false); }
    }
  }
  function removeResume() {
    pending.current?.abort(); pending.current = null;
    setReading(false); setResumeStatus(''); setResumeError(''); setFileName('');
    if (fileInput.current) fileInput.current.value = '';
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = draft.name.trim(), email = draft.email.trim();
    const specialization = draft.specialization as Specialization;
    const desiredGrade = draft.desiredGrade as Grade;
    const industry = draft.industry.trim(), professionalRole = draft.professionalRole.trim(), experience = draft.experience.trim();
    const stack = [...new Set(draft.stack.split(',').map(skill => skill.trim()).filter(Boolean))];
    const softSkills: string[] = [];
    if (!name || !email || !industryOptions.includes(industry) || !professionalRole || !experience || !stack.length
      || !isSpecialization(specialization) || !['Junior', 'Middle'].includes(desiredGrade)) {
      setError('Заполните обязательные поля анкеты.'); return;
    }
    if (stack.length > MAX_STACK_SKILLS || stack.some(skill => skill.length > 80)) { setError(`Укажите до ${MAX_STACK_SKILLS} навыков, не более 80 символов каждый.`); return; }
    if (!consent) { setError('Нужно согласие на обработку персональных данных.'); return; }
    const details = {
      careerAchievements: draft.careerAchievements.trim(), education: draft.education.trim(),
      workHistory: draft.workHistory.trim(), portfolio: draft.portfolio.trim(), languages: draft.languages.trim(), format: draft.format,
    };
    const survey: CandidateSurvey = {
      id: crypto.randomUUID(), date: new Date().toISOString(), industry, professionalRole,
      specialization, desiredGrade, stack, experience, softSkills, ...details,
    };
    update(previous => ({
      ...previous, surveys: [survey, ...previous.surveys],
      profile: {
        ...previous.profile, name, email, industry, professionalRole, specialization, desiredGrade, stack, experience, softSkills, ...details,
        city: draft.city.trim(), phone: draft.phone.trim(), consent, visible: visible && consent, surveyCompletedAt: survey.date,
      },
    }));
    onComplete();
  }
  return <div className="onboarding-layout">
    <CandidateSteps step={0} />
    <div className="page-heading"><h1>Анкета</h1></div>
    <section className="panel resume-import" aria-labelledby="resume-heading" aria-busy={reading}>
      <div className="resume-import-row">
        <div><h2 id="resume-heading">Прикрепить резюме</h2><p>Анкета заполнится автоматически.</p></div>
        <div className="resume-import-actions">
          <button className="button secondary" type="button" onClick={() => fileInput.current?.click()}><Paperclip size={16} aria-hidden="true" />{fileName ? 'Заменить резюме' : 'Добавить резюме'}</button>
          {fileName && !reading && <button className="button secondary" type="button" onClick={removeResume}><Trash2 size={16} aria-hidden="true" />Удалить резюме</button>}
        </div>
      </div>
      <input ref={fileInput} className="sr-only" type="file" aria-label="Файл резюме" accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.webp" tabIndex={-1} onChange={event => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = '';
        if (file) void attachResume(file);
      }} />
      {fileName && <div className="resume-import-status"><span className="resume-file-name">{fileName}</span>{reading && <button className="text-button" type="button" onClick={removeResume}>Отменить</button>}</div>}
      <p className="resume-feedback" role="status" aria-live="polite">{resumeStatus}</p>
      {resumeError && <p className="form-error resume-feedback" role="alert">{resumeError}</p>}
    </section>
    <form className="panel onboarding-form" onSubmit={submit}>
      <div className="form-grid">
        <label className="field"><span>Имя и фамилия</span><input name="name" required maxLength={100} autoComplete="name" value={draft.name} onChange={event => change('name', event.target.value)} /></label>
        <label className="field"><span>Email</span><input name="email" type="email" required maxLength={254} autoComplete="email" value={draft.email} onChange={event => change('email', event.target.value)} /></label>
      </div>
      <div className="form-grid">
        <label className="field"><span>Отрасль</span><select name="industry" required value={draft.industry} onChange={event => change('industry', event.target.value)}><option value="">Выберите</option>{industryOptions.map(industry => <option key={industry}>{industry}</option>)}</select></label>
        <label className="field"><span>Роль в команде</span><input name="professionalRole" required maxLength={100} value={draft.professionalRole} onChange={event => change('professionalRole', event.target.value)} placeholder="Разработчик" /></label>
      </div>
      <div className="form-grid">
        <label className="field"><span>Специализация</span><select name="specialization" required value={draft.specialization} onChange={event => change('specialization', event.target.value)}><option value="">Выберите</option>{specializationOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="field"><span>Предполагаемый грейд</span><select name="desiredGrade" required value={draft.desiredGrade} onChange={event => change('desiredGrade', event.target.value)}><option value="">Выберите</option><option>Junior</option><option>Middle</option></select></label>
      </div>
      <label className="field"><span>Стек</span><input name="stack" required maxLength={textLimits.stack} value={draft.stack} onChange={event => change('stack', event.target.value)} placeholder="React, TypeScript, CSS" /></label>
      <div className="form-grid">
        <label className="field"><span>Общий стаж</span><input name="experience" required maxLength={100} value={draft.experience} onChange={event => change('experience', event.target.value)} placeholder="3 года 4 месяца или без опыта" /></label>
        <label className="field"><span>Город</span><input name="city" maxLength={100} autoComplete="address-level2" value={draft.city} onChange={event => change('city', event.target.value)} placeholder="Необязательно" /></label>
      </div>
      <label className="field"><span>Места работы и проекты</span><textarea name="workHistory" rows={6} maxLength={textLimits.workHistory} value={draft.workHistory} onChange={event => change('workHistory', event.target.value)} placeholder="Компания, период работы, роль и задачи" /></label>
      <label className="field"><span>Достижения</span><textarea name="careerAchievements" rows={3} maxLength={textLimits.careerAchievements} value={draft.careerAchievements} onChange={event => change('careerAchievements', event.target.value)} placeholder="Результаты работы, проектов или соревнований" /></label>
      <details className="onboarding-details">
        <summary>Подробнее о себе</summary>
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
