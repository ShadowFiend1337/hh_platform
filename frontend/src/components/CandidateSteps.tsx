export function CandidateSteps({ step }: { step: number }) {
  return <ol className="candidate-steps" aria-label="Путь кандидата">
    {['Анкета', 'Тест', 'Категория'].map((label, index) => <li key={label} className={index <= step ? 'reached' : ''} aria-current={index === step ? 'step' : undefined}><span aria-hidden="true">{index + 1}</span>{label}</li>)}
  </ol>;
}
