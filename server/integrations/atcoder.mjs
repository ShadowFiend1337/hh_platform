import { ProviderError, remoteJson, remoteText } from './provider-http.mjs';
import { SourceQueue, integer, positive, sourceDate, sourceText, evidence } from './source-utils.mjs';

export function atcoderHandle(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_]{3,16}$/u.test(value)) throw new ProviderError('invalid_handle');
  return value;
}
function plain(value) {
  // Strip markup before decoding: text that contains escaped tags stays text.
  return value.replace(/<[^>]*>/gu, '').replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/giu, (_, entity) => {
    if (entity[0] !== '#') return ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '})[entity.toLowerCase()];
    const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2),16) : Number(entity.slice(1));
    if (!Number.isSafeInteger(code) || code < 1 || code > 0x10ffff || code >= 0xd800 && code <= 0xdfff) throw new ProviderError('invalid_source_response');
    return String.fromCodePoint(code);
  }).trim();
}
export class AtCoderProvider {
  id = 'atcoder'; name = 'AtCoder'; mode = 'live'; auth = 'profile_challenge';
  contractVersion = 'atcoder-public-v1'; mappingVersion = 'atcoder-algorithms-v1';
  challengeField = 'affiliation'; challengeLabel = 'Affiliation'; keepProof = true;
  validateHandle = atcoderHandle;
  constructor(env = process.env, {fetcher = fetch, now = Date.now, spacingMs = 2100} = {}) {
    this.enabled = env.ATCODER_ENABLED !== '0'; this.fetcher = fetcher; this.now = now; this.queue = new SourceQueue(spacingMs);
  }
  profileUrl(handle) { return 'https://atcoder.jp/users/' + encodeURIComponent(handle); }
  proofValue(user) { return user.affiliation; }
  async user(handle) {
    atcoderHandle(handle);
    const html = await this.queue.run(() => remoteText(this.profileUrl(handle) + '?lang=en', {}, this.fetcher));
    const heading = html.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/iu)?.[1];
    const canonical = heading?.match(/<a\s+href="\/users\/([A-Za-z0-9_]+)"\s+class="username"/u)?.[1];
    if (!canonical || atcoderHandle(canonical).toLowerCase() !== handle.toLowerCase()) throw new ProviderError('invalid_source_response');
    const affiliations = [...html.matchAll(/<tr\b[^>]*>\s*<th\b[^>]*>\s*Affiliation\s*<\/th>\s*<td\b[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/giu)];
    if (affiliations.length > 1) throw new ProviderError('invalid_source_response');
    const affiliation = affiliations.length ? plain(affiliations[0][1]) : '';
    if (affiliation.length > 1000) throw new ProviderError('invalid_source_response');
    return {handle: canonical, affiliation};
  }
  identity(user) {
    return {subject:'atcoder:' + user.handle.toLowerCase(), externalId:user.handle, identityVerified:true, credentials:{proofToken:user.affiliation}};
  }
  async load(connection) {
    const user = await this.user(connection.externalId);
    // AtCoder's public profile has no immutable account ID. Keep the proof in
    // Affiliation and recheck on every sync, including after a handle change.
    if (this.identity(user).subject !== connection.subject || user.handle !== connection.externalId
      || !/^predel-[A-Za-z0-9_-]{43}$/u.test(connection.credentials?.proofToken || '') || user.affiliation !== connection.credentials.proofToken) throw new ProviderError('identity_mismatch');
    const history = await this.queue.run(() => remoteJson(this.profileUrl(user.handle) + '/history/json?contestType=algo', {}, this.fetcher));
    if (!Array.isArray(history) || history.length > 10000) throw new ProviderError('invalid_source_response');
    const seen = new Set();
    const rows = history.map(row => {
      if (!row || typeof row.IsRated !== 'boolean' || !positive(row.Place) || row.Place > 1000000 || !integer(row.NewRating) || !integer(row.OldRating)
        || typeof row.ContestScreenName !== 'string' || !/^[a-z0-9_-]+\.contest\.atcoder\.jp$/u.test(row.ContestScreenName)) throw new ProviderError('invalid_source_response');
      const id = row.ContestScreenName.replace('.contest.atcoder.jp','');
      if (seen.has(id)) throw new ProviderError('invalid_source_response'); seen.add(id);
      return {...row, id, title:sourceText(row.ContestNameEn || row.ContestName), date:sourceDate(row.EndTime, this.now)};
    }).sort((a,b) => Date.parse(b.date) - Date.parse(a.date));
    const achievements = rows.slice(0,1000).map(row => evidence('contest:' + row.id, row.title, row.date,
      `Место в истории AtCoder: ${row.Place}. ${row.IsRated ? `Рейтинг ${row.OldRating} → ${row.NewRating}.` : 'Участие вне рейтинга.'} Результат проверен по опубликованной истории Algorithm.`,
      'https://atcoder.jp/contests/' + row.id, 'algorithms', 'individual', row.Place));
    const rated = rows.filter(row => row.IsRated);
    if (rated.length) achievements.unshift(evidence('rating', 'Рейтинг AtCoder (Algorithm)', new Date(this.now()).toISOString(),
      `Последний рейтинг в истории: ${rated[0].NewRating}; максимальный по истории: ${Math.max(...rated.map(row => row.NewRating))}. Рейтинговых выступлений: ${rated.length}${rows.length > 1000 ? '; показаны последние 1000 соревнований' : ''}.`, this.profileUrl(user.handle), 'algorithms'));
    return {subject:connection.subject, externalId:connection.externalId, achievements};
  }
}
