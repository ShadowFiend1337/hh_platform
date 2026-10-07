import { softSkillOptions } from '../model';
import './SoftSkillsField.css';

export function SoftSkillsField({ value, onChange }: { value: string[]; onChange: (value: string[]) => void }) {
  return <fieldset className="soft-skills-field">
    <legend>Софт-скиллы <span className="field-caption">Самооценка · необязательно</span></legend>
    <div className="soft-skills-options">
      {softSkillOptions.map(skill => <label className="checkbox-field" key={skill}>
        <input name="softSkills" type="checkbox" value={skill} checked={value.includes(skill)}
          onChange={event => onChange(event.target.checked ? [...value, skill] : value.filter(selected => selected !== skill))} />
        <span>{skill}</span>
      </label>)}
    </div>
  </fieldset>;
}
