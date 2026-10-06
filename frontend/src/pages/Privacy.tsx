import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Brand } from '../components/Brand';

export function Privacy({ onHome, onClearLocal }: { onHome: () => void; onClearLocal?: () => void }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [error, setError] = useState('');
  function clearLocal() {
    try {
      onClearLocal?.();
      setConfirmDelete(false); setDeleted(true); setError('');
    } catch {
      setError('Хранилище недоступно. Очистите данные сайта в настройках браузера.');
    }
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
          <p className="privacy-intro">Как predel обрабатывает данные в текущей локальной версии. Обновлено 6 октября 2026 года.</p>
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
            <p>В этом браузере сохраняются имя, контакты, город, профессиональные сведения, образование, достижения, ссылки на портфолио, предпочтения по работе, согласия, история опросов и тестов.</p>
            <p>При запуске теста сервер получает отрасль, роль, специализацию, предполагаемый грейд, стаж, стек и софт-скиллы. Он сохраняет эти сведения, идентификаторы и время попытки, контрольную сумму ответов и результат. Имя, email, телефон и дополнительные разделы резюме в запрос тестирования не входят.</p>
            <p>Техническая cookie связывает попытки теста с браузером и действует 30 дней. Анкета хранится до очистки данных сайта. Тестовые записи хранятся отдельно на локальном сервере; автоматический срок их удаления пока не установлен.</p>
          </section>
          <section className="privacy-section" aria-labelledby="privacy-visibility">
            <h2 id="privacy-visibility">Видимость профиля</h2>
            <p>Показ профиля работодателям включается отдельно от согласия на обработку. В интерфейсе контакты открываются после принятия приглашения. Подбор и приглашения сейчас работают в демонстрации внутри одного браузера, а серверное разграничение доступа к профилям ещё не реализовано.</p>
          </section>
          <section className="privacy-section" aria-labelledby="privacy-control">
            <h2 id="privacy-control">Управление данными</h2>
            <p>Измените сведения в профиле или снимите согласие и сохраните изменения — профиль будет скрыт из подбора. Для удаления локальной анкеты очистите данные этого сайта в настройках браузера. Это не удаляет записи тестирования на сервере; удаление таких записей через интерфейс пока недоступно.</p>
            {onClearLocal && <div className="privacy-reset">
              {confirmDelete ? <>
                <p role="status">Удалить анкету и историю из этого браузера? Записи тестов на сервере сохранятся.</p>
                <div className="privacy-reset-actions">
                  <button className="button secondary compact" onClick={clearLocal}>Удалить</button>
                  <button className="button secondary compact" onClick={() => setConfirmDelete(false)}>Отмена</button>
                </div>
              </> : <button className="button secondary compact" onClick={() => setConfirmDelete(true)}>Удалить данные браузера</button>}
              {deleted && <p role="status">Данные этого браузера удалены.</p>}
              {error && <p className="form-error" role="alert">{error}</p>}
            </div>}
          </section>
        </article>
      </div>
    </main>
  </div>;
}
