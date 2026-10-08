import { Component, type ReactNode } from 'react';

/** An optional editor failure must leave the active exam and its answers usable. */
export class CodeDraftBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed
      ? <p className="field-help" role="status">Редактор недоступен. Можно продолжить тест с вариантами ответа.</p>
      : this.props.children;
  }
}
