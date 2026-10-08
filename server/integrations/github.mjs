import { ProviderError, remoteJson, trustedUrl } from './provider-http.mjs';
import { SourceQueue, integer, positive, sourceDate, sourceText, evidence } from './source-utils.mjs';

const loginPattern = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/u;
const repoPattern = /^[A-Za-z0-9_.-]{1,100}$/u;
const bearer = value => typeof value === 'string' && /^[A-Za-z0-9._~-]{1,4096}$/u.test(value);
export class GitHubProvider {
  id = 'github'; name = 'GitHub'; mode = 'live'; auth = 'oauth2';
  contractVersion = 'github-rest-v1'; mappingVersion = 'github-portfolio-v1';
  constructor(env = process.env, {fetcher = fetch, now = Date.now, spacingMs = 1100} = {}) {
    this.fetcher = fetcher; this.now = now; this.queue = new SourceQueue(spacingMs);
    this.clientId = env.GITHUB_CLIENT_ID; this.clientSecret = env.GITHUB_CLIENT_SECRET; this.redirectUri = env.GITHUB_REDIRECT_URI;
    this.enabled = Boolean(this.clientId && this.clientSecret && this.redirectUri && env.INTEGRATION_ENCRYPTION_KEY && env.GITHUB_ENABLED !== '0');
    if (this.redirectUri) {
      const callback = trustedUrl(this.redirectUri, {development: ![env.APP_ENV,env.NODE_ENV].includes('production')});
      if (callback.pathname !== '/api/integrations/github/callback' || callback.search) throw new Error('GITHUB_REDIRECT_URI must point to /api/integrations/github/callback');
    }
  }
  authorize({state, challenge}) {
    const url = new URL('https://github.com/login/oauth/authorize');
    url.search = new URLSearchParams({client_id:this.clientId, redirect_uri:this.redirectUri, state, code_challenge:challenge,
      code_challenge_method:'S256', scope:'', prompt:'select_account'}).toString();
    return url.href;
  }
  async token(fields) {
    const response = await remoteJson('https://github.com/login/oauth/access_token', {
      method:'POST',headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({client_id:this.clientId,client_secret:this.clientSecret,...fields}).toString(),
    },this.fetcher);
    if (response.error || !bearer(response.access_token) || String(response.token_type).toLowerCase() !== 'bearer'
      || response.refresh_token !== undefined && !bearer(response.refresh_token)
      || response.expires_in !== undefined && (!positive(response.expires_in) || response.expires_in > 31536000)) throw new ProviderError('reauthorization_required');
    return {accessToken:response.access_token, ...(response.refresh_token ? {refreshToken:response.refresh_token} : {}),
      expiresAt:response.expires_in ? new Date(this.now()+response.expires_in*1000).toISOString() : null};
  }
  async api(path, token) {
    if (!bearer(token)) throw new ProviderError('reauthorization_required');
    return this.queue.run(() => remoteJson('https://api.github.com' + path, {headers:{
      Authorization:'Bearer ' + token, Accept:'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28', 'User-Agent':'Predel-integrations/1.0',
    }},async(...args) => {
      const response = await this.fetcher(...args);
      if (response.status === 403 && (response.headers.get('x-ratelimit-remaining') === '0' || response.headers.has('retry-after'))) {
        const seconds = Math.min(60,Math.max(1,(Number(response.headers.get('x-ratelimit-reset'))*1000 - this.now())/1000 || 60));
        return new Response(response.body,{status:429,headers:{'Retry-After':response.headers.get('retry-after') || String(Math.ceil(seconds))}});
      }
      return response;
    }));
  }
  async me(token) {
    const user = await this.api('/user',token);
    if (!positive(user.id) || typeof user.login !== 'string' || !loginPattern.test(user.login) || user.type !== 'User') throw new ProviderError('invalid_identity');
    return user;
  }
  async exchange(code, pending) {
    const credentials = await this.token({code,redirect_uri:this.redirectUri,code_verifier:pending.verifier});
    const user = await this.me(credentials.accessToken);
    return {subject:'github:' + user.id,externalId:user.login,identityVerified:true,credentials};
  }
  async load(connection,persistCredentials) {
    let credentials = connection.credentials;
    if (credentials.expiresAt !== null && (!Number.isFinite(Date.parse(credentials.expiresAt)) || Date.parse(credentials.expiresAt) <= this.now()+30000)) {
      if (!credentials.refreshToken) throw new ProviderError('reauthorization_required');
      credentials = await this.token({grant_type:'refresh_token',refresh_token:credentials.refreshToken});
      persistCredentials(credentials);
    }
    const user = await this.me(credentials.accessToken);
    if ('github:' + user.id !== connection.subject || user.login !== connection.externalId) throw new ProviderError('identity_mismatch');
    const achievements = [], seen = new Set();
    for (let page=1;page<=3;page++) {
      const repos = await this.api(`/users/${encodeURIComponent(user.login)}/repos?type=owner&sort=updated&per_page=100&page=${page}`,credentials.accessToken);
      if (!Array.isArray(repos) || repos.length > 100) throw new ProviderError('invalid_source_response');
      for (const repo of repos) {
        if (!repo || !positive(repo.id) || seen.has(repo.id) || repo.owner?.id !== user.id || typeof repo.private !== 'boolean' || typeof repo.fork !== 'boolean') throw new ProviderError('invalid_source_response');
        seen.add(repo.id); if (repo.private || repo.fork) continue;
        if (typeof repo.name !== 'string' || !repoPattern.test(repo.name) || ['.','..'].includes(repo.name) || !integer(repo.stargazers_count)
          || repo.language !== null && (typeof repo.language !== 'string' || repo.language.length > 100)) throw new ProviderError('invalid_source_response');
        achievements.push(evidence('repo:' + repo.id, 'Проект GitHub: ' + repo.name, sourceDate(repo.updated_at,this.now),
          `Публичный репозиторий принадлежит аккаунту; основной язык: ${repo.language || 'не указан'}, звёзд: ${repo.stargazers_count}. Владение не подтверждает авторство всего кода. Просмотрено до 300 последних обновлённых репозиториев, форки исключены.`,
          `https://github.com/${encodeURIComponent(user.login)}/${encodeURIComponent(repo.name)}`, 'software_development'));
      }
      if (repos.length < 100) break;
    }
    const params = new URLSearchParams({q:`author:${user.login} is:pr is:merged is:public`,sort:'updated',order:'desc',per_page:'20'});
    const search = await this.api('/search/issues?' + params.toString(),credentials.accessToken);
    if (!Array.isArray(search.items) || search.items.length > 20 || search.incomplete_results !== false || !integer(search.total_count)) throw new ProviderError('invalid_source_response');
    const seenPr = new Set();
    for (const item of search.items) {
      if (!positive(item.id) || seenPr.has(item.id) || item.user?.id !== user.id || !positive(item.number)) throw new ProviderError('invalid_source_response');
      seenPr.add(item.id);
      const repository = typeof item.repository_url === 'string' && item.repository_url.match(/^https:\/\/api\.github\.com\/repos\/([A-Za-z0-9-]+)\/([A-Za-z0-9_.-]+)$/u);
      if (!repository || !loginPattern.test(repository[1]) || !repoPattern.test(repository[2]) || ['.','..'].includes(repository[2])) throw new ProviderError('invalid_source_response');
      // Search is an index, not proof that a pull request was merged. Check the
      // actual PR and its public base repository before attributing it.
      const path = `/repos/${repository[1]}/${repository[2]}/pulls/${item.number}`;
      let pr;
      try { pr = await this.api(path,credentials.accessToken); }
      catch (error) { if (error.code === 'identity_not_found') continue; throw error; }
      if (pr.id !== item.id || pr.user?.id !== user.id || pr.number !== item.number || typeof pr.base?.repo?.private !== 'boolean'
        || pr.base.repo.full_name !== repository[1] + '/' + repository[2]) throw new ProviderError('invalid_source_response');
      if (pr.base.repo.private || pr.merged_at === null) continue;
      const title = sourceText(pr.title,250);
      achievements.push(evidence('pr:' + item.id, 'Принятый PR: ' + title, sourceDate(pr.merged_at,this.now),
        `Pull request #${item.number} аккаунта принят в ${repository[1]}/${repository[2]}. Проверены до 20 последних обновлённых публичных принятых PR; качество и размер вклада отдельно не оценивались.`,
        `https://github.com/${repository[1]}/${repository[2]}/pull/${item.number}`, 'software_development'));
    }
    return {subject:connection.subject, externalId:connection.externalId, achievements};
  }
}
