import { ProviderError, remoteJson } from './provider-http.mjs';
import { SourceQueue, integer, positive, sourceText, evidence } from './source-utils.mjs';

const tokenPattern = /^[A-Za-z0-9._~-]{20,4096}$/u;
function competitionSlug(value) {
  if (typeof value !== 'string') throw new ProviderError('invalid_source_response');
  // ApiCompetition.ref is a full URL in the current official SDK response.
  const slug = value.replace(/^https:\/\/www\.kaggle\.com\/competitions\//u, '');
  if (!/^[a-z0-9][a-z0-9-]{0,199}$/u.test(slug)) throw new ProviderError('invalid_source_response');
  return slug;
}
export class KaggleProvider {
  id = 'kaggle'; name = 'Kaggle'; mode = 'live'; auth = 'api_token';
  contractVersion = 'kaggle-sdk-v1'; mappingVersion = 'kaggle-competitions-v1';
  constructor(env = process.env, {fetcher = fetch, now = Date.now, spacingMs = 1100} = {}) {
    this.enabled = env.KAGGLE_ENABLED !== '0'; this.fetcher = fetcher; this.now = now; this.queue = new SourceQueue(spacingMs);
  }
  validateToken(token) {
    if (typeof token !== 'string' || !tokenPattern.test(token)) throw new ProviderError('invalid_token');
    return token;
  }
  async call(service, method, body, token) {
    return this.queue.run(async () => {
      const result = await remoteJson(`https://api.kaggle.com/v1/${service}/${method}`, {
        method:'POST', headers:{'Content-Type':'application/json', 'User-Agent':'Predel-integrations/1.0', ...(token ? {Authorization:'Bearer ' + token} : {})}, body:JSON.stringify(body),
      }, this.fetcher);
      // Some RPC errors arrive in a JSON envelope rather than HTTP status.
      const code = result?.error?.code ?? result?.code;
      if (integer(code) && code >= 400) throw new ProviderError([400,401,403,404].includes(code) ? 'reauthorization_required' : code === 429 ? 'rate_limited' : 'source_unavailable', code === 429 || code >= 500);
      if (!result || typeof result !== 'object' || Array.isArray(result)) throw new ProviderError('invalid_source_response');
      return result;
    });
  }
  async introspect(token) {
    const result = await this.call('security.OAuthService','IntrospectToken',{token},token);
    if (result.active !== true) throw new ProviderError('reauthorization_required');
    if (!positive(result.userId) || typeof result.username !== 'string' || !/^[A-Za-z0-9_-]{1,50}$/u.test(result.username)
      || result.exp !== undefined && (!positive(result.exp) || result.exp * 1000 <= this.now())) throw new ProviderError('invalid_identity');
    return {subject:'kaggle:' + result.userId, externalId:result.username, identityVerified:true, credentials:{apiToken:token}};
  }
  async connectToken(token) { return this.introspect(this.validateToken(token)); }
  async load(connection) {
    const token = this.validateToken(connection.credentials.apiToken), identity = await this.introspect(token);
    if (identity.subject !== connection.subject || identity.externalId !== connection.externalId) throw new ProviderError('identity_mismatch');
    const achievements = [], seen = new Set(), cursors = new Set(); let cursor;
    // Snapshot of up to 50 entered competitions, ordered by latest deadline.
    for (let page = 0; page < 2; page++) {
      const result = await this.call('competitions.CompetitionApiService','ListCompetitions', {
        group:1, sortBy:4, pageSize:25, ...(cursor ? {pageToken:cursor} : {}),
      },token);
      const rows = result.competitions ?? [];
      if (!Array.isArray(rows) || rows.length > 25) throw new ProviderError('invalid_source_response');
      for (const row of rows) {
        if (!row || !positive(row.id) || seen.has(row.id) || row.userHasEntered !== true
          || row.userRank != null && (!integer(row.userRank) || row.userRank > 1000000)) throw new ProviderError('invalid_source_response');
        seen.add(row.id);
        // Entering alone is not an achievement. Rank 0/null is unavailable.
        if (!row.userRank) continue;
        const slug = competitionSlug(row.ref);
        let publicRow;
        try {
          // No credential: avoid publishing private competition details obtained
          // through the candidate's token. Anonymous visibility is required.
          publicRow = await this.call('competitions.CompetitionApiService','GetCompetition',{competitionName:slug});
        } catch (error) {
          if (['identity_not_found','reauthorization_required'].includes(error.code)) continue;
          throw error;
        }
        if (publicRow.id !== row.id || competitionSlug(publicRow.ref) !== slug) throw new ProviderError('invalid_source_response');
        achievements.push(evidence('competition:' + row.id, sourceText(publicRow.title), new Date(this.now()).toISOString(),
          `Позиция команды в публичной таблице на момент проверки: ${row.userRank}. Это не подтверждение итогового места в private leaderboard или личного вклада. Импорт ограничен 50 последними по сроку завершения соревнованиями с участием аккаунта.`,
          'https://www.kaggle.com/competitions/' + slug, 'data_analysis', 'team'));
      }
      const next = result.nextPageToken ?? '';
      if (next === '') break;
      if (typeof next !== 'string' || next.length > 2000 || cursors.has(next)) throw new ProviderError('invalid_source_response');
      cursors.add(next); cursor = next;
    }
    return {subject:connection.subject, externalId:connection.externalId, achievements};
  }
}
