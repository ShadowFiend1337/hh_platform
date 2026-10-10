import { useEffect, useState } from 'react';
import { Check, RefreshCw, Sparkles, X } from 'lucide-react';
import { claimRequest } from '../claims-api';
import { gradeLabels, gradeOptions, specializationNames, specializationOptions } from '../model';

type ItemStatus = 'pilot' | 'active' | 'retired' | 'rejected';
interface BankItem {
  id: string; familyId: string; specialization: string; grade: string; topic: string; difficulty: number; skills: string[];
  text: string; options: string[]; correct: number; explanation: string; status: ItemStatus;
  generator: string; verifier: string | null; createdAt: string;
  review: { verification?: { model?: string; confidence?: number | null; ambiguous?: boolean; duplicateOf?: string | null };
    calibration?: { p?: number | null; reference?: number; pointBiserial?: number | null }; reason?: string; history?: { status: string; at: string; by: string }[] };
  stats: { exposures: number; responses: number; correct: number };
}
interface BankPage {
  items: BankItem[];
  summary: { authored: number; generated: Record<ItemStatus, number> };
  generator: { configured: boolean; models: { chat?: string; verifier?: string }; queued: number; running: boolean };
}

const statusLabels: Record<ItemStatus, string> = { pilot: 'Пилот', active: 'В зачёте', retired: 'Выведено', rejected: 'Отклонено' };

/** Expert review of generated items: pilot items enter scoring only after approval or calibration. */
export function ItemBankModeration({ accountId }: { accountId: string }) {
  const [specialization, setSpecialization] = useState('');
  const [grade, setGrade] = useState('');
  const [status, setStatus] = useState<ItemStatus | ''>('pilot');
  const [page, setPage] = useState<BankPage | null>(null);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams();
    if (specialization) query.set('specialization', specialization);
    if (grade) query.set('grade', grade);
    if (status) query.set('status', status);
    setLoading(true); setError('');
    claimRequest<BankPage>('/api/item-bank/items?' + query, 'GET', undefined, accountId, controller.signal)
      .then(data => { if (!controller.signal.aborted) { setPage(data); setLoading(false); } })
      .catch(cause => { if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : 'Банк недоступен.'); setLoading(false); } });
    return () => controller.abort();
  }, [accountId, specialization, grade, status, reload]);

  async function decide(item: BankItem, decision: 'approve' | 'reject') {
    if (busy) return;
    setBusy(item.id); setError(''); setNotice('');
    try {
      await claimRequest('/api/item-bank/items/' + item.id + '/review', 'POST', { decision }, accountId);
      setNotice(decision === 'approve' ? 'Задание переведено в зачёт.' : 'Задание отклонено.');
      setReload(value => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Решение не сохранено.'); }
    finally { setBusy(null); }
  }
  async function generate() {
    if (busy || !specialization || !grade) return;
    setBusy('generate'); setError(''); setNotice('');
    try {
      const result = await claimRequest<{ queued: number; families: number }>('/api/item-bank/generate', 'POST', { specialization, grade }, accountId);
      setNotice(`В очередь генерации добавлено семейств: ${result.queued} из ${result.families}. Новые задания появятся как пилотные.`);
      setReload(value => value + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Генерация не запущена.'); }
    finally { setBusy(null); }
  }

  const counts = page?.summary.generated;
  return <section className="bank-moderation">
    <div className="bank-filters">
      <label className="field"><span>Специализация</span><select value={specialization} onChange={event => setSpecialization(event.target.value)}>
        <option value="">Все</option>{specializationOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select></label>
      <label className="field"><span>Грейд</span><select value={grade} onChange={event => setGrade(event.target.value)}>
        <option value="">Все</option>{gradeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select></label>
      <label className="field"><span>Статус</span><select value={status} onChange={event => setStatus(event.target.value as ItemStatus | '')}>
        <option value="">Все</option>{(Object.keys(statusLabels) as ItemStatus[]).map(value => <option key={value} value={value}>{statusLabels[value]}</option>)}
      </select></label>
      <button className="button secondary" disabled={busy === 'generate' || !specialization || !grade || !page?.generator.configured}
        title={!page?.generator.configured ? 'Нужен OPENROUTER_API_KEY на сервере' : !specialization || !grade ? 'Выберите специализацию и грейд' : undefined}
        onClick={() => void generate()}><Sparkles size={16} />Сгенерировать</button>
      <button className="icon-button" aria-label="Обновить" onClick={() => setReload(value => value + 1)}><RefreshCw size={17} /></button>
    </div>
    {page && <div className="bank-summary" role="status">
      <span><strong>{page.summary.authored}</strong> авторских</span>
      {(Object.keys(statusLabels) as ItemStatus[]).map(key => <span key={key}><strong>{counts?.[key] ?? 0}</strong> {statusLabels[key].toLowerCase()}</span>)}
      <span className="muted">{page.generator.configured ? `Генератор ${page.generator.models.chat}, решатель ${page.generator.models.verifier}` : 'Генератор выключен: нет ключа'}{page.generator.queued ? ` · в очереди ${page.generator.queued}` : ''}{page.generator.running ? ' · идёт генерация' : ''}</span>
    </div>}
    {notice && <p className="bank-notice">{notice}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {loading && <p className="muted">Загружаем задания…</p>}
    {!loading && page && !page.items.length && <p className="muted bank-empty">Сгенерированных заданий с такими условиями нет.{status === 'pilot' ? ' Пилотные появляются после генерации и проверки решателем.' : ''}</p>}
    <div className="bank-items">{page?.items.map(item => {
      const verification = item.review?.verification, calibration = item.review?.calibration;
      const rate = item.stats.responses ? Math.round(item.stats.correct / item.stats.responses * 100) : null;
      return <article className="bank-item" key={item.id}>
        <header><span className={'status bank-status-' + item.status}>{statusLabels[item.status]}</span>
          <span>{specializationNames[item.specialization as keyof typeof specializationNames] || item.specialization} · {gradeLabels[item.grade as keyof typeof gradeLabels] || item.grade} · {item.topic} · {item.difficulty === 2 ? 'повышенный' : 'базовый'}</span></header>
        <p className="bank-question">{item.text}</p>
        <ol className="bank-options">{item.options.map((option, index) => <li key={index} className={item.correct === index ? 'correct' : undefined}>
          {option}{item.correct === index && <Check size={14} aria-label="Ключ" />}</li>)}</ol>
        {item.explanation && <p className="field-help">{item.explanation}</p>}
        <p className="bank-facts">
          <span>Решатель: {verification?.model || item.verifier || '—'}{typeof verification?.confidence === 'number' ? `, уверенность ${verification.confidence.toFixed(2)}` : ''}</span>
          <span>Показов {item.stats.exposures} · ответов {item.stats.responses}{rate !== null ? ` · верно ${rate}%` : ''}</span>
          {calibration?.reference !== undefined && <span>Эталон {Math.round(calibration.reference * 100)}%{typeof calibration.pointBiserial === 'number' ? ` · дискриминация ${calibration.pointBiserial.toFixed(2)}` : ''}</span>}
        </p>
        {item.review?.reason && item.status !== 'pilot' && <p className="field-help">{item.review.reason}</p>}
        {item.status === 'pilot' && <div className="button-group bank-actions">
          <button className="button secondary compact" disabled={Boolean(busy)} onClick={() => void decide(item, 'reject')}><X size={15} />Отклонить</button>
          <button className="button primary compact" disabled={Boolean(busy)} onClick={() => void decide(item, 'approve')}><Check size={15} />В зачёт</button>
        </div>}
      </article>;
    })}</div>
  </section>;
}
