import { randomBytes } from 'node:crypto';
import { RequestError } from '../assessment.mjs';

export function callbackPage(response) {
  const nonce = randomBytes(18).toString('base64');
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'` });
  // SameSite=Strict cookies are absent on the provider's initial navigation.
  // The same-origin POST from this page restores them without weakening cookies.
  response.end(`<!doctype html><html lang="ru"><meta charset="utf-8"><title>Подключение ФСП</title><p id="message" role="status">Завершаем подключение ФСП…</p><script nonce="${nonce}">
(async () => {
  const params = new URLSearchParams(location.search);
  const input = Object.fromEntries(['state','code','error'].filter(key => params.has(key)).map(key => [key, params.get(key)]));
  history.replaceState(null, '', location.pathname);
  try {
    const response = await fetch(location.pathname, {method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Подключение не завершено.');
    location.replace('/app?role=candidate&tab=profile');
  } catch (error) { document.getElementById('message').textContent = error.message + ' Вернитесь в профиль и повторите подключение.'; }
})();</script></html>`);
}

export async function readWebhook(request) {
  if (!String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) throw new RequestError(415, 'Ожидается JSON.');
  if (Number(request.headers['content-length']) > 20000) throw new RequestError(413, 'Запрос слишком большой.');
  const chunks = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > 20000) throw new RequestError(413, 'Запрос слишком большой.'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}

export async function integrationRoutes({ request, response, url, identity, integrations, body, send, limit }) {
  const path = url.pathname;
  if (!path.startsWith('/api/integrations') && !path.startsWith('/api/integration-jobs/') && path !== '/api/profile/evidence'
    && !/^\/api\/directory\/[^/]+\/evidence$/u.test(path)) return false;
  if (path === '/api/integrations/providers') {
    if (request.method !== 'GET') throw new RequestError(405, 'Метод не поддерживается.');
    send(response, 200, integrations.descriptors()); return true;
  }
  if (!identity.account) throw new RequestError(401, 'Войдите в аккаунт.');
  const owner = identity.owner;
  const evidence = /^\/api\/directory\/([^/]+)\/evidence$/u.exec(path);
  if (evidence) {
    if (request.method !== 'GET') throw new RequestError(405, 'Метод не поддерживается.');
    const id = decodeURIComponent(evidence[1]);
    const row = id === 'candidate-anna' ? integrations.store.forOwner(owner) : integrations.store.get(id);
    if (identity.account.role !== 'employer' && row?.owner !== owner) throw new RequestError(403, 'Доказательства других кандидатов доступны работодателю.');
    send(response, 200, integrations.employerEvidence(owner, id)); return true;
  }
  if (identity.account.role !== 'candidate') throw new RequestError(403, 'Подключения доступны соискателю.');
  const scope = 'auth:' + identity.account.id; response.setHeader('X-Platform-Identity', scope);
  if (path === '/api/integrations/fsp-public/search') {
    if (request.method !== 'GET') throw new RequestError(405, 'Метод не поддерживается.');
    if ([...url.searchParams.keys()].some(key => !['name','limit','offset'].includes(key))
      || [...url.searchParams.keys()].some(key => url.searchParams.getAll(key).length > 1)) throw new RequestError(400, 'Недопустимые параметры поиска.');
    integrations.requireConsent(owner);
    limit('fsp-public-search:' + owner, 30, 60000);
    response.setHeader('Cache-Control', 'no-store');
    send(response, 200, integrations.publicCatalog.search(url.searchParams.get('name'), url.searchParams.get('limit') ?? '20', url.searchParams.get('offset') ?? '0')); return true;
  }
  const match = /^\/api\/integrations\/([a-z][a-z0-9-]{0,40})(?:\/(connect|sync|callback))?$/u.exec(path);
  if (['POST','DELETE'].includes(request.method) && match?.[2] !== 'callback' && request.headers['x-platform-identity'] !== scope) throw new RequestError(409, 'Аккаунт изменился. Обновите страницу.');
  if (path === '/api/integrations' && request.method === 'GET') { send(response, 200, integrations.connections(owner)); return true; }
  if (path === '/api/profile/evidence' && request.method === 'GET') { send(response, 200, integrations.evidence(owner)); return true; }
  const job = /^\/api\/integration-jobs\/([a-f\d-]{36})$/u.exec(path);
  if (job && request.method === 'GET') { send(response, 200, integrations.job(owner, job[1])); return true; }
  if (match) {
    const [, provider, action] = match;
    if (action === 'connect' && request.method === 'POST') {
      limit('integration-connect:' + owner, 10, 600000);
      send(response, 202, await integrations.connect(owner, provider, await body(request))); return true;
    }
    if (action === 'callback' && request.method === 'POST') {
      limit('integration-callback:' + owner, 20, 600000);
      const input = await body(request);
      if (Object.keys(input).some(key => !['state','code','error'].includes(key))) throw new RequestError(400, 'Недопустимые поля запроса.');
      send(response, 200, await integrations.callback(owner, provider, input)); return true;
    }
    if (action === 'sync' && request.method === 'POST') {
      limit('integration-sync:' + owner, 10, 600000);
      const input = await body(request); if (Object.keys(input).length) throw new RequestError(400, 'Ожидается пустой объект.');
      send(response, 202, { job: integrations.sync(owner, provider) }); return true;
    }
    if (!action && request.method === 'DELETE') {
      if (!integrations.providers.has(provider) && !integrations.connections(owner).connections.some(item => item.provider === provider)) throw new RequestError(404, 'Источник не найден.');
      send(response, 200, integrations.disconnect(owner, provider)); return true;
    }
  }
  throw new RequestError(match || job || ['/api/integrations','/api/profile/evidence'].includes(path) ? 405 : 404, 'Метод или путь не поддерживается.');
}
