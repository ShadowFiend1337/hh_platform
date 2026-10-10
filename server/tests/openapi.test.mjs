import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareLocalAccounts, localAccountPassword } from '../../scripts/local-accounts.mjs';
import { createAssessmentServer } from '../server.mjs';
import { platformOpenApi } from '../openapi.mjs';

const spec = platformOpenApi();
const methods = ['get', 'post', 'put', 'patch', 'delete'];
const operations = Object.entries(spec.paths).flatMap(([path, item]) => methods.filter(method => item[method]).map(method => ({ path, method, operation: item[method], item })));

/** Expands the route regular expressions of server.mjs into OpenAPI path templates. */
function templates(source) {
  let variants = [''];
  for (const part of source.replaceAll('\\/', '/').split(/(\([^)]*\)\??)/u).filter(Boolean)) {
    const group = /^\((.*)\)(\?)?$/u.exec(part);
    const options = !group ? [part] : group[2] ? ['', group[1]] : /^[\w|-]+$/u.test(group[1]) ? group[1].split('|') : ['{id}'];
    variants = variants.flatMap(prefix => options.map(option => prefix + option));
  }
  return variants;
}

test('every route of the main server is documented and every reference resolves', () => {
  const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
  const literal = [...server.matchAll(/url\.pathname === '(\/api\/[^']+)'/gu)].map(match => match[1]);
  const patterns = [...server.matchAll(/\/\^(\\\/api\\\/[^$]+)\$\//gu)].flatMap(match => templates(match[1]));
  const documented = new Set(Object.keys(spec.paths));
  const missing = [...new Set([...literal, ...patterns])].filter(path => !documented.has(path));
  assert.deepEqual(missing, [], 'Undocumented routes');
  assert.ok(patterns.includes('/api/tasks/{id}/ai-review') && patterns.includes('/api/assessment/attempts/{id}/submit'));

  const text = JSON.stringify(spec);
  for (const [, kind, name] of text.matchAll(/"#\/components\/(schemas|responses)\/([^"]+)"/gu)) {
    assert.ok(spec.components[kind][name], `Unresolved ${kind}/${name}`);
  }
  for (const { path, method, operation, item } of operations) {
    assert.ok(Object.keys(operation.responses || {}).length, `${method} ${path} has responses`);
    const params = [...(item.parameters || []), ...(operation.parameters || [])].filter(param => param.in === 'path').map(param => param.name);
    for (const [, name] of path.matchAll(/\{([^}]+)\}/gu)) assert.ok(params.includes(name), `${method} ${path} documents {${name}}`);
  }
  assert.ok(operations.length >= 90, 'Main API and the integrations module are merged: ' + operations.length);
});

test('each documented operation reaches a real handler, never the generic 404 or 405', async t => {
  const folder = await mkdtemp(join(tmpdir(), 'predel-openapi-')), dbPath = join(folder, 'openapi.sqlite');
  await prepareLocalAccounts(dbPath);
  const service = createAssessmentServer({ dbPath, authEnv: {}, llm: { configured: false, models: {}, usage: () => ({}) } });
  await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise(resolve => { service.server.close(resolve); service.server.closeAllConnections(); });
    await rm(folder, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${service.server.address().port}`;
  async function client(login) {
    const cookies = new Map();
    const call = async (path, method = 'GET', input, type = 'application/json') => {
      const response = await fetch(base + path, { method, redirect: 'manual', headers: { Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '),
        ...(input === undefined ? {} : { 'Content-Type': type }) }, body: input });
      for (const value of response.headers.getSetCookie()) { const [key, token] = value.split(';')[0].split('='); if (token) cookies.set(key, token); }
      const raw = await response.text();
      let data = null; try { data = JSON.parse(raw); } catch { data = raw; }
      return { status: response.status, data };
    };
    if (login) assert.equal((await call('/api/auth/login', 'POST', JSON.stringify({ loginOrEmail: login, password: localAccountPassword }))).status, 200);
    return call;
  }
  const employer = service.auth.store.accountByIdentifier('local_employer');
  service.auth.store.setModerator(employer.id, true, 'openapi-test');
  const clients = { guest: await client(), candidate: await client('local_candidate'), employer: await client('local_employer') };
  clients.moderator = clients.employer; clients.any = clients.candidate;
  const sample = path => path.replace('{id}', path.includes('/attempts/') ? '00000000-0000-4000-8000-000000000000'
    : path.includes('/item-bank/') ? 'gen-00000000-0000-4000-8000-000000000000'
      : path.includes('/review-bank/') ? 'variant-00000000-0000-4000-8000-000000000000' : 'unknown')
    .replace('{provider}', 'codeforces').replace(/\{[^}]+\}/gu, 'unknown');
  const skip = new Set(['post /api/auth/logout', 'delete /api/auth/account']);
  const results = [];
  for (const { path, method, operation } of operations) {
    if (skip.has(method + ' ' + path)) continue;
    const role = operation['x-role'] || (operation.security?.length ? 'any' : 'guest');
    const form = operation.requestBody?.content?.['application/x-www-form-urlencoded'];
    const input = !['post', 'put', 'patch'].includes(method) ? undefined : form ? '' : '{}';
    const reply = await clients[role](sample(path), method.toUpperCase(), input, form ? 'application/x-www-form-urlencoded' : 'application/json');
    results.push({ key: `${method.toUpperCase()} ${path}`, ...reply });
  }
  const generic = results.filter(result => result.status === 405 || result.status === 404 && result.data?.error === 'Страница не найдена.');
  assert.deepEqual(generic.map(result => `${result.key} → ${result.status}`), []);
  assert.ok(results.filter(result => result.status < 300).length > 20, 'Many operations succeed even with empty input');

  const docs = await clients.guest('/api/docs');
  assert.equal(docs.status, 200); assert.match(docs.data, /swagger-ui-dist@\d+\.\d+\.\d+/u);
  const served = await clients.guest('/api/openapi.json');
  assert.equal(served.status, 200); assert.deepEqual(served.data, JSON.parse(JSON.stringify(spec)));
});

test('the committed OpenAPI file matches the generator', () => {
  const committed = JSON.parse(readFileSync(new URL('../../docs/api/platform.openapi.json', import.meta.url), 'utf8'));
  assert.deepEqual(committed, JSON.parse(JSON.stringify(spec)), 'Run npm run docs:openapi');
});
