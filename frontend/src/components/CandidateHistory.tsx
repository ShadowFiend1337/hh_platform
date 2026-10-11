import { useState } from 'react';
import { Dialog } from './Dialog';
import { dateLabel, gradeLabels, practiceMark, specializationLabels, type CandidateSurvey, type PlatformState, type TestResult } from '../model';
import { resumeSections } from '../../../shared/resume-structure';
import { ResumeSummary } from './ResumeSummary';
import './CandidateHistory.css';

const pageSize = 10;

function SurveySnapshot({ survey }: { survey: CandidateSurvey }) {
  const sections: [string, string | undefined][] = [
    ['Образование', survey.education], ['Языки', survey.languages], ['Портфолио', survey.portfolio],
  ];
  return <div className="survey-snapshot" data-survey-id={survey.id}>
    <h3>Анкета от {dateLabel(survey.date)}</h3>
    <dl className="history-details">
      <div><dt>Роль</dt><dd>{survey.professionalRole}</dd></div>
      <div><dt>Специализация</dt><dd>{specializationLabels[survey.specialization]}</dd></div>
      <div><dt>Предполагаемый грейд</dt><dd>{gradeLabels[survey.desiredGrade]}</dd></div>
      <div><dt>Общий стаж</dt><dd>{survey.experience}</dd></div>
      {survey.format && <div><dt>Формат работы</dt><dd>{survey.format}</dd></div>}
    </dl>
    <section><h4>Стек</h4><div className="tags">{survey.stack.map(skill => <span className="tag" key={skill}>{skill}</span>)}</div></section>
    <section><h4>Софт-скиллы <span className="field-caption">Самооценка</span></h4>{survey.softSkills.length
      ? <div className="tags">{survey.softSkills.map(skill => <span className="tag" key={skill}>{skill}</span>)}</div>
      : <p className="muted">Не указаны</p>}</section>
    <ResumeSummary sections={resumeSections(survey)} />
    {sections.filter(([, text]) => Boolean(text)).map(([label, text]) => <section key={label}>
      <h4>{label}</h4><p className="body-copy resume-copy">{text}</p>
    </section>)}
  </div>;
}

const outcome = (result: TestResult) => result.pending ? 'На проверке' : result.invalidated ? (result.openStatus ? 'Не засчитан' : 'Аннулирован экспертом')
  : result.annulled ? 'Аннулирован' : result.passed ? 'Пройден' : 'Не пройден';

