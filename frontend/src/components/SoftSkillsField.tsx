import { softSkillOptions } from '../model';
import { MAX_SOFT_SKILLS } from '../../../shared/resume-limits';
import './SoftSkillsField.css';

export function SoftSkillsField({ value, onChange }: { value: string[]; onChange: (value: string[]) => void }) {
  const options = (skills: string[]) => <div className="soft-skills-options">
    {skills.map(skill => <label className="checkbox-field" key={skill}>
      <input name="softSkills" type="checkbox" value={skill} checked={value.includes(skill)}
        disabled={!value.includes(skill) && value.length >= MAX_SOFT_SKILLS}
        onChange={event => onChange(event.target.checked ? [...new Set([...value, skill])] : value.filter(selected => selected !== skill))} />
      <span>{skill}</span>
    </label>)}
  </div>;
  return <fieldset className="soft-skills-field">
    <legend>Софт-скиллы <span className="field-caption">Самооценка · необязательно</span></legend>
    {options(softSkillOptions.slice(0, 5))}
    <details className="soft-skills-more"><summary>Другие навыки{value.some(skill => softSkillOptions.indexOf(skill) >= 5) && ' · выбраны'}</summary>
      {options(softSkillOptions.slice(5))}
    </details>
    {value.length >= MAX_SOFT_SKILLS && <p className="field-help">Можно выбрать до {MAX_SOFT_SKILLS} навыков.</p>}
  </fieldset>;
}
