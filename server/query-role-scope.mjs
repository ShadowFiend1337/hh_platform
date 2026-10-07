import { readFileSync } from 'node:fs';

// Offline, factual title snapshot: no employer query is sent to hh.ru.
// Ambiguous titles such as analyst, engineer, architect and designer are not
// excluded: they can belong to this platform's IT specializations.
export const professionalRoleScope = JSON.parse(readFileSync(new URL('./data-definitions/professional-role-scope.json', import.meta.url), 'utf8'));
const bounded = expression => new RegExp(`(?<![\\p{L}\\p{N}_])(?:${expression})(?![\\p{L}\\p{N}_])`, 'giu');
const outsidePatterns = professionalRoleScope.roles.map(role => ({ ...role, pattern: bounded(role.expression) }));
const heads = bounded('нуж(?:ен|на|ны)|ищем|ищу|требу(?:ется|ются)|приглашаем|нанимаем|хотим\\s+нанять|нужно\\s+нанять');
const genericSoftware = bounded('разработчик[а-яё]*|программист[а-яё]*|software\\s+(?:developer|engineer)');
const modifiers = /^(?:нам|мне|наш[а-яё]*|опытн[а-яё]*|практикующ[а-яё]*|квалифицированн[а-яё]*|профессиональн[а-яё]*|хорош[а-яё]*|сильн[а-яё]*|главн[а-яё]*|ведущ[а-яё]*|старш[а-яё]*|младш[а-яё]*|начинающ[а-яё]*|школьн[а-яё]*|налогов[а-яё]*|детск[а-яё]*|семейн[а-яё]*|участков[а-яё]*|дипломированн[а-яё]*|сертифицированн[а-яё]*|senior|junior|middle|lead|qualified|experienced|не|без|и|или|либо|а|or)$/iu;
const alternatives = /(?<![\p{L}\p{N}_])(?:и|или|либо|а|or)(?![\p{L}\p{N}_])/iu;
const negatedHead = prefix => /(?<![\p{L}\p{N}_])(?:не|not)\s*$/iu.test(prefix);
const topicAdjective = /(?:ск(?:ий|ого|ому|им|ом|ая|ой|ую|ое|ие|их|ими)|ебн(?:ый|ого|ому|ым|ом|ая|ой|ую|ое|ые|ых|ыми)|(?:овать|ствовать|чить))$/iu;

/**
 * Restricts only an explicit hiring object, never a product/domain mention.
 * A positive supported alternative keeps IT search available. Unknown titles
 * and ambiguous requests remain neural queries instead of being guessed.
 */
export function unsupportedRequestedRoles(query, { supportedMentions = [], classify = () => 'positive' } = {}) {
  const outside = outsidePatterns.flatMap(role => [...query.matchAll(role.pattern)]
    .filter(match => !topicAdjective.test(match[0]))
    .map(match => ({ name: role.name, start: match.index, end: match.index + match[0].length })));
  const generic = [...query.matchAll(genericSoftware)].map(match => ({ start: match.index, end: match.index + match[0].length }));
  const recognized = [...outside, ...supportedMentions, ...generic].sort((a, b) => a.start - b.start || b.end - a.end);
  const requestedOutside = new Set();
  let supported = false;
  for (const head of query.matchAll(heads)) {
    if (negatedHead(query.slice(Math.max(0, head.index - 15), head.index))) continue;
    const start = head.index + head[0].length;
    // A finite object span is deliberately conservative. Task instructions,
    // destination/purpose phrases and later sentences cannot name the hire.
    const stop = query.slice(start, start + 180).search(/[,;:.!?\n]/u);
    const end = stop < 0 ? Math.min(query.length, start + 180) : start + stop;
    const objects = [];
    for (const match of recognized) {
      if (match.start < start || match.end > end) continue;
      if (objects.some(object => match.start < object.end)) continue;
      const previous = objects.at(-1);
      const prefix = query.slice(previous?.end ?? start, match.start).replace(/(?<![\p{L}\p{N}_])в\s+команду(?![\p{L}\p{N}_])/giu, '').trim();
      // Adjacent nouns often describe the topic: "учитель Frontend" must
      // not make the requested teacher an IT developer.
      if (previous && !alternatives.test(prefix)) continue;
      const words = prefix.split(/\s+/u).filter(Boolean);
      if (words.length > 4 || words.some(word => !modifiers.test(word))) continue;
      objects.push(match);
      if (classify(match) !== 'positive') continue;
      if (match.name) requestedOutside.add(match.name);
      else supported = true;
    }
  }
  return supported ? [] : [...requestedOutside];
}
