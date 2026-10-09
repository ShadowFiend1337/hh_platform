import type { DirectoryMatch } from '../directory-api';

const tone = (percent: number) => percent >= 80 ? 'high' : percent >= 60 ? 'medium' : 'low';

/** Employer-facing match percentage; the breakdown lists the signals behind it. */
export function MatchBadge({ match }: { match?: DirectoryMatch }) {
  if (!match) return null;
  return <span className={'match-pill match-' + tone(match.percent)} title={'Совпадение с запросом: ' + match.parts.map(part => `${part.label} ${part.value}%`).join(', ')}>
    Совпадение {match.percent}%
  </span>;
}

export function MatchBreakdown({ match }: { match?: DirectoryMatch }) {
  if (!match) return null;
  return <div className="match-breakdown">
    <strong>Совпадение {match.percent}%</strong>
    <ul>{match.parts.map(part => <li key={part.key}>
      <span>{part.label}</span>
      <span className="match-bar" aria-hidden="true"><i style={{ width: part.value + '%' }} /></span>
      <span className="match-value">{part.value}%</span>
    </li>)}</ul>
    <span className="match-note">Вес: {match.parts.map(part => `${part.label.charAt(0).toLocaleLowerCase('ru') + part.label.slice(1)} ${part.weight}%`).join(', ')}.</span>
  </div>;
}
