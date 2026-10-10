import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, BadgeCheck, Ban, Check, ClipboardCheck, Clock3, EyeOff, Fingerprint, Hourglass, Layers, Maximize2, PenLine, RotateCcw, ShieldAlert, ShieldCheck, Timer } from 'lucide-react';
import { AssessmentError, answerAssessment, answerOpenTask, createAssessment, getAssessmentProgram, readAssessment, resumeAssessment, saveAssessment, submitAssessment, type AssessmentAttempt, type AssessmentProgram } from '../assessment';
import { CandidateSteps } from '../components/CandidateSteps';
import { CodeDraftBoundary } from '../components/CodeDraftBoundary';
import { categoryChangeUnlock, currentSurvey, dateLabel, gradeLabels, retakeUnlock, specializationNames, type Grade, type PlatformState, type TestResult } from '../model';
import { clearAssessmentGuard, enterFullscreen, fullscreenSupported, leaveFullscreen, maxStrikes, useAssessmentGuard } from '../use-assessment-guard';
import { defaultCodeLanguage, readCodeDrafts, type CodeDraft } from '../code-drafts';

const CodeEditor = lazy(() => import('../components/CodeEditor'));

function errorMessage(error: unknown) {
  return error instanceof AssessmentError ? error.message : 'Не удалось загрузить тест. Попробуйте ещё раз.';
}

function unavailableAttempt(error: unknown) {
  return error instanceof AssessmentError && [403, 404, 410].includes(error.status);
}

function clock(seconds: number) {
  const value = Math.max(0, Math.ceil(seconds));
  return Math.floor(value / 60) + ':' + String(value % 60).padStart(2, '0');
}

