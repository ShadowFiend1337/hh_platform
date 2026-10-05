import { useState, type FormEvent } from 'react';
import { CandidateSteps } from '../components/CandidateSteps';
import { industryOptions, softSkillOptions, type CandidateSurvey, type Grade, type PlatformState, type Specialization } from '../model';

export function Onboarding({ state, update, onComplete }: {
  state: PlatformState; update: (fn: (state: PlatformState) => PlatformState) => void; onComplete: () => void;
}) {
  const profile = state.profile;
  const [error, setError] = useState('');
  const [consent, setConsent] = useState(profile.consent);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const value = (name: string) => String(fields.get(name) || '').trim();
    const name = value('name'), email = value('email');
    const specialization = value('specialization') as Specialization;
    const desiredGrade = value('desiredGrade') as Grade;
    const industry = value('industry'), professionalRole = value('professionalRole'), experience = value('experience');
    const stack = [...new Set(value('stack').split(',').map(skill => skill.trim()).filter(Boolean))];
    const softSkills = softSkillOptions.filter(skill => fields.getAll('softSkills').includes(skill));
    if (!name || !email || !industryOptions.includes(industry) || !professionalRole || !experience || !stack.length
      || !['Frontend', 'Backend'].includes(specialization) || !['Junior', 'Middle'].includes(desiredGrade)) {
      setError('Заполните анкету.'); return;
    }
    if (!softSkills.length) { setError('Выберите хотя бы один софт-скилл.'); return; }
    if (!consent) { setError('Нужно согласие на обработку данных.'); return; }
    const survey: CandidateSurvey = {
      id: crypto.randomUUID(), date: new Date().toISOString(), industry, professionalRole,
      specialization, desiredGrade, stack, experience, softSkills,
    };
    update(previous => ({
      ...previous, surveys: [survey, ...previous.surveys],
      profile: {
        ...previous.profile, name, email, industry, professionalRole, specialization, desiredGrade, stack, experience, softSkills,
        city: value('city'), consent, visible: fields.get('visible') === 'on', surveyCompletedAt: survey.date,
      },
    }));
    onComplete();
  }
  return <div className="onboarding-layout">
    <CandidateSteps step={0} />
    <div className="page-heading"><h1>Анкета</h1></div>
    <form className="panel onboarding-form" onSubmit={submit} onChange={() => setError('')}>
      <div className="form-grid">
        <label className="field"><span>Имя и фамилия</span><input name="name" required maxLength={100} autoComplete="name" defaultValue={profile.name} /></label>
        <label className="field"><span>Email</span><input name="email" type="email" required maxLength={254} autoComplete="email" defaultValue={profile.email} /></label>
      </div>
      <div className="form-grid">
        <label className="field"><span>Отрасль</span><select name="industry" required defaultValue={profile.industry}><option value="">Выберите</option>{industryOptions.map(industry => <option key={industry}>{industry}</option>)}</select></label>
        <label className="field"><span>Роль в команде</span><input name="professionalRole" required maxLength={100} defaultValue={profile.professionalRole} placeholder="Разработчик" /></label>
      </div>
      <div className="form-grid">
        <label className="field"><span>Специализация</span><select name="specialization" required defaultValue={state.surveys.length || profile.confirmed ? profile.specialization : ''}><option value="">Выберите</option><option>Frontend</option><option>Backend</option></select></label>
        <label className="field"><span>Предполагаемый грейд</span><select name="desiredGrade" required defaultValue={state.surveys.length || profile.confirmed ? profile.desiredGrade : ''}><option value="">Выберите</option><option>Junior</option><option>Middle</option></select></label>
      </div>
      <label className="field"><span>Стек</span><input name="stack" required maxLength={500} defaultValue={profile.stack.join(', ')} placeholder="React, TypeScript, CSS" /></label>
      <div className="form-grid">
        <label className="field"><span>Опыт работы</span><input name="experience" required maxLength={100} defaultValue={profile.experience} placeholder="Без опыта" /></label>
        <label className="field"><span>Город</span><input name="city" maxLength={100} autoComplete="address-level2" defaultValue={profile.city} placeholder="Необязательно" /></label>
      </div>
      <fieldset className="soft-skills-field"><legend>Софт-скиллы · самооценка</legend><div className="skill-choices">{softSkillOptions.map(skill => <label className="skill-choice" key={skill}><input name="softSkills" type="checkbox" value={skill} defaultChecked={profile.softSkills.includes(skill)} /><span>{skill}</span></label>)}</div></fieldset>
      <div className="onboarding-privacy">
        <label className="checkbox-field"><input name="consent" type="checkbox" required checked={consent} onChange={event => setConsent(event.target.checked)} /><span>Согласен на обработку данных</span></label>
        <label className="checkbox-field"><input name="visible" type="checkbox" disabled={!consent} defaultChecked={profile.visible} /><span>Показывать профиль работодателям</span></label>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions"><button className="button primary" type="submit">К тесту</button></div>
    </form>
  </div>;
}
