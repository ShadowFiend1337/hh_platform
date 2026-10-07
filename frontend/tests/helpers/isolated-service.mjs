import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createAssessmentServer } from '../../../server/server.mjs';

/** A real API and real frontend, with a disposable database and an in-memory test mailbox. */
export async function startIsolatedService(options = {}) {
  const codes = new Map();
  const service = createAssessmentServer({ ...options, dbPath: ':memory:', authEnv: {},
    authMailer: async ({ email, code }) => { codes.set(email, code); return { delivery: 'development' }; } });
  await new Promise(resolve => service.server.listen(0, '127.0.0.1', resolve));
  const api = `http://127.0.0.1:${service.server.address().port}`;
  let frontend;
  try {
    frontend = await createServer({ root: fileURLToPath(new URL('../../', import.meta.url)),
      configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
      logLevel: 'error', server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false,
        proxy: { '/api': { target: api, changeOrigin: false } } } });
    await frontend.listen();
  } catch (error) {
    await frontend?.close();
    await new Promise(resolve => { service.server.close(resolve); service.server.closeAllConnections(); });
    throw error;
  }
  const base = `http://127.0.0.1:${frontend.httpServer.address().port}`;
  return { base, service, codes, async close() {
    await frontend.close();
    await new Promise(resolve => { service.server.close(resolve); service.server.closeAllConnections(); });
  } };
}