/** A repeated, faint mark ties any leaked screenshot to this attempt. */
function watermark(label: string) {
  const text = label.replace(/[<>&"]/gu, '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160"><text x="0" y="90" transform="rotate(-18 160 80)" fill="#202126" fill-opacity="0.055" font-family="Manrope, sans-serif" font-size="14">${text}</text></svg>`;
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
}

const strikeText = {
  focus_lost: 'Окно теста потеряло фокус.',
  visibility_hidden: 'Вы переключились на другую вкладку или свернули окно.',
  fullscreen_exit: 'Вы вышли из полноэкранного режима.',
  second_tab: 'Тест открыт во второй вкладке.',
} as const;

export function Assessment({ state, update, notify, onProfile, onSurvey, onActiveChange, watermarkLabel = '' }: {
  state: PlatformState; update: (fn: (state: PlatformState) => PlatformState) => void;
  notify: (message: string) => void; onProfile: () => void; onSurvey: () => void;
  onActiveChange?: (active: boolean) => void; watermarkLabel?: string;
}) {
  const [initialPath] = useState(!state.profile.confirmed);
  const [session, setSession] = useState<AssessmentAttempt | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [codeDrafts, setCodeDrafts] = useState<Record<string, CodeDraft>>({});
  const [draftStorageFailed, setDraftStorageFailed] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [program, setProgram] = useState<AssessmentProgram | null>(null);
  const [programBusy, setProgramBusy] = useState(true);
  const [programError, setProgramError] = useState('');
  const [programVersion, setProgramVersion] = useState(0);
  const [resumeBusy, setResumeBusy] = useState(true);
  const [resumePending, setResumePending] = useState(false);
  const [resumeVersion, setResumeVersion] = useState(0);
  const [busy, setBusy] = useState<'starting' | 'answering' | 'submitting' | null>(null);
  const [error, setError] = useState('');
  const [serverLock, setServerLock] = useState<{ retryAt?: string; lowerGrades?: string[] } | null>(null);
  const [rulesAccepted, setRulesAccepted] = useState(false);
  const [vacancyDescription, setVacancyDescription] = useState('');
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const actionController = useRef<AbortController | null>(null);
  const deadlineRef = useRef<{ id: string; expiresAt: string; serverNow: string; deadline: number } | null>(null);
  const questionDeadline = useRef<{ key: string; at: number } | null>(null);
  const expiredQuestion = useRef('');
  const autoGraded = useRef('');
  const protectedContent = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  // Text of the current open task; kept in this tab so a reload during the task keeps the draft.
  const [openText, setOpenText] = useState('');
  const openTextRef = useRef(openText);
  openTextRef.current = openText;
  const survey = currentSurvey(state);
  const surveyId = survey?.id;
  const specialization = session?.specialization || survey?.specialization || state.profile.specialization;
  const grade = session?.grade || survey?.desiredGrade || state.profile.desiredGrade;
  const total = session?.questionCount || session?.questions.length || 0;
  const position = session?.position ?? 0;
  const current = session?.questions[position];
  const isOpen = current?.type === 'open';
  const openDraftKey = session && current && isOpen ? 'predel:open-draft:' + session.id + ':' + current.id : '';
  useEffect(() => {
    if (!openDraftKey) { setOpenText(''); return; }
    try { setOpenText(sessionStorage.getItem(openDraftKey) || ''); } catch { setOpenText(''); }
  }, [openDraftKey]);
  useEffect(() => {
    if (!openDraftKey) return;
    try { if (openText) sessionStorage.setItem(openDraftKey, openText); else sessionStorage.removeItem(openDraftKey); } catch { /* The draft stays in memory. */ }
  }, [openDraftKey, openText]);
  const unlock = categoryChangeUnlock(state.profile, specialization, grade);
  const retake = retakeUnlock(state.history, specialization, grade, Date.now(), program?.retryDays ?? 7);
  const locked = unlock > Date.now() || Boolean(retake);
  const codeLanguage = defaultCodeLanguage(specialization);
  const mark = useMemo(() => watermark(`${watermarkLabel || 'predel'} · ${session?.id.slice(0, 8) || ''}`), [watermarkLabel, session?.id]);

  useEffect(() => {
    onActiveChange?.(!!session && !result);
    return () => onActiveChange?.(false);
  }, [session, result, onActiveChange]);

  const receiveResult = useCallback((attempt: TestResult, expectedSurveyId: string) => {
    clearAssessmentGuard(attempt.id);
    leaveFullscreen();
    const latestState = stateRef.current;
    if (attempt.surveyId !== expectedSurveyId || currentSurvey(latestState)?.id !== expectedSurveyId
      || attempt.passed && categoryChangeUnlock(latestState.profile, attempt.specialization, attempt.grade) > Date.now()) {
      saveAssessment(null); setSession(null); setCodeDrafts({});
      setError('Анкета изменилась. Пройдите тест заново.');
      return;
    }
    update(previousState => {
      if (previousState.history.some(item => item.id === attempt.id) || currentSurvey(previousState)?.id !== expectedSurveyId) return previousState;
      if (attempt.passed && categoryChangeUnlock(previousState.profile, attempt.specialization, attempt.grade) > Date.now()) return previousState;
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
    saveAssessment(null); setResult(attempt); setSession(null); setSelected(null); setCodeDrafts({}); setError('');
    notify(attempt.annulled ? 'Попытка аннулирована' : 'Результат сохранён');
  }, [update, notify]);

  const guard = useAssessmentGuard(session, busy === 'submitting', protectedContent, {
    onAnnulled: annulled => { if (session) receiveResult(annulled, session.surveyId); },
  });

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
        const currentQuestion = attempt.questions[attempt.position ?? 0];
        const restored = currentQuestion && saved.answers[currentQuestion.id];
        setSession({ ...attempt, token: saved.token });
        setSelected(currentQuestion?.options.some(option => option.id === restored) ? restored : null);
        setCodeDrafts(readCodeDrafts(saved.codeDrafts, attempt.questions.map(question => question.id)));
        setResult(null);
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
    if (session) setDraftStorageFailed(!saveAssessment({ id: session.id, token: session.token, surveyId: session.surveyId,
      answers: current && selected ? { [current.id]: selected } : {}, index: position, codeDrafts }));
  }, [session, current, selected, position, codeDrafts]);

  // Whole-attempt deadline, measured from the server clock.
  useEffect(() => {
    if (!session || !session.serverNow) { deadlineRef.current = null; return; }
    const expiresAt = Date.parse(session.expiresAt);
    const serverNow = Date.parse(session.serverNow);
    if (!Number.isFinite(expiresAt) || !Number.isFinite(serverNow)) return;
    let deadline = deadlineRef.current;
    if (!deadline || deadline.id !== session.id || deadline.expiresAt !== session.expiresAt) {
      deadline = { id: session.id, expiresAt: session.expiresAt, serverNow: session.serverNow, deadline: performance.now() + Math.max(0, expiresAt - serverNow) };
      deadlineRef.current = deadline;
    }
    if (busy) return;
    const deadlineAt = deadline.deadline;
    const checkDeadline = () => {
      if (performance.now() < deadlineAt) return;
      clearAssessmentGuard(session.id); leaveFullscreen();
      saveAssessment(null); setSession(null); setCodeDrafts({});
      setError('Время теста истекло. Начните новую попытку.');
    };
    checkDeadline();
    const timer = window.setInterval(checkDeadline, 1000);
    return () => window.clearInterval(timer);
  }, [session, busy]);

  useEffect(() => () => actionController.current?.abort(), []);

  // A restored attempt whose answers are all locked only needs grading.
  useEffect(() => {
    if (!session || !total || position < total || busy || actionController.current || autoGraded.current === session.id) return;
    autoGraded.current = session.id;
    void finish(session);
  });

  async function finish(attempt: AssessmentAttempt) {
    const controller = new AbortController(); actionController.current = controller;
    setBusy('submitting'); setError('');
    try {
      const graded = await submitAssessment(attempt, controller.signal);
      if (!controller.signal.aborted) receiveResult(graded, attempt.surveyId);
    } catch (reason) {
      if (controller.signal.aborted) return;
      try {
        const recovered = await resumeAssessment({ id: attempt.id, token: attempt.token, surveyId: attempt.surveyId, answers: {}, index: 0 }, controller.signal);
        if (!controller.signal.aborted && recovered.status === 'completed' && recovered.result) { receiveResult(recovered.result, attempt.surveyId); return; }
      } catch { /* Keep the attempt available for a manual retry. */ }
      if (unavailableAttempt(reason)) { saveAssessment(null); setSession(null); setCodeDrafts({}); leaveFullscreen(); }
      setError(errorMessage(reason));
    } finally {
      if (!controller.signal.aborted) setBusy(null);
      if (actionController.current === controller) actionController.current = null;
    }
  }

  const answer = useCallback(async (value: string | null) => {
    if (!session || !current || actionController.current) return;
    const controller = new AbortController(); actionController.current = controller;
    setBusy('answering'); setError('');
    let next: AssessmentAttempt | null = null;
    try {
      const response = current.type === 'open'
        ? await answerOpenTask(session, current.id, value && value.trim() ? value : null, controller.signal)
        : await answerAssessment(session, current.id, value, controller.signal);
      if (controller.signal.aborted) return;
      next = { ...response, token: session.token };
      setSession(next); setSelected(null);
    } catch (reason) {
      if (controller.signal.aborted) return;
      if (reason instanceof AssessmentError && reason.status === 409) {
        try {
          const restored = await resumeAssessment({ id: session.id, token: session.token, surveyId: session.surveyId, answers: {}, index: 0 }, controller.signal);
          if (restored.status === 'completed' && restored.result) { receiveResult(restored.result, session.surveyId); return; }
          setSession({ ...restored, token: session.token }); setSelected(null);
        } catch { setError(errorMessage(reason)); }
      } else {
        if (unavailableAttempt(reason)) { saveAssessment(null); setSession(null); setCodeDrafts({}); leaveFullscreen(); }
        setError(errorMessage(reason));
      }
    } finally {
      if (actionController.current === controller) actionController.current = null;
      if (!controller.signal.aborted) setBusy(null);
    }
    if (next?.complete) { autoGraded.current = next.id; await finish(next); }
  }, [session, current, receiveResult]);

  // Per-question countdown from the server deadline; at zero the current choice is locked.
  useEffect(() => {
    if (!session?.currentDeadline || !session.serverNow || !current) { questionDeadline.current = null; setRemainingSeconds(null); return; }
    const key = session.id + ':' + current.id;
    if (questionDeadline.current?.key !== key) {
      questionDeadline.current = { key, at: performance.now() + Date.parse(session.currentDeadline) - Date.parse(session.serverNow) };
    }
    const tick = () => {
      const left = ((questionDeadline.current?.at || 0) - performance.now()) / 1000;
      setRemainingSeconds(left);
      if (left <= 0 && !actionController.current && expiredQuestion.current !== key) {
        expiredQuestion.current = key;
        void answer(current?.type === 'open' ? openTextRef.current : selectedRef.current);
      }
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [session, current, answer]);

  async function start() {
    if (!survey || locked || !program || resumeBusy || resumePending || actionController.current) return;
    if (!rulesAccepted) return;
    // Full screen needs the click's user activation, so it is requested before the network call.
    await enterFullscreen();
    const controller = new AbortController(); actionController.current = controller;
    setBusy('starting'); setError(''); setServerLock(null);
    try {
      const attempt = await createAssessment(survey, vacancyDescription, controller.signal);
      if (controller.signal.aborted) return;
      if (currentSurvey(stateRef.current)?.id !== survey.id) { setError('Анкета изменилась. Пройдите тест заново.'); leaveFullscreen(); return; }
      saveAssessment({ id: attempt.id, token: attempt.token, surveyId: attempt.surveyId, answers: {}, index: 0 });
      setSession(attempt); setSelected(null); setCodeDrafts({}); setResult(null);
    } catch (reason) {
      if (!controller.signal.aborted) {
        leaveFullscreen();
        setError(errorMessage(reason));
        if (reason instanceof AssessmentError && reason.status === 409 && reason.details.retryAt) setServerLock(reason.details);
      }
    } finally {
      if (!controller.signal.aborted) setBusy(null);
      if (actionController.current === controller) actionController.current = null;
    }
  }

  const lowerGrades = (serverLock?.lowerGrades as Grade[] | undefined) || retake?.lowerGrades || [];
  const retryAt = serverLock?.retryAt ? Date.parse(serverLock.retryAt) : retake?.until;
  const warning = remainingSeconds !== null && remainingSeconds <= 20;

  return <>
    {initialPath && <CandidateSteps step={result?.passed ? 2 : 1} />}
    <div className="page-heading"><h1>Тестирование</h1></div>
    {error && <div className="assessment-error" role="alert"><span>{error}</span>{resumePending && !resumeBusy && <button className="text-button" onClick={() => setResumeVersion(value => value + 1)}>Восстановить тест</button>}</div>}
    {resumeBusy ? <section className="panel" aria-busy="true"><p className="muted">Восстанавливаем тест…</p></section>
      : result ? <section className="panel assessment-result">
        <div className={'result-icon ' + (result.passed ? 'result-passed' : result.annulled ? 'result-annulled' : result.pending ? 'result-pending' : '')}>{result.passed ? <BadgeCheck size={34} /> : result.annulled ? <ShieldAlert size={32} /> : result.pending ? <Hourglass size={30} /> : <RotateCcw size={30} />}</div>
        {!result.annulled && <span className="result-score">{result.pending ? result.closedScore : result.score}<small>/100</small></span>}
        <h2>{result.annulled ? 'Попытка аннулирована' : result.pending ? 'Ответы на проверке' : result.passed ? 'Грейд подтверждён' : 'Грейд не подтверждён'}</h2>
        <p className="muted">{specializationNames[result.specialization]} · {gradeLabels[result.grade]}</p>
        {result.pending && <p className="result-note">Закрытая часть пройдена. Эксперт проверит открытые задачи ({result.openCount}) по критериям; итог — половина закрытой и половина открытой части, порог 70. Результат появится в истории и профиле.</p>}
        {result.annulled && <p className="result-note">Зафиксировано {result.integrity?.departures ?? maxStrikes} ухода со страницы теста. Повтор на этот грейд — через {program?.retryDays ?? 7} дн.{state.profile.confirmed ? '' : ', тест на грейд ниже доступен сразу'}.</p>}
        {result.competencies?.length ? <dl className="competency-results">{result.competencies.map(item => <div key={item.topic}><dt>{item.topic}</dt><dd>{item.score}/100</dd></div>)}</dl> : null}
        {result.clarified && <p className="field-help">Решение принято по {result.questionCount} вопросам: первые 12 дали пограничный результат, и тест добавил уточняющий блок.</p>}
        {!!result.timeouts && !result.annulled && <p className="field-help">Без ответа или после лимита времени: {result.timeouts}.</p>}
        {result.nextGradeAvailable && <div className="next-grade-offer"><ArrowUpRight size={18} /><span>Уверенный результат: тест на {gradeLabels[result.nextGradeAvailable]} доступен без ожидания.</span><button className="text-button" onClick={onSurvey}>Выбрать грейд</button></div>}
        {!result.passed && !result.annulled && !result.pending && state.profile.confirmed && <p className="result-note">Ваша категория {specializationNames[state.profile.confirmed.specialization]} · {gradeLabels[state.profile.confirmed.grade]} сохранена.</p>}
        {!result.passed && !result.annulled && !result.pending && <p className="field-help">Повтор на этот грейд — через {program?.retryDays ?? 7} дн.{state.profile.confirmed ? '' : ' Тест на грейд ниже доступен сразу и не сжигает попытку.'}</p>}
        <div className="button-group"><button className="button secondary" onClick={onSurvey}>Изменить анкету</button>{result.passed || result.pending ? <button className="button primary" onClick={onProfile}>К профилю</button> : <button className="button primary" onClick={() => setResult(null)}>К программе теста</button>}</div>
      </section> : current && session ? <section className={'panel exam-panel' + (guard.fullscreen ? ' exam-fullscreen' : '')} aria-busy={busy === 'submitting'}>
        <div className="exam-header">
          <span>{specializationNames[specialization]} · {gradeLabels[grade]}</span>
          <div className="exam-meta">
            <span className={'exam-strikes' + (guard.strikes ? ' has-strikes' : '')} title="Уходы со страницы теста"><ShieldCheck size={15} />Нарушений {guard.strikes} из {maxStrikes}</span>
            {remainingSeconds !== null && <span className={'exam-timer' + (warning ? ' warning' : '')} role="timer" aria-label="Время на вопрос"><Timer size={15} />{clock(remainingSeconds)}</span>}
            <span className="muted">Вопрос {position + 1} из {total}</span>
          </div>
        </div>
        <div className="exam-progress" role="progressbar" aria-label="Прогресс теста" aria-valuemin={0} aria-valuemax={total} aria-valuenow={position + 1}><span style={{ width: ((position + 1) / Math.max(total, 1) * 100) + '%' }} /></div>
        {session.extension && position >= session.extension.from && <div className="exam-clarify" role="status"><Layers size={16} /><span>Результат пограничный — ещё {session.extension.added} вопросов уточнят решение. Порог прежний: 70 из 100 по всем вопросам.</span></div>}
        {session.openStage && position === session.openStage.from && <div className="exam-clarify exam-open-stage" role="status"><PenLine size={16} /><span>Закрытая часть пройдена. Осталось {session.openStage.added} практические задачи — их проверит эксперт по критериям.</span></div>}
        {position === 0 && session.vacancy && <div className="vacancy-summary">
          {session.vacancy.matchedSkills.length ? <div className="tags" aria-label="Навыки из вакансии">{session.vacancy.matchedSkills.map(skill => <span key={skill}>{skill}</span>)}</div> : <p className="field-help">Совпадений для этого варианта нет. Используется стандартная программа.</p>}
          {session.vacancy.unmatchedSkills.length > 0 && <p className="field-help">Без проверки: {session.vacancy.unmatchedSkills.join(', ')}.</p>}
        </div>}
        {guard.paused ? <div className="exam-focus-cover" role="alertdialog" aria-labelledby="exam-paused-title">
          <ShieldAlert size={30} className="exam-cover-icon" />
          <h2 id="exam-paused-title">Вы покинули тест</h2>
          <p>{guard.lastStrike ? strikeText[guard.lastStrike] : 'Окно теста было неактивно.'} Нарушение {Math.min(guard.strikes, maxStrikes)} из {maxStrikes}.</p>
          <p className="muted">{guard.remaining > 0 ? `Ещё ${guard.remaining === 1 ? 'один уход' : 'два ухода'} — и попытка будет аннулирована. ` : ''}Вопрос скрыт, время на него продолжает идти.</p>
          <button className="button primary" onClick={() => void guard.continueTest()}>Вернуться к тесту</button>
        </div> : guard.shielded ? <div className="exam-focus-cover" role="status"><EyeOff size={28} className="exam-cover-icon" /><h2>Снимок экрана недоступен</h2><p className="muted">Попытка отмечена в журнале контроля.</p></div> : <>
          <div className="exam-protected-content" ref={protectedContent} style={{ backgroundImage: mark }}>
            <span className="question-topic">{current.topic}</span>
            {isOpen ? <>
              {current.title && <h2 className="open-task-title">{current.title}</h2>}
              <p className="question-text open-task-text">{current.text}</p>
              <label className="field open-answer"><span>Ваше решение{current.answerFormat === 'code' ? ' — код и пояснение' : current.answerFormat === 'sql' ? ' — запрос и пояснение' : ''}</span>
                <textarea value={openText} disabled={!!busy} rows={12} maxLength={12000} spellCheck={false}
                  className={current.answerFormat === 'code' || current.answerFormat === 'sql' ? 'monospace' : undefined}
                  onChange={event => setOpenText(event.target.value)} placeholder="Ход решения, код или запрос, проверка граничных случаев" /></label>
              <p className="field-help">{openText.length} / 12 000 · оценивается экспертом по критериям; вставка из буфера отключена</p>
            </> : <><h2 className="question-text">{current.text}</h2>
            <fieldset className="answer-options" disabled={!!busy}><legend className="sr-only">Варианты ответа</legend>{current.options.map(option => <label key={option.id} className={'answer-option' + (selected === option.id ? ' selected' : '')}><input type="radio" name={current.id} checked={selected === option.id} onChange={() => setSelected(option.id)} /><span>{option.text}</span>{selected === option.id && <Check size={17} />}</label>)}</fieldset></>}
          </div>
          {codeLanguage && !isOpen && <details className="exam-code-draft" key={session.id + ':' + current.id} open={['ML', 'DataAnalysis', 'DataEngineering'].includes(specialization)}>
            <summary>Черновик кода</summary>
            <p className="field-help">Сохраняется в этой вкладке и не оценивается. Для оценки выберите вариант ответа.</p>
            <CodeDraftBoundary><Suspense fallback={<p className="field-help" role="status">Загружаем редактор…</p>}>
              <CodeEditor value={codeDrafts[current.id] || { language: codeLanguage, source: '' }} disabled={!!busy}
                onChange={draft => setCodeDrafts(previous => ({ ...previous, [current.id]: draft }))} />
            </Suspense></CodeDraftBoundary>
            {draftStorageFailed && <p className="field-help" role="alert">Черновик не сохранён. Оставьте вкладку открытой.</p>}
          </details>}
          <div className="exam-actions">
            <button className="text-button" disabled={!!busy} onClick={() => void answer(null)}>{isOpen ? 'Пропустить задачу' : 'Пропустить вопрос'}</button>
            <button className="button primary" disabled={(isOpen ? !openText.trim() : !selected) || !!busy} onClick={() => void answer(isOpen ? openText : selected)}>{busy === 'submitting' ? 'Проверяем…' : busy === 'answering' ? 'Сохраняем…' : position === total - 1 ? 'Завершить тест' : 'Ответить'}</button>
          </div>
          <p className="exam-footnote">Ответ фиксируется сразу — вернуться к вопросу нельзя.</p>
        </>}
        {guard.auditUnavailable && <p className="field-help" role="status">Событие контроля не сохранено.</p>}
      </section> : session && total > 0 && position >= total ? <section className="panel exam-panel exam-submit" aria-busy={busy === 'submitting'}>
        <ShieldCheck size={30} className="exam-submit-icon" />
        <h2>Все ответы сохранены</h2>
        <p className="muted">Ответы зафиксированы на сервере. Осталось получить результат проверки.</p>
        <button className="button primary" disabled={!!busy} onClick={() => void finish(session)}>{busy === 'submitting' ? 'Проверяем…' : 'Получить результат'}</button>
      </section> : <div className="assessment-layout">
        <section className="panel assessment-setup"><div className="assessment-category"><strong>{specializationNames[specialization]} · {gradeLabels[grade]}</strong><button className="text-button" onClick={onSurvey}>Изменить анкету</button></div>
          {programBusy ? <p className="muted" role="status">Загружаем программу…</p> : programError ? <div className="assessment-error" role="alert"><span>{programError}</span><button className="text-button" onClick={() => setProgramVersion(value => value + 1)}>Повторить</button></div> : program && <>
            <div className="assessment-info"><div><ClipboardCheck size={18} /><span>{program.questionCount} вопросов</span></div><div><Clock3 size={18} /><span>{Math.round(program.questionSeconds / 60)} мин на вопрос</span></div><div><BadgeCheck size={18} /><span>Порог {program.threshold}/100</span></div></div>
            <h2 className="section-heading">Программа</h2><div className="competency-list">{program.topics.map(topic => <div key={topic}><Check size={15} />{topic}</div>)}</div>
            <p className="assessment-bank"><Layers size={15} />Банк: {program.bank.authored} авторских заданий{program.bank.generated && program.bank.generated.active + program.bank.generated.pilot > 0 ? ` и ${program.bank.generated.active + program.bank.generated.pilot} сгенерированных` : ''}. Каждый кандидат получает свой набор равной сложности.</p>
            <details className="vacancy-builder"><summary>По вакансии</summary><label className="field"><span>Описание вакансии</span><textarea value={vacancyDescription} onChange={event => setVacancyDescription(event.target.value)} maxLength={4000} rows={4} placeholder="Роль, стек и задачи" disabled={busy === 'starting'} /></label>
              <div className="vacancy-examples">{program.examples.map(example => <button type="button" className="filter-chip" key={example.id} onClick={() => setVacancyDescription(example.description)} disabled={busy === 'starting'}>{example.title}</button>)}</div>
            </details>
            <section className="exam-rules" aria-label="Правила теста">
              <h2 className="section-heading">Правила</h2>
              <ul>
                <li><Maximize2 size={16} /><span>Тест идёт в полноэкранном режиме{fullscreenSupported() ? '' : ' (в этом браузере недоступен — следите за вкладкой)'}.</span></li>
                <li><EyeOff size={16} /><span>Переход на другую вкладку, в другое окно или выход из полноэкранного режима — нарушение. После {program.maxDepartures}-го попытка аннулируется.</span></li>
                <li><Timer size={16} /><span>На каждый вопрос — {Math.round(program.questionSeconds / 60)} минуты. Вопросы показываются по одному, вернуться к прошлому нельзя.</span></li>
                <li><Layers size={16} /><span>Если порог пройден впритык (9 верных из 12), тест добавит 6 уточняющих вопросов — так подтверждённый грейд надёжнее.</span></li>
                <li><Ban size={16} /><span>Копирование, вставка, печать, снимки экрана и инструменты разработчика отключены.</span></li>
                <li><Fingerprint size={16} /><span>Вопросы помечены водяным знаком вашей попытки.</span></li>
              </ul>
              <label className="checkbox-field"><input type="checkbox" checked={rulesAccepted} onChange={event => { setRulesAccepted(event.target.checked); setError(''); }} /><span>Ознакомлен с правилами и готов начать</span></label>
            </section>
          </>}
          {state.profile.confirmed && <p className="assessment-rules">Неудачный тест сохраняет грейд. Смена категории — раз в 90 дней; результат от 90 баллов сразу открывает следующий грейд.</p>}
          {unlock > Date.now() && <div className="inline-notice"><Clock3 size={17} />Смена категории доступна с {dateLabel(new Date(unlock).toISOString())}</div>}
          {retryAt && !(unlock > Date.now()) && <div className="inline-notice"><Clock3 size={17} /><div><p>Повтор на этот грейд — с {dateLabel(new Date(retryAt).toISOString())}</p>{lowerGrades.length > 0 && <p>Сейчас доступен тест на: {lowerGrades.map(item => gradeLabels[item]).join(', ')}.</p>}</div></div>}
          <div className="form-actions"><button className="button primary" disabled={!survey || locked || !program || programBusy || !!busy || resumePending || !rulesAccepted} onClick={() => void start()}>{busy === 'starting' ? 'Формируем тест…' : 'Начать тест'}</button></div>
        </section>
      </div>}
  </>;
}
