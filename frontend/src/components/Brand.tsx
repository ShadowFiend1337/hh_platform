export function Brand({ onHome }: { onHome?: () => void }) {
  return <a href="/" className="brand" aria-label="predel — главная" onClick={event => {
    if (onHome) { event.preventDefault(); onHome(); }
  }}>
    <span className="brand-symbol" aria-hidden="true"><i /><i /><i /></span>
    <span>predel</span>
  </a>;
}
