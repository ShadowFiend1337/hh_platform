import type { ResumeSections } from '../../../shared/resume-structure';
import './ResumeSummary.css';

/** The same resume sections are shown to the owner, in history and to employers. */
export function ResumeSummary({ sections }: { sections: ResumeSections }) {
  return <div className="resume-summary">
    {sections.workExperiences.length > 0 && <section><h4>Опыт работы</h4>
      {sections.workExperiences.map((entry, index) => <article className="resume-summary-entry" key={index}>
        {entry.company && <h5>{entry.company}</h5>}
        {entry.period && <p className="resume-summary-period">{entry.period}</p>}
        {entry.tasks && <p className="body-copy resume-copy">{entry.tasks}</p>}
      </article>)}
    </section>}
    {sections.petProjects.length > 0 && <section><h4>Pet-проекты</h4>
      {sections.petProjects.map((entry, index) => <article className="resume-summary-entry" key={index}>
        {entry.name && <h5>{entry.name}</h5>}
        {entry.description && <p className="body-copy resume-copy">{entry.description}</p>}
        {entry.stack.length > 0 && <div className="tags" aria-label="Стек проекта">{entry.stack.map(skill => <span className="tag" key={skill}>{skill}</span>)}</div>}
      </article>)}
    </section>}
    {sections.achievementItems.length > 0 && <section><h4>Достижения <span className="field-caption">Из резюме</span></h4>
      <div className="tags">{sections.achievementItems.map((item, index) => <span className="tag" key={index}>{item}</span>)}</div>
    </section>}
    {sections.interests.length > 0 && <section><h4>Интересы / дополнительно</h4>
      <div className="tags">{sections.interests.map((item, index) => <span className="tag" key={index}>{item}</span>)}</div>
    </section>}
  </div>;
}
