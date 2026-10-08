import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { PRIVACY_POLICY_VERSION } from '../../../shared/privacy';
import { Brand } from '../components/Brand';

export function Privacy({ onHome, onClearLocal, isSignedIn = false }: {
  onHome: () => void;
  onClearLocal?: (deleteAccount?: boolean) => Promise<string | void>;
  isSignedIn?: boolean;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [deletionWasAccount, setDeletionWasAccount] = useState(false);
  const [deletedAt, setDeletedAt] = useState('');
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  async function clearLocal() {
    setDeleting(true);
    try {
      const deleted = await onClearLocal?.(isSignedIn);
      setConfirmDelete(false); setDeleted(true); setDeletionWasAccount(isSignedIn); setDeletedAt(typeof deleted === 'string' ? deleted : ''); setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось удалить данные. Повторите попытку.'); }
    finally { setDeleting(false); }
  }
  const deletedLabel = deletedAt
    ? new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Moscow' }).format(new Date(deletedAt))
    : '';
  return <div className="app-shell privacy-page">
    <a className="skip-link" href="#privacy">К содержимому</a>
    <header className="site-header"><div className="header-inner">
      <Brand onHome={onHome} />
      <button className="button secondary compact" onClick={onHome}><ArrowLeft size={16} />На главную</button>
    </div></header>
    <main id="privacy" className="main-content">
      <div className="onboarding-layout">
        <div className="page-heading"><h1>Политика конфиденциальности</h1></div>
        <article className="panel privacy-content">
          <p className="privacy-intro">Версия {PRIVACY_POLICY_VERSION}. Обновлено 8 октября 2026 года.</p>
          <section className="privacy-section" aria-labelledby="privacy-operator">
            <h2 id="privacy-operator">Оператор и обращения</h2>
            <p>Реквизиты оператора — наименование, ИНН, ОГРН, адрес и контакт для обращений — ещё не внесены. До их предоставления политика не готова к использованию в публичном сервисе с реальными персональными данными.</p>
          </section>
          <section className="privacy-section" aria-labelledby="privacy-purpose">
            <h2 id="privacy-purpose">Для чего нужны данные</h2>
            <p>Чтобы создать аккаунт и профиль кандидата, подобрать тест, сохранить его результат, показать профиль работодателям с отдельного согласия и обмениваться приглашениями.</p>
          </section>
          <section className="privacy-section" aria-labelledby="privacy-resume">
            <h2 id="privacy-resume">Резюме</h2>
            <p>Файл распознаётся в вашем браузере. Сам файл и полный распознанный текст не отправляются на сервер и не сохраняются. Извлечённые поля можно проверить и исправить до сохранения анкеты.</p>
          </section>
          <section className="privacy-section" aria-labelledby="privacy-storage">
            <h2 id="privacy-storage">Что и где хранится</h2>
            <p>Профили, анкеты, результаты тестов, компании, приглашения и сохранённые поиски хранятся в базе данных сервиса: по умолчанию в SQLite, либо в PostgreSQL, если оператор настроил соответствующее подключение. Данные аккаунта хранятся, пока аккаунт существует; пользователь может удалить аккаунт и связанные записи.</p>
            <p>В анкете хранятся имя, контакты, город, профессиональные сведения, образование, достижения, портфолио и предпочтения по работе. Запрос тестирования не содержит имя, email или телефон. Сервер сохраняет время попытки, контрольную сумму ответов и результат.</p>
            <p>Код подтверждения регистрации по умолчанию действует 10 минут; запись неподтверждённой регистрации удаляется при первом следующем обращении к API после истечения кода. Сессия аккаунта по умолчанию действует 30 дней; просроченные сессии удаляются при обращении к API. Фактические сроки резервных копий определяются настройками среды, в которой развёрнута база данных.</p>
            <p>Браузер хранит локальную копию и несохранённые изменения. Удаление аккаунта очищает браузер, с которого отправлен запрос; копии на других устройствах нужно удалить отдельно.</p>
          </section>
          <section className="privacy-section" aria-labelledby="privacy-consent">
            <h2 id="privacy-consent">Согласие</h2>
            <p>При регистрации сервер фиксирует версию политики и время согласия в UTC. Для кандидата отдельно сохраняются версия и время согласия или его отзыва на обработку профиля. Согласие на обработку данных и видимость профиля работодателям — отдельные настройки.</p>
          </section>
          <section className="privacy-section" aria-labelledby="privacy-visibility">
            <h2 id="privacy-visibility">Видимость профиля</h2>
            <p>Показ профиля работодателям включается отдельно от согласия на обработку. Для настоящего профиля в подборе также нужен пройденный тест, проверенный сервером. Поиск не возвращает email и телефон. Сервер выдаёт контакты владельцу профиля или отправителю принятого приглашения при действующем согласии кандидата.</p>
            <p>Демонстрационные кандидаты вымышлены, их оценки не являются результатами тестирования реальных людей. Модель поиска обучена только на синтетических профессиональных описаниях. Векторный индекс публичного опыта рассчитывается локально на сервере; персональные контакты в него не входят. Поисковый текст не сохраняется в журнале запросов; сохранённый поиск записывается по вашей команде.</p>
          </section>
          <section className="privacy-section" aria-labelledby="privacy-control">
            <h2 id="privacy-control">Удаление данных</h2>
            <p>Удаление аккаунта стирает его профиль, историю анкет и тестов, компанию, сессии, приглашения и сохранённые поиски из рабочей базы. Записывается только случайный номер операции и время удаления, без связи с аккаунтом. Записи аккаунта и истории согласия удаляются вместе с ним.</p>
            {onClearLocal && <div className="privacy-reset">
              {!deleted && (confirmDelete ? <>
                <p role="status">{isSignedIn ? 'Удалить аккаунт и все связанные с ним данные?' : 'Удалить данные текущей сессии из браузера и с сервера, включая тесты и приглашения?'}</p>
                <div className="privacy-reset-actions">
                  <button className="button secondary compact" disabled={deleting} onClick={() => { void clearLocal(); }}>{deleting ? 'Удаляем…' : 'Удалить'}</button>
                  <button className="button secondary compact" disabled={deleting} onClick={() => setConfirmDelete(false)}>Отмена</button>
                </div>
              </> : <button className="button secondary compact" onClick={() => setConfirmDelete(true)}>{isSignedIn ? 'Удалить аккаунт и данные' : 'Удалить данные браузера'}</button>)}
              {deleted && <p role="status">{deletionWasAccount
                ? `Аккаунт и связанные данные удалены${deletedLabel ? ` ${deletedLabel} (время Москвы)` : ''}.`
                : 'Данные текущей сессии удалены из браузера и с сервера.'}</p>}
              {error && <p className="form-error" role="alert">{error}</p>}
            </div>}
          </section>
        </article>
      </div>
    </main>
  </div>;
}
