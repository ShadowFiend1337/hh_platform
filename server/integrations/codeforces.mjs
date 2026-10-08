import { setTimeout as delay } from 'node:timers/promises';
import { ProviderError, remoteJson } from './provider-http.mjs';

const handlePattern = /^[A-Za-z0-9_.-]{3,24}$/u;
export function codeforcesHandle(value) {
  if (typeof value !== 'string' || !handlePattern.test(value)) throw new ProviderError('invalid_handle');
  return value;
}
const integer = value => Number.isSafeInteger(value) && value >= 0;
const at = seconds => {
  if (!integer(seconds) || seconds < 1 || seconds > 8640000000000) throw new ProviderError('invalid_source_response');
  return new Date(seconds * 1000).toISOString();
};

// The official API permits one request per two seconds. All users of this
// provider share a queue; URLs and methods are fixed by this adapter.
export class CodeforcesProvider {
  id = 'codeforces'; name = 'Codeforces'; mode = 'live'; auth = 'profile_challenge';
  contractVersion = 'codeforces-v1'; mappingVersion = 'codeforces-algorithms-v1';
  challengeField = 'organization'; challengeLabel = 'Organization'; keepProof = false;
  validateHandle = codeforcesHandle;
  profileUrl(handle) { return 'https://codeforces.com/profile/' + encodeURIComponent(handle); }
  proofValue(user) { return user.organization; }
  constructor(env = process.env, { fetcher = fetch, now = Date.now, spacingMs = 2100 } = {}) {
    this.fetcher = fetcher; this.now = now; this.spacingMs = spacingMs;
    this.enabled = env.CODEFORCES_ENABLED !== '0'; this.queue = Promise.resolve(); this.nextRequestAt = 0; this.pendingRequests = 0;
  }
  async call(method, fields) {
    if (this.pendingRequests >= 20) throw new ProviderError('rate_limited', true, 3);
    this.pendingRequests++;
    const work = this.queue.then(async () => {
      const wait = this.nextRequestAt - Date.now(); if (wait > 0) await delay(wait);
      this.nextRequestAt = Date.now() + this.spacingMs;
      const url = new URL('https://codeforces.com/api/' + method); url.search = new URLSearchParams(fields).toString();
      const result = await remoteJson(url.href, {}, async (...args) => {
        const response = await this.fetcher(...args);
        // Codeforces reports semantic errors as HTTP 400 JSON. Retain the
        // common body-size/timeout checks before reading that error envelope.
        return response.status === 400 ? new Response(response.body, { status: 200, headers: response.headers }) : response;
      });
      if (result.status !== 'OK' || !Array.isArray(result.result)) {
        if (/not found/iu.test(String(result.comment))) throw new ProviderError('identity_not_found');
        if (/limit exceeded/iu.test(String(result.comment))) throw new ProviderError('rate_limited', true, 3);
        throw new ProviderError('invalid_source_response');
      }
      return result.result;
    });
    this.queue = work.catch(() => {}); return work.finally(() => { this.pendingRequests--; });
  }
  async user(handle) {
    codeforcesHandle(handle);
    const users = await this.call('user.info', { handles: handle, checkHistoricHandles: 'false' });
    const user = users[0];
    if (users.length !== 1 || !user || typeof user !== 'object' || typeof user.handle !== 'string'
      || codeforcesHandle(user.handle).toLowerCase() !== handle.toLowerCase() || !integer(user.registrationTimeSeconds)
      || user.registrationTimeSeconds < 1 || user.registrationTimeSeconds > this.now() / 1000
      || user.organization !== undefined && (typeof user.organization !== 'string' || user.organization.length > 1000)) throw new ProviderError('invalid_source_response');
    return user;
  }
  identity(user) {
    return { subject: `codeforces:${user.handle.toLowerCase()}:${user.registrationTimeSeconds}`, externalId: user.handle,
      identityVerified: true, credentials: { registrationTimeSeconds: user.registrationTimeSeconds } };
  }
  async load(connection) {
    const user = await this.user(connection.externalId);
    if (this.identity(user).subject !== connection.subject || user.handle !== connection.externalId) throw new ProviderError('identity_mismatch');
    const history = await this.call('user.rating', { handle: user.handle });
    if (history.length > 10000) throw new ProviderError('invalid_source_response');
    for (const row of history) {
      if (!row || !integer(row.contestId) || row.contestId < 1 || typeof row.contestName !== 'string' || !row.contestName.trim() || row.contestName.length > 250
        || typeof row.handle !== 'string' || row.handle.toLowerCase() !== user.handle.toLowerCase() || !integer(row.rank) || row.rank < 1
        || row.rank > 1000000 || !integer(row.oldRating) || !integer(row.newRating)) throw new ProviderError('invalid_source_response');
      at(row.ratingUpdateTimeSeconds);
      if (row.ratingUpdateTimeSeconds > this.now() / 1000) throw new ProviderError('invalid_source_response');
    }
    const recent = [...history].sort((a,b) => b.ratingUpdateTimeSeconds - a.ratingUpdateTimeSeconds).slice(0,1000);
    const record = (id, title, occurredAt, result, sourceUrl) => ({ id, title, occurredAt, result, sourceUrl,
      discipline: 'algorithms', place: null, participation: 'individual', teamRole: null, status: 'active' });
    const profileUrl = 'https://codeforces.com/profile/' + encodeURIComponent(user.handle);
    const achievements = recent.map(row => record('contest:' + row.contestId, row.contestName, at(row.ratingUpdateTimeSeconds),
      `Место при пересчёте рейтинга: ${row.rank}; рейтинг ${row.oldRating} → ${row.newRating}. Это исторический результат, он может отличаться от итоговой таблицы.`,
      'https://codeforces.com/contest/' + row.contestId));
    if (user.rating !== undefined) {
      if (!integer(user.rating) || !integer(user.maxRating) || user.maxRating < user.rating) throw new ProviderError('invalid_source_response');
      achievements.unshift(record('rating', 'Рейтинг Codeforces', new Date(this.now()).toISOString(),
        `Текущий рейтинг: ${user.rating}; максимальный: ${user.maxRating}. Рейтинговых выступлений: ${history.length}${history.length > 1000 ? '; показаны последние 1000' : ''}.`, profileUrl));
    }
    const solved = new Set(), seen = new Set(); let inspected = 0, complete = false;
    // Bounded sample, not an assertion about a user's lifetime total.
    for (let page = 0; page < 8; page++) {
      const rows = await this.call('user.status', { handle: user.handle, from: String(page * 250 + 1), count: '250' });
      if (rows.length > 250) throw new ProviderError('invalid_source_response');
      for (const row of rows) {
        if (!row || !integer(row.id) || row.id < 1 || seen.has(row.id) || !integer(row.creationTimeSeconds)
          || row.creationTimeSeconds < 1 || row.creationTimeSeconds > this.now() / 1000 || !Array.isArray(row.author?.members)
          || row.author.members.length > 20 || !row.author.members.some(member => typeof member?.handle === 'string' && member.handle.toLowerCase() === user.handle.toLowerCase())) throw new ProviderError('invalid_source_response');
        seen.add(row.id); inspected++;
        // Team and unofficial/practice solutions are not contest placements.
        if (row.verdict !== 'OK' || row.author.members.length !== 1) continue;
        const problem = row.problem;
        if (!problem || typeof problem.index !== 'string' || !/^[A-Za-z0-9_-]{1,20}$/u.test(problem.index)) throw new ProviderError('invalid_source_response');
        if (integer(problem.contestId) && problem.contestId > 0) solved.add('contest:' + problem.contestId + ':' + problem.index);
        else if (typeof problem.problemsetName === 'string' && problem.problemsetName.length <= 100) solved.add('problemset:' + problem.problemsetName + ':' + problem.index);
        else throw new ProviderError('invalid_source_response');
      }
      if (rows.length < 250) { complete = true; break; }
    }
    if (inspected) achievements.push(record('solved-sample', 'Принятые индивидуальные решения Codeforces', new Date(this.now()).toISOString(),
      `Уникальных задач с вердиктом OK: ${solved.size} среди ${inspected} последних отправок. ${complete ? 'Достигнут конец истории на момент проверки.' : 'История ограничена 2000 отправками; это не общее число решённых задач.'} Вердикт платформы не доказывает отсутствие списывания.`, profileUrl));
    return { subject: connection.subject, externalId: connection.externalId, achievements };
  }
}