export function CandidateHistory({ state }: { state: PlatformState }) {
  const [view, setView] = useState<'tests' | 'surveys'>('tests');
  const [counts, setCounts] = useState({ tests: pageSize, surveys: pageSize });
  const [selection, setSelection] = useState<{ kind: 'test' | 'survey'; id: string } | null>(null);
  const tests = [...state.history].sort((left, right) => Date.parse(right.date) - Date.parse(left.date));
  const surveys = [...state.surveys].sort((left, right) => Date.parse(right.date) - Date.parse(left.date));
  const result = selection?.kind === 'test' ? tests.find(item => item.id === selection.id) : undefined;
  const surveyId = selection?.kind === 'survey' ? selection.id : result?.surveyId;
  const selectedSurvey = surveys.find(item => item.id === surveyId);
  const total = view === 'tests' ? tests.length : surveys.length;

  return <section className="panel test-history candidate-history" aria-label="История опросов и тестов">
    <h2>История</h2>
    <div className="history-view-switch" role="group" aria-label="Тип истории">
      <button type="button" aria-label="Тесты" aria-pressed={view === 'tests'} onClick={() => setView('tests')}>Тесты <span aria-hidden="true">{tests.length}</span></button>
      <button type="button" aria-label="Анкеты" aria-pressed={view === 'surveys'} onClick={() => setView('surveys')}>Анкеты <span aria-hidden="true">{surveys.length}</span></button>
    </div>
    <div className="history-list">
      {view === 'tests' ? tests.slice(0, counts.tests).map(item => <button type="button" className="history-item history-entry" key={item.id}
        data-result-id={item.id} onClick={() => setSelection({ kind: 'test', id: item.id })}>
        <span className="history-entry-text"><strong>{specializationLabels[item.specialization]} · {gradeLabels[item.grade]}</strong>
          <time dateTime={item.date}>{dateLabel(item.date)}</time><span>{outcome(item)}</span>
          {item.openStatus && <span className={'history-mark history-mark-' + (item.invalidated ? 'invalidated' : item.reviewedByExpert ? 'expert' : item.openStatus)}>{practiceMark(item)}</span>}</span>
        <span className={'history-score ' + (item.passed ? 'passed' : item.pending ? 'pending' : 'failed')}>{item.pending ? item.closedScore : item.score}/100</span>
      </button>) : surveys.slice(0, counts.surveys).map(item => <button type="button" className="history-item history-entry" key={item.id}
        data-survey-id={item.id} onClick={() => setSelection({ kind: 'survey', id: item.id })}>
        <span className="history-entry-text"><strong>{specializationLabels[item.specialization]} · {gradeLabels[item.desiredGrade]}</strong>
          <time dateTime={item.date}>{dateLabel(item.date)}</time><span>{item.professionalRole}</span></span>
      </button>)}
      {!total && <p className="muted">{view === 'tests' ? 'Тестов пока нет' : 'Анкет пока нет'}</p>}
    </div>
    {counts[view] < total && <button type="button" className="text-button history-show-more"
      onClick={() => setCounts(previous => ({ ...previous, [view]: previous[view] + pageSize }))}>Показать ещё</button>}
    <details className="history-retention"><summary>Хранение</summary><p>В кабинете доступны последние 500 завершённых тестов и до 100 анкет. Анкета фиксируется при сохранении; результат связан с её снимком. Удаление профиля очищает его историю.</p></details>
    {selection && <Dialog title={selection.kind === 'test' ? 'Результат теста' : 'Сохранённая анкета'} onClose={() => setSelection(null)}>
      <div className="history-dialog">
        {selection.kind === 'test' && (result ? <>
          <h3>{specializationLabels[result.specialization]} · {gradeLabels[result.grade]}</h3>
          <dl className="history-details">
            <div><dt>Дата</dt><dd><time dateTime={result.date}>{dateLabel(result.date)}</time></dd></div>
            <div><dt>Результат</dt><dd>{result.pending ? result.closedScore : result.score}/100 · {outcome(result)}</dd></div>
            {result.closedScore !== undefined && !result.pending && <div><dt>Части</dt><dd>закрытая {result.closedScore}/100{result.openScore !== undefined ? ` · практика ${result.openScore}/100` : result.openStatus === 'queued' ? ' · практика ждёт эксперта' : ''}</dd></div>}
            {result.openStatus && <div><dt>Проверка практики</dt><dd>{practiceMark(result)}{result.reviewedByExpert && result.review?.previousScore !== undefined ? ` · до перепроверки ${result.review.previousScore}/100` : ''}</dd></div>}
            <div><dt>Версия программы</dt><dd>{result.bankVersion || 'Не указана в старой записи'}</dd></div>
          </dl>
          {result.competencies?.length ? <section><h4>Компетенции</h4><dl className="history-details history-competencies">
            {result.competencies.map(item => <div key={item.topic}><dt>{item.topic}</dt><dd>{item.score}/100 · {item.correct} из {item.total}</dd></div>)}
          </dl></section> : null}
          {result.vacancySkills?.length ? <section><h4>Навыки вакансии</h4><div className="tags">{result.vacancySkills.map(skill => <span className="tag" key={skill}>{skill}</span>)}</div></section> : null}
          {result.pending && <p className="field-help">Закрытая часть пройдена; эксперт проверяет открытые задачи ({result.openCount}). Итог — половина закрытой и половина открытой части.</p>}
          {result.openStatus === 'ai' && <p className="field-help">Практические задачи оценены двумя моделями по критериям рубрики, каждый балл — с цитатой из ответа; эксперт может перепроверить оценку.</p>}
          {result.openStatus === 'queued' && !result.pending && <p className="field-help">Грейд определён по закрытой части; практические задачи ({result.openCount}) проверит эксперт.</p>}
          {result.openTimedOut && <p className="field-help">Время истекло на практическом этапе: задачи без ответа оценены нулём.</p>}
          {result.review?.note && <section><h4>Комментарий эксперта</h4><p className="history-review-note">{result.review.note}</p></section>}
          {result.review?.marks?.some(mark => mark.comment) && <section><h4>Открытые задачи</h4><ul className="history-review-marks">
            {result.review.marks.map((mark, index) => <li key={mark.questionId}>Задача {index + 1}: {mark.score}/100{mark.comment ? ' — ' + mark.comment : ''}</li>)}</ul></section>}
          <p className="field-help">Исторический результат. Текущая категория указана в профиле.</p>
          <div className="section-divider" />
        </> : <p className="muted">Результат больше не доступен в этой истории.</p>)}
        {selectedSurvey ? <SurveySnapshot survey={selectedSurvey} /> : <p className="history-missing-survey">{surveyId
          ? 'Связанная анкета не найдена среди сохранённых снимков. В старой записи мог сохраниться только результат теста.'
          : 'В этой старой записи нет ссылки на анкету. Текущий профиль не подменяет исторический снимок.'}</p>}
      </div>
    </Dialog>}
  </section>;
}
