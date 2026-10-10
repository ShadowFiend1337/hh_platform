import { Component, type ReactNode } from 'react';

/** A rendering failure in one section shows a recoverable message instead of a blank page. */
export class PageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed
      ? <div className="panel empty-state" role="alert"><h2>Не удалось показать раздел</h2>
        <p>Данные сохранены на сервере. Обновите страницу; если ошибка повторится, откройте другой раздел.</p>
        <button className="button secondary" onClick={() => window.location.reload()}>Обновить страницу</button></div>
      : this.props.children;
  }
}
