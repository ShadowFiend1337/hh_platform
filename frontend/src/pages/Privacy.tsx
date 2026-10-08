import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Brand } from '../components/Brand';

export function Privacy({ onHome, onClearLocal }: { onHome: () => void; onClearLocal?: () => Promise<void> }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  async function clearLocal() {
    setDeleting(true);
    try {
      await onClearLocal?.();
      setConfirmDelete(false); setDeleted(true); setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось удалить данные. Повторите попытку.'); }
    finally { setDeleting(false); }
  }
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
          <p className="privacy-intro">Как predel обрабатывает данные в текущей локальной версии. Обновлено 8 октября 2026 года.</p>
          <section className="privacy-section" aria-labelledby="privacy-purpose">
            <h2 id="privacy-purpose">Для чего нужны данные</h2>
            <p>Чтобы создать профиль кандидата, подобрать тест на выбранный уровень, определить категорию и показать предложения работодателей.</p>
          </section>
          <section className="privacy-section" aria-labelledby="privacy-resume">
            <h2 id="privacy-resume">Резюме</h2>
            <p>Файл распознаётся в вашем браузере. Сам файл и полный распознанный текст не отправляются на сервер и не сохраняются. Извлечённые поля можно проверить и исправить до сохранения анкеты.</p>
          </section>
          <section className="privacy-section" aria-labelledby="privacy-storage">
            <h2 id="privacy-storage">Что хранится</h2>
            <p>После сохранения анкеты с согласием сервер хранит в SQLite имя, контакты, город, профессиональные сведения, образование, достижения, портфолио и предпочтения по работе. Там же хранятся компания, приглашения, сохранённые поиски и история анкет и тестов. Браузер хранит копию данных и несохранённые изменения.</p>
            <p>Запрос тестирования содержит отрасль, роль, специализацию, предполагаемый грейд, стаж и стек. Имя, email, телефон и дополнительные разделы резюме в этот запрос не входят. Сервер сохраняет время попытки, контрольную сумму ответов и результат. Во время активного теста также сохраняются тип и время получения событий потери фокуса и блокировки копирования. Содержимое буфера обмена, адреса других вкладок и снимки экрана не собираются. Эти события не меняют балл и удаляются вместе с попытками тестирования.</p>
            <p>Для регистрации сервер хранит имя или название компании, логин, email, хеш пароля и сведения о подтверждении почты. Одноразовый код отправляется по email; без настроенной почты в локальном режиме он сохраняется в отдельном служебном файле. Кабинет и каталог доступны после подтверждения почты и входа. HttpOnly-cookie открывает кабинет аккаунта, доступный и с другого устройства. Гостевые данные не переносятся в новый аккаунт. Восстановление пароля и автоматическое удаление серверных записей пока не реализованы.</p>
          </section>
          <section className="privacy-section" aria-labelledby="privacy-visibility">
            <h2 id="privacy-visibility">Видимость профиля</h2>
            <p>Показ профиля работодателям включается отдельно от согласия на обработку. Для публикации профиля в подборе нужен пройденный тест, проверенный сервером. Поиск не возвращает email и телефон. При действующем согласии контакты доступны владельцу профиля, отправителю принятого приглашения или компании, на вакансию которой кандидат сам откликнулся с согласием на передачу контактов.</p>
            <p>Векторный индекс публичного опыта рассчитывается локально на сервере; персональные контакты в него не входят. Поисковый текст не сохраняется в журнале запросов; сохранённый поиск записывается по вашей команде.</p>
          </section>
          <section className="privacy-section" aria-labelledby="privacy-control">
            <h2 id="privacy-control">Управление данными</h2>
            <p>Снимите согласие или видимость и сохраните изменения — профиль будет скрыт из подбора. Кнопка ниже удаляет данные кабинета из браузера и с сервера: профиль, индекс, компанию, приглашения, сохранённые поиски, анкеты и попытки тестирования. Регистрационный аккаунт и возможность входа сохраняются. Очистка только браузера в его настройках не удаляет серверные записи.</p>
            {onClearLocal && <div className="privacy-reset">
              {confirmDelete ? <>
                <p role="status">Удалить данные кабинета из браузера и с сервера, включая тесты и приглашения?</p>
                <div className="privacy-reset-actions">
                  <button className="button secondary compact" disabled={deleting} onClick={() => { void clearLocal(); }}>{deleting ? 'Удаляем…' : 'Удалить'}</button>
                  <button className="button secondary compact" disabled={deleting} onClick={() => setConfirmDelete(false)}>Отмена</button>
                </div>
              </> : <button className="button secondary compact" onClick={() => setConfirmDelete(true)}>Удалить данные профиля</button>}
              {deleted && <p role="status">Данные кабинета удалены из браузера и с сервера.</p>}
              {error && <p className="form-error" role="alert">{error}</p>}
            </div>}
          </section>
        </article>
      </div>
    </main>
  </div>;
}
