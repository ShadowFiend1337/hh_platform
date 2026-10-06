import { useCallback, useEffect, useRef, useState } from 'react';
import { BadgeCheck, Check, ClipboardCheck, Clock3, RotateCcw } from 'lucide-react';
import { AssessmentError, createAssessment, getAssessmentProgram, readAssessment, resumeAssessment, saveAssessment, submitAssessment, type AssessmentAttempt, type AssessmentProgram } from '../assessment';
import { CandidateSteps } from '../components/CandidateSteps';
import { categoryChangeUnlock, currentSurvey, dateLabel, gradeLabels, specializationNames, type PlatformState, type TestResult } from '../model';

function errorMessage(error: unknown) {
  return error instanceof AssessmentError ? error.message : 'Не удалось загрузить тест. Попробуйте ещё раз.';
}

function unavailableAttempt(error: unknown) {
  return error instanceof AssessmentError && [403, 404, 410].includes(error.status);
}

export function Assessment({ state, update, notify, onProfile, onSurvey }: {
  state: PlatformState; update: (fn: (state: PlatformState) => PlatformState) => void;
  notify: (message: string) => void; onProfile: () => void; onSurvey: () => void;
}) {
  const [initialPath] = useState(!state.profile.confirmed);
  const [session, setSession] = useState<AssessmentAttempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<TestResult | null>(null);
  const [program, setProgram] = useState<AssessmentProgram | null>(null);
  const [programBusy, setProgramBusy] = useState(true);
  const [programError, setProgramError] = useState('');
  const [programVersion, setProgramVersion] = useState(0);
  const [resumeBusy, setResumeBusy] = useState(true);
  const [resumePending, setResumePending] = useState(false);
  const [resumeVersion, setResumeVersion] = useState(0);
  const [busy, setBusy] = useState<'starting' | 'submitting' | null>(null);
  const [error, setError] = useState('');
  const [vacancyDescription, setVacancyDescription] = useState('');
  const actionController = useRef<AbortController | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const survey = currentSurvey(state);
  const surveyId = survey?.id;
  const specialization = session?.specialization || survey?.specialization || state.profile.specialization;
  const grade = session?.grade || survey?.desiredGrade || state.profile.desiredGrade;
  const exam = session?.questions || [];
  const current = exam[index];
  const unlock = categoryChangeUnlock(state.profile, specialization, grade);
  const locked = unlock > Date.now();

  const receiveResult = useCallback((attempt: TestResult, expectedSurveyId: string) => {
    const latestState = stateRef.current;
    if (attempt.surveyId !== expectedSurveyId || currentSurvey(latestState)?.id !== expectedSurveyId
      || categoryChangeUnlock(latestState.profile, attempt.specialization, attempt.grade) > Date.now()) {
      saveAssessment(null); setSession(null); setAnswers({});
      setError('Анкета изменилась. Пройдите тест заново.');
      return;
    }
    update(previousState => {
      if (previousState.history.some(item => item.id === attempt.id)
        || currentSurvey(previousState)?.id !== expectedSurveyId
        || categoryChangeUnlock(previousState.profile, attempt.specialization, attempt.grade) > Date.now()) return previousState;
      const confirmed = previousState.profile.confirmed;
      const changed = !confirmed || confirmed.grade !== attempt.grade || confirmed.specialization !== attempt.specialization;
      return {
        ...previousState, history: [attempt, ...previousState.history],
        profile: attempt.passed ? {
          ...previousState.profile,
          confirmed: { specialization: attempt.specialization, grade: attempt.grade, score: attempt.score, date: attempt.date, surveyId: expectedSurveyId },
          gradeChangedAt: changed ? attempt.date : previousState.profile.gradeChangedAt || confirmed?.date,
        } : previousState.profile,
      };
    });
    saveAssessment(null); setResult(attempt); setSession(null); setAnswers({}); setError('');
    notify('Результат сохранён');
  }, [update, notify]);

  useEffect(() => {
    const controller = new AbortController();
    setProgram(null); setProgramBusy(true); setProgramError('');
    getAssessmentProgram(specialization, grade, controller.signal).then(value => {
      if (!controller.signal.aborted) setProgram(value);
    }).catch(reason => {
      if (!controller.signal.aborted) setProgramError(errorMessage(reason));
    }).finally(() => {
      if (!controller.signal.aborted) setProgramBusy(false);
    });
    return () => controller.abort();
  }, [specialization, grade, programVersion]);

  useEffect(() => {
    const controller = new AbortController();
    const saved = readAssessment();
    if (!saved || saved.surveyId !== surveyId) {
      if (saved) saveAssessment(null);
      setResumeBusy(false); setResumePending(false);
      return () => controller.abort();
    }
    setResumeBusy(true); setResumePending(true); setError('');
    resumeAssessment(saved, controller.signal).then(attempt => {
      if (controller.signal.aborted) return;
      if (attempt.surveyId !== saved.surveyId || currentSurvey(stateRef.current)?.id !== saved.surveyId) {
        saveAssessment(null); setResumePending(false); return;
      }
      if (attempt.status === 'completed' && attempt.result) receiveResult(attempt.result, saved.surveyId);
      else {
        const restoredAnswers = Object.fromEntries(attempt.questions.flatMap(question => {
          const answer = saved.answers[question.id];
          return question.options.some(option => option.id === answer) ? [[question.id, answer]] : [];
        }));
        setSession({ ...attempt, token: saved.token }); setAnswers(restoredAnswers);
        setIndex(Math.min(saved.index, attempt.questions.length - 1)); setResult(null);
      }
      setResumePending(false);
    }).catch(reason => {
      if (controller.signal.aborted) return;
      if (unavailableAttempt(reason)) { saveAssessment(null); setResumePending(false); }
      setError(errorMessage(reason));
    }).finally(() => {
      if (!controller.signal.aborted) setResumeBusy(false);
    });
    return () => controller.abort();
  }, [surveyId, resumeVersion, receiveResult]);

  useEffect(() => {
    if (session) saveAssessment({ id: session.id, token: session.token, surveyId: session.surveyId, answers, index });
  }, [session, answers, index]);

  useEffect(() => () => actionController.current?.abort(), []);

  async function start() {
    if (!survey || locked || !program || resumeBusy || resumePending || actionController.current) return;
    const controller = new AbortController(); actionController.current = controller;
    setBusy('starting'); setError('');
    try {
      const attempt = await createAssessment(survey, vacancyDescription, controller.signal);
      if (controller.signal.aborted) return;
      if (currentSurvey(stateRef.current)?.id !== survey.id
        || categoryChangeUnlock(stateRef.current.profile, attempt.specialization, attempt.grade) > Date.now()) {
        setError('Анкета изменилась. Пройдите тест заново.'); return;
      }
      saveAssessment({ id: attempt.id, token: attempt.token, surveyId: attempt.surveyId, answers: {}, index: 0 });
      setSession(attempt); setAnswers({}); setIndex(0); setResult(null);
    } catch (reason) {
      if (!controller.signal.aborted) setError(errorMessage(reason));
    } finally {
      if (!controller.signal.aborted) setBusy(null);
      if (actionController.current === controller) actionController.current = null;
    }
  }

  async function finish() {
    if (!session || !exam.length || actionController.current || exam.some(item => !answers[item.id])) return;
    if (!survey || survey.id !== session.surveyId || categoryChangeUnlock(state.profile, specialization, grade) > Date.now()) {
      saveAssessment(null); setSession(null); setAnswers({}); setError('Анкета изменилась. Пройдите тест заново.'); return;
    }
    const controller = new AbortController(); actionController.current = controller;
    setBusy('submitting'); setError('');
    try {
      const attempt = await submitAssessment(session, answers, controller.signal);
      if (!controller.signal.aborted) receiveResult(attempt, session.surveyId);
    } catch (reason) {
      if (!controller.signal.aborted) {
        if (reason instanceof AssessmentError && reason.status === 409) {
          try {
            const recovered = await resumeAssessment({ id: session.id, token: session.token, surveyId: session.surveyId, answers, index }, controller.signal);
            if (!controller.signal.aborted && recovered.status === 'completed' && recovered.result) {
              receiveResult(recovered.result, session.surveyId); return;
            }
          } catch { /* Keep the submitted answers available if recovery also fails. */ }
        }
        if (controller.signal.aborted) return;
        if (unavailableAttempt(reason)) { saveAssessment(null); setSession(null); setAnswers({}); }
        setError(errorMessage(reason));
      }
    } finally {
      if (!controller.signal.aborted) setBusy(null);
      if (actionController.current === controller) actionController.current = null;
    }
  }

  return <>
    {initialPath && <CandidateSteps step={result?.passed ? 2 : 1} />}
    <div className="page-heading"><h1>Тестирование</h1></div>
    {error && <div className="assessment-error" role="alert"><span>{error}</span>{resumePending && !resumeBusy && <button className="text-button" onClick={() => setResumeVersion(value => value + 1)}>Восстановить тест</button>}</div>}
    {resumeBusy ? <section className="panel" aria-busy="true"><p className="muted">Восстанавливаем тест…</p></section>
      : result ? <section className="panel assessment-result">
        <div className={'result-icon ' + (result.passed ? 'result-passed' : '')}>{result.passed ? <BadgeCheck size={34} /> : <RotateCcw size={30} />}</div>
        <span className="result-score">{result.score}<small>/100</small></span>
        <h2>{result.passed ? 'Грейд подтверждён' : 'Грейд не подтверждён'}</h2>
        <p className="muted">{specializationNames[result.specialization]} · {gradeLabels[result.grade]}</p>
        {result.competencies?.length ? <dl className="competency-results">{result.competencies.map(item => <div key={item.topic}><dt>{item.topic}</dt><dd>{item.score}/100</dd></div>)}</dl> : null}
        {!result.passed && state.profile.confirmed && <p className="result-note">Ваша категория {specializationNames[state.profile.confirmed.specialization]} · {gradeLabels[state.profile.confirmed.grade]} сохранена.</p>}
        <div className="button-group"><button className="button secondary" onClick={onSurvey}>Изменить анкету</button>{result.passed ? <button className="button primary" onClick={onProfile}>К профилю</button> : <button className="button primary" onClick={() => setResult(null)}>Попробовать снова</button>}</div>
      </section> : current ? <section className="panel exam-panel" aria-busy={busy === 'submitting'}>
        <div className="exam-header"><span>{specializationNames[specialization]} · {gradeLabels[grade]}</span><span className="muted">Вопрос {index + 1} из {exam.length}</span></div>
        <div className="exam-progress" role="progressbar" aria-label="Прогресс теста" aria-valuemin={0} aria-valuemax={exam.length} aria-valuenow={index + 1}><span style={{ width: ((index + 1) / exam.length * 100) + '%' }} /></div>
        {index === 0 && session?.vacancy && <div className="vacancy-summary">
          {session.vacancy.matchedSkills.length ? <div className="tags" aria-label="Навыки из вакансии">{session.vacancy.matchedSkills.map(skill => <span key={skill}>{skill}</span>)}</div> : <p className="field-help">Совпадений для этого варианта нет. Используется стандартная программа.</p>}
          {session.vacancy.unmatchedSkills.length > 0 && <p className="field-help">Без проверки: {session.vacancy.unmatchedSkills.join(', ')}.</p>}
        </div>}
        <span className="question-topic">{current.topic}</span><h2 className="question-text">{current.text}</h2>
        <fieldset className="answer-options" disabled={busy === 'submitting'}><legend className="sr-only">Варианты ответа</legend>{current.options.map(option => <label key={option.id} className={'answer-option' + (answers[current.id] === option.id ? ' selected' : '')}><input type="radio" name={current.id} checked={answers[current.id] === option.id} onChange={() => setAnswers(previousAnswers => ({ ...previousAnswers, [current.id]: option.id }))} /><span>{option.text}</span>{answers[current.id] === option.id && <Check size={17} />}</label>)}</fieldset>
        <div className="exam-actions"><button className="button secondary" disabled={index === 0 || busy === 'submitting'} onClick={() => { setError(''); setIndex(index - 1); }}>Назад</button><button className="button primary" disabled={!answers[current.id] || busy === 'submitting'} onClick={() => index === exam.length - 1 ? finish() : setIndex(index + 1)}>{busy === 'submitting' ? 'Проверяем…' : index === exam.length - 1 ? 'Завершить тест' : 'Далее'}</button></div>
      </section> : <div className="assessment-layout">
        <section className="panel assessment-setup"><div className="assessment-category"><strong>{specializationNames[specialization]} · {gradeLabels[grade]}</strong><button className="text-button" onClick={onSurvey}>Изменить анкету</button></div>
          {programBusy ? <p className="muted" role="status">Загружаем программу…</p> : programError ? <div className="assessment-error" role="alert"><span>{programError}</span><button className="text-button" onClick={() => setProgramVersion(value => value + 1)}>Повторить</button></div> : program && <>
            <div className="assessment-info"><div><ClipboardCheck size={18} /><span>{program.questionCount} вопросов</span></div><div><Clock3 size={18} /><span>{program.expiresInMinutes} минут</span></div></div>
            <h2 className="section-heading">Программа</h2><div className="competency-list">{program.topics.map(topic => <div key={topic}><Check size={15} />{topic}</div>)}</div>
            <p className="field-help">Порог подтверждения — {program.threshold}/100.</p>
            <details className="vacancy-builder"><summary>По вакансии</summary><label className="field"><span>Описание вакансии</span><textarea value={vacancyDescription} onChange={event => setVacancyDescription(event.target.value)} maxLength={4000} rows={4} placeholder="Роль, стек и задачи" disabled={busy === 'starting'} /></label>
              <div className="vacancy-examples">{program.examples.map(example => <button type="button" className="filter-chip" key={example.id} onClick={() => setVacancyDescription(example.description)} disabled={busy === 'starting'}>{example.title}</button>)}</div>
            </details>
          </>}
          {state.profile.confirmed && <p className="assessment-rules">Неудачный тест сохраняет грейд. Смена категории — раз в 90 дней.</p>}
          {locked && <div className="inline-notice"><Clock3 size={17} />Смена категории доступна с {dateLabel(new Date(unlock).toISOString())}</div>}
          <div className="form-actions"><button className="button primary" disabled={!survey || locked || !program || programBusy || !!busy || resumePending} onClick={start}>{busy === 'starting' ? 'Формируем тест…' : 'Начать тест'}</button></div>
        </section>
      </div>}
  </>;
}
