import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssessmentServer } from '../server.mjs';

async function serve(t, authEnv) {
  const service = createAssessmentServer({ dbPath: ':memory:', authEnv });
  await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { service.server.close(resolve); service.server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${service.server.address().port}`;
  return (forwarded) => fetch(base + '/api/health', { headers: forwarded ? { 'X-Forwarded-For': forwarded } : {} }).then(response => response.status);
}

test('behind a trusted proxy the per-address limit uses the address the proxy appended', async t => {
  const health = await serve(t, { TRUST_PROXY: '1', API_RATE_LIMIT_PER_MINUTE: '30' });
  for (let index = 0; index < 30; index++) assert.equal(await health('203.0.113.' + index + ', 198.51.100.7'), 200);
  assert.equal(await health('1.2.3.4, 198.51.100.7'), 429, 'A spoofed prefix does not create a new budget');
  assert.equal(await health('198.51.100.8'), 200, 'Another client keeps its own budget');
});

test('without TRUST_PROXY the header is ignored and the socket address is used', async t => {
  const health = await serve(t, { API_RATE_LIMIT_PER_MINUTE: '30' });
  for (let index = 0; index < 30; index++) assert.equal(await health('198.51.100.' + index), 200);
  assert.equal(await health('198.51.100.200'), 429);
});
