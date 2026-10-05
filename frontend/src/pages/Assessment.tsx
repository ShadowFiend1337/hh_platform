import { useState } from 'react';
import { BadgeCheck, Check, ClipboardCheck, Clock3, RotateCcw } from 'lucide-react';
import { createExam, type Question } from '../questions';
import { dateLabel, type Grade, type PlatformState, type Specialization, type TestResult } from '../model';

export function Assessment({ state, update, notify, onProfile }: {
  state: PlatformState; update: (fn: (state: PlatformState) => PlatformState) => void;
  notify: (message: string) => void; onProfile: () => void;
}) {
  const [specialization, setSpecialization] = useState<Specialization>(state.profile.specialization);
  const [grade, setGrade] = useState<Grade>(state.profile.desiredGrade);
  const [exam, setExam] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<TestResult | null>(null);
  const current = exam[index];
  const previous = state.profile.confirmed;
  const changesGrade = previous && (previous.grade !== grade || previous.specialization !== specialization);
  const nextDate = previous ? new Date(state.profile.gradeChangedAt || previous.date) : new Date(0);
  if (previous) nextDate.setDate(nextDate.getDate() + 90);
  const locked = Boolean(changesGrade && nextDate.getTime() > Date.now());
  const topics = specialization === 'Frontend'
    ? grade === 'Junior' ? ['HTML', 'CSS', 'JavaScript'] : ['React', 'Асинхронность', 'Качество']
    : grade === 'Junior' ? ['HTTP', 'SQL', 'Безопасность'] : ['Архитектура', 'Транзакции', 'Надёжность'];

  function start() {
    if (locked) return;
    setExam(createExam(specialization, grade)); setAnswers({}); setIndex(0); setResult(null);
  }
  function finish() {
    if (exam.some(item => answers[item.id] === undefined)) return;
    const score = Math.round(exam.filter(item => answers[item.id] === item.correct).length / exam.length * 100);
    const passed = score >= 70;
    const attempt: TestResult = { id: crypto.randomUUID(), date: new Date().toISOString(), specialization, grade, score, passed };
    update(previousState => {
      const confirmed = previousState.profile.confirmed;
      const changed = !confirmed || confirmed.grade !== grade || confirmed.specialization !== specialization;
      return {
        ...previousState, history: [attempt, ...previousState.history],
        profile: passed ? {
          ...previousState.profile,
          confirmed: { specialization, grade, score, date: attempt.date },
          gradeChangedAt: changed ? attempt.date : previousState.profile.gradeChangedAt || confirmed?.date,
        } : previousState.profile,
      };
    });
    setResult(attempt); setExam([]);
    notify('Результат сохранён');
  }
  return <>
    <div className="page-heading"><h1>Тестирование</h1></div>
    {result ? <section className="panel assessment-result">
      <div className={'result-icon ' + (result.passed ? 'result-passed' : '')}>{result.passed ? <BadgeCheck size={34} /> : <RotateCcw size={30} />}</div>
      <span className="result-score">{result.score}<small>/100</small></span>
      <h2>{result.passed ? 'Грейд подтверждён' : 'Грейд не подтверждён'}</h2>
      <p className="muted">{result.specialization} · {result.grade}</p>
      {!result.passed && state.profile.confirmed && <p className="result-note">Ваша категория {state.profile.confirmed.specialization} · {state.profile.confirmed.grade} сохранена.</p>}
      <div className="button-group">{result.passed ? <button className="button primary" onClick={onProfile}>К профилю</button> : <><button className="button secondary" onClick={() => { setResult(null); setGrade('Junior'); }}>Выбрать уровень</button><button className="button primary" onClick={() => setResult(null)}>Попробовать снова</button></>}</div>
    </section> : exam.length ? <section className="panel exam-panel">
      <div className="exam-header"><span>{specialization} · {grade}</span><span className="muted">Вопрос {index + 1} из {exam.length}</span></div>
      <div className="exam-progress" role="progressbar" aria-label="Прогресс теста" aria-valuemin={0} aria-valuemax={exam.length} aria-valuenow={index + 1}><span style={{ width: ((index + 1) / exam.length * 100) + '%' }} /></div>
      <span className="question-topic">{current.topic}</span><h2 className="question-text">{current.text}</h2>
      <fieldset className="answer-options"><legend className="sr-only">Варианты ответа</legend>{current.options.map((answer, option) => <label key={current.id + ':' + option} className={'answer-option' + (answers[current.id] === option ? ' selected' : '')}><input type="radio" name={current.id} checked={answers[current.id] === option} onChange={() => setAnswers(previousAnswers => ({ ...previousAnswers, [current.id]: option }))} /><span>{answer}</span>{answers[current.id] === option && <Check size={17} />}</label>)}</fieldset>
      <div className="exam-actions"><button className="button secondary" disabled={index === 0} onClick={() => setIndex(index - 1)}>Назад</button><button className="button primary" disabled={answers[current.id] === undefined} onClick={() => index === exam.length - 1 ? finish() : setIndex(index + 1)}>{index === exam.length - 1 ? 'Завершить тест' : 'Далее'}</button></div>
    </section> : <div className="assessment-layout">
      <section className="panel assessment-setup"><FormHeading /><div className="form-grid">
        <label className="field"><span>Специализация</span><select value={specialization} onChange={event => setSpecialization(event.target.value as Specialization)}><option>Frontend</option><option>Backend</option></select></label>
        <label className="field"><span>Предполагаемый грейд</span><select value={grade} onChange={event => setGrade(event.target.value as Grade)}><option>Junior</option><option>Middle</option></select></label>
      </div><div className="assessment-info"><div><ClipboardCheck size={18} /><span>6 вопросов</span></div><div><Clock3 size={18} /><span>Без ограничения времени</span></div></div>
        <h3 className="section-heading">Что проверяем</h3><div className="competency-list">{topics.map(topic => <div key={topic}><Check size={15} />{topic}<span>2 вопроса</span></div>)}</div>
        <p className="field-help">Для подтверждения — не менее 70 из 100 баллов.</p>
        {locked && <div className="inline-notice"><Clock3 size={17} />Смена категории доступна с {dateLabel(nextDate.toISOString())}</div>}
        <div className="form-actions"><button className="button primary" disabled={locked} onClick={start}>Начать тест</button></div>
      </section>
      <aside className="panel assessment-aside"><BadgeCheck size={26} /><h2>Подтвердите свой уровень</h2><p>Результат теста определяет категорию, которую видит работодатель.</p><div className="section-divider" /><p>Неудачная попытка сохраняет прежний грейд.</p><p>Смена подтверждённой категории — раз в 90 дней.</p></aside>
    </div>}
  </>;
}

function FormHeading() {
  return <div className="form-header"><div className="form-icon"><ClipboardCheck size={22} /></div><h2>Проверка квалификации</h2></div>;
}
