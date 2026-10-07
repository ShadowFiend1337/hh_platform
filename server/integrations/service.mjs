import { createCipheriv, createDecipheriv, createHash, createHmac, timingSafeEqual, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { RequestError } from '../assessment.mjs';
import { PublicSourceChecks } from './source-checks.mjs';
import { AchievementClaims } from './claims.mjs';
import { PublicFspCatalog } from './public-fsp.mjs';
import { ProviderError, createProviders, secretToken, trustedUrl } from './providers.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const iso = now => new Date(now()).toISOString();
const own = value => value && typeof value === 'object' && !Array.isArray(value);
const scrub = value => value.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/gu, '[контакт скрыт]')
  .replace(/(?:\+?\d[\d ()-]{8,}\d)/gu, match => match.replace(/\D/gu, '').length >= 10 ? '[контакт скрыт]' : match);
function text(value, max, nullable = false, sanitize = true) {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f]/u.test(value)) throw new ProviderError('invalid_source_response');
  return sanitize ? scrub(value.trim()) : value.trim();
}
const skillRules = { algorithms: ['Алгоритмы', 'Структуры данных'], cybersecurity: ['Информационная безопасность'], data_analysis: ['Анализ данных'] };
export function normalizeEvidence(value, connection, provider, now) {
  if (!own(value)) throw new ProviderError('invalid_source_response');
  const externalId = text(value.id, 200, false, false);
  const occurredAt = text(value.occurredAt, 40, false, false);
  if (!/^\d{4}-\d{2}-\d{2}T/u.test(occurredAt) || !Number.isFinite(Date.parse(occurredAt)) || Date.parse(occurredAt) > now() + 86400000
    || !['individual', 'team'].includes(value.participation) || !['active', 'revoked'].includes(value.status)
    || value.place !== null && (!Number.isSafeInteger(value.place) || value.place < 1 || value.place > 1000000)) throw new ProviderError('invalid_source_response');
  let sourceUrl = null;
  if (value.sourceUrl !== null) {
    try { sourceUrl = trustedUrl(value.sourceUrl).href; if (sourceUrl.length > 2000) throw new Error(); }
    catch { throw new ProviderError('invalid_source_response'); }
    // Public links must not carry bearer tokens or arbitrary query strings.
    const url = new URL(sourceUrl); if (url.search) throw new ProviderError('invalid_source_response');
  }
  const discipline = text(value.discipline, 100);
  const attribution = value.participation === 'team' ? 'team_result' : 'individual_result';
  return { id: hash(`${connection.id}\0${externalId}`), provider: provider.id, externalRecordId: externalId,
    title: text(value.title, 300), discipline, occurredAt: new Date(occurredAt).toISOString(), result: text(value.result, 1000),
    place: value.place, participation: value.participation, teamRole: text(value.teamRole, 200, true), sourceUrl,
    status: value.status === 'revoked' ? 'revoked' : provider.mode === 'demo' ? 'demo' : connection.identity_verified ? 'verified' : 'unverified',
    identityVerified: Boolean(connection.identity_verified), checkedAt: iso(now),
    validUntil: new Date(now() + 7 * 86400000).toISOString(),
    skills: (Object.hasOwn(skillRules, discipline) ? skillRules[discipline] : []).map(skill => ({ skill, scope: attribution, ruleVersion: 'fsp-discipline-v1' })),
    snapshotHash: hash(JSON.stringify(value)), mappingVersion: 'fsp-discipline-v1' };
}

export function encryptionKey(env, dbPath) {
  if (env.INTEGRATION_ENCRYPTION_KEY) {
    if (!/^[a-f\d]{64}$/iu.test(env.INTEGRATION_ENCRYPTION_KEY)) throw new Error('INTEGRATION_ENCRYPTION_KEY must contain 64 hexadecimal characters');
    return Buffer.from(env.INTEGRATION_ENCRYPTION_KEY, 'hex');
  }
  if ((env.APP_ENV === 'production' || env.NODE_ENV === 'production') || dbPath === ':memory:') return randomBytes(32);
  const path = `${dbPath}.integrations.key`;
  mkdirSync(dirname(path), { recursive: true });
  if (!existsSync(path)) {
    try { writeFileSync(path, randomBytes(32), { mode: 0o600, flag: 'wx' }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  const key = readFileSync(path); if (key.length !== 32) throw new Error('Invalid integration encryption key file');
  return key;
}
export class IntegrationService {
  constructor(store, { dbPath = ':memory:', env = process.env, providers, now = Date.now, fetcher = fetch, retryDelayMs = 1000, automatic = true, publicCatalog, publicFetcher } = {}) {
    this.publicCatalog = publicCatalog || new PublicFspCatalog();
    this.store = store; this.db = store.db; this.now = now; this.retryDelayMs = retryDelayMs; this.closed = false;
    this.claimsEncryptionConfigured = ![env.APP_ENV,env.NODE_ENV].includes('production') || Boolean(env.INTEGRATION_ENCRYPTION_KEY);
    this.key = encryptionKey(env, dbPath); this.providers = new Map((providers || createProviders(env, { now, fetcher })).map(provider => [provider.id, provider]));
    this.webhookSecret = env.FSP_WEBHOOK_SECRET;
    this.abort = new AbortController(); this.processing = false;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS integration_connections (
        id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES platform_accounts(owner) ON DELETE CASCADE,
        provider TEXT NOT NULL, subject TEXT NOT NULL, external_id TEXT NOT NULL,
        identity_verified INTEGER NOT NULL, credentials TEXT NOT NULL,
        status TEXT NOT NULL, consent_at TEXT NOT NULL, created_at TEXT NOT NULL,
        last_synced_at TEXT, last_attempt_at TEXT, last_error TEXT,
        UNIQUE(owner,provider), UNIQUE(provider,subject)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS integration_pending (
        state_hash TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES platform_accounts(owner) ON DELETE CASCADE,
        provider TEXT NOT NULL, secrets TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS integration_evidence (
        id TEXT PRIMARY KEY, connection_id TEXT NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,
        external_id TEXT NOT NULL, status TEXT NOT NULL, valid_until TEXT NOT NULL, payload TEXT NOT NULL,
        UNIQUE(connection_id,external_id)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS integration_jobs (
        id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES platform_accounts(owner) ON DELETE CASCADE,
        connection_id TEXT NOT NULL, provider TEXT NOT NULL, status TEXT NOT NULL,
        attempts INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, error TEXT, result_count INTEGER
      ) STRICT;
      CREATE UNIQUE INDEX IF NOT EXISTS integration_active_job ON integration_jobs(connection_id) WHERE status IN ('queued','running');
      CREATE INDEX IF NOT EXISTS integration_job_owner ON integration_jobs(owner,created_at);
      CREATE INDEX IF NOT EXISTS integration_evidence_connection ON integration_evidence(connection_id,status);
      CREATE TABLE IF NOT EXISTS integration_events (
        provider TEXT NOT NULL, id TEXT NOT NULL, received_at TEXT NOT NULL, payload_hash TEXT NOT NULL,
        PRIMARY KEY(provider,id)
      ) STRICT;
    `);
    this.claims = new AchievementClaims(this);
    this.publicSourceChecks = new PublicSourceChecks(this, { fetcher: publicFetcher || fetcher });
    store.integrationCount = owner => this.db.prepare(`SELECT COUNT(*) AS count FROM integration_evidence e
      JOIN integration_connections c ON c.id=e.connection_id WHERE c.owner=? AND c.provider='fsp'
      AND c.status='connected' AND c.identity_verified=1 AND e.status='verified' AND e.valid_until>?`).get(owner, iso(this.now)).count + this.claims.count(owner);
    // In-process worker with durable jobs. The main Node server is one process.
    this.db.prepare("UPDATE integration_jobs SET status='queued' WHERE status='running'").run();
    this.wake();
    if (automatic) { this.timer = setInterval(() => this.tick(), 60000); this.timer.unref(); }
  }
  seal(value) {
    const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const body = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
  }
  unseal(value) {
    try {
      const buffer = Buffer.from(value, 'base64'); const decipher = createDecipheriv('aes-256-gcm', this.key, buffer.subarray(0, 12));
      decipher.setAuthTag(buffer.subarray(12, 28)); return JSON.parse(Buffer.concat([decipher.update(buffer.subarray(28)), decipher.final()]));
    } catch { throw new ProviderError('reauthorization_required'); }
  }
  requireConsent(owner) {
    const row = this.db.prepare('SELECT profile FROM platform_accounts WHERE owner=?').get(owner);
    if (!row || !JSON.parse(row.profile).consent) throw new RequestError(409, 'Сначала сохраните профиль с согласием на обработку данных.');
  }
  provider(id) {
    const provider = this.providers.get(id);
    if (!provider) throw new RequestError(404, 'Источник не найден.');
    if (!provider.enabled) throw new RequestError(503, 'Источник ещё не настроен.');
    return provider;
  }
  descriptors() {
    return { providers: [...this.providers.values()].map(provider => ({ id: provider.id, name: provider.name, mode: provider.mode, auth: provider.auth,
      enabled: provider.enabled, capabilities: ['achievements'], contractVersion: 'fsp-resource-v1',
      ...(provider.mode === 'demo' ? { scenarios: ['achievements', 'empty', 'not-found', 'unavailable', 'revoked'] } : {}) })) };
  }
  connections(owner) {
    return { connections: this.db.prepare('SELECT * FROM integration_connections WHERE owner=? ORDER BY provider').all(owner).map(row => this.publicConnection(row)) };
  }
  publicConnection(row) {
    const evidence = this.evidence(row.owner).items.filter(item => item.provider === row.provider);
    const activeJob = this.db.prepare("SELECT * FROM integration_jobs WHERE connection_id=? AND status IN ('queued','running')").get(row.id);
    return { id: row.id, provider: row.provider, externalId: row.external_id, identityVerified: Boolean(row.identity_verified), status: row.status,
      consentAt: row.consent_at, createdAt: row.created_at, lastSyncedAt: row.last_synced_at, lastError: row.last_error, evidenceCount: evidence.length,
      activeJob: activeJob ? this.publicJob(activeJob) : null };
  }
  async connect(owner, id, input) {
    this.requireConsent(owner); const provider = this.provider(id);
    if (!own(input) || input.consent !== true || Object.keys(input).some(key => !['consent', 'scenario'].includes(key))
      || provider.mode !== 'demo' && input.scenario !== undefined) throw new RequestError(400, 'Нужно отдельное согласие на получение внешних данных.');
    if (this.db.prepare('SELECT 1 FROM integration_connections WHERE owner=? AND provider=?').get(owner, id)) throw new RequestError(409, 'Источник уже подключён. Сначала отключите его.');
    if (provider.mode === 'demo') {
      const connection = this.attach(owner, provider, provider.connect(owner, input.scenario));
      const job = this.sync(owner, id);
      return { connection: this.publicConnection(connection), job, authorizationUrl: null, expiresAt: null };
    }
    const state = secretToken(), nonce = secretToken(), verifier = secretToken();
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    let authorizationUrl;
    try { authorizationUrl = await provider.authorize({ state, nonce, challenge }); }
    catch { throw new RequestError(503, 'Авторизация источника временно недоступна.'); }
    if (this.closed) throw new RequestError(503, 'Сервис завершает работу.');
    this.requireConsent(owner);
    const createdAt = iso(this.now), expiresAt = new Date(this.now() + 10 * 60000).toISOString();
    this.db.prepare('DELETE FROM integration_pending WHERE owner=? AND provider=? OR expires_at<=?').run(owner, id, createdAt);
    this.db.prepare('INSERT INTO integration_pending VALUES(?,?,?,?,?,?)').run(hash(state), owner, id, this.seal({ nonce, verifier }), expiresAt, createdAt);
    return { authorizationUrl, expiresAt, connection: null, job: null };
  }
  attach(owner, provider, identity) {
    this.requireConsent(owner);
    if (typeof identity.subject !== 'string' || !identity.subject || typeof identity.externalId !== 'string' || !identity.externalId
      || provider.mode === 'live' && identity.identityVerified !== true) throw new ProviderError('invalid_identity');
    if (this.db.prepare('SELECT 1 FROM integration_connections WHERE provider=? AND (subject=? OR owner=?)').get(provider.id, identity.subject, owner)) {
      throw new RequestError(409, 'Внешний аккаунт уже связан.');
    }
    const id = randomUUID(), timestamp = iso(this.now);
    this.db.prepare('INSERT INTO integration_connections VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id, owner, provider.id, identity.subject,
      identity.externalId, Number(identity.identityVerified), this.seal(identity.credentials), 'connected', timestamp, timestamp, null, null, null);
    return this.db.prepare('SELECT * FROM integration_connections WHERE id=?').get(id);
  }
  async callback(owner, id, query) {
    const provider = this.provider(id);
    if (provider.mode !== 'live' || typeof query.state !== 'string' || query.state.length > 200) throw new RequestError(400, 'Некорректное завершение подключения.');
    const pending = this.db.prepare('SELECT * FROM integration_pending WHERE state_hash=? AND owner=? AND provider=?').get(hash(query.state), owner, id);
    if (!pending || Date.parse(pending.expires_at) <= this.now()) throw new RequestError(400, 'Подключение истекло или уже завершено.');
    this.db.prepare('DELETE FROM integration_pending WHERE state_hash=?').run(pending.state_hash);
    if (query.error || typeof query.code !== 'string' || !query.code || query.code.length > 4000) throw new RequestError(400, 'Авторизация источника не завершена.');
    this.requireConsent(owner);
    let identity;
    try { identity = await provider.exchange(query.code, this.unseal(pending.secrets)); }
    catch { throw new RequestError(403, 'Не удалось подтвердить внешний аккаунт. Начните подключение заново.'); }
    if (this.closed) throw new RequestError(503, 'Сервис завершает работу.');
    const connection = this.attach(owner, provider, identity);
    return { connection: this.publicConnection(connection), job: this.sync(owner, id) };
  }
  sync(owner, id) {
    this.requireConsent(owner); this.provider(id);
    const connection = this.db.prepare('SELECT * FROM integration_connections WHERE owner=? AND provider=?').get(owner, id);
    if (!connection) throw new RequestError(404, 'Подключение не найдено.');
    if (connection.status === 'reauthorization_required') throw new RequestError(409, 'Отключите источник и подключите аккаунт заново.');
    const previous = this.db.prepare("SELECT * FROM integration_jobs WHERE connection_id=? AND status IN ('queued','running')").get(connection.id);
    if (previous) return this.publicJob(previous);
    const jobId = randomUUID(), timestamp = iso(this.now);
    this.db.prepare('INSERT INTO integration_jobs VALUES(?,?,?,?,?,?,?,?,?,?)').run(jobId, owner, connection.id, id, 'queued', 0, timestamp, timestamp, null, null);
    this.wake(); return this.job(owner, jobId);
  }
  job(owner, id) {
    const row = this.db.prepare('SELECT * FROM integration_jobs WHERE owner=? AND id=?').get(owner, id);
    if (!row) throw new RequestError(404, 'Задача не найдена.');
    return this.publicJob(row);
  }
  publicJob(row) {
    return { id: row.id, provider: row.provider, status: row.status, attempts: row.attempts, createdAt: row.created_at,
      updatedAt: row.updated_at, error: row.error, resultCount: row.result_count };
  }
  evidence(owner, { publicOnly = false } = {}) {
    const rows = this.db.prepare(`SELECT e.*,c.status AS connection_status,c.identity_verified FROM integration_evidence e
      JOIN integration_connections c ON c.id=e.connection_id WHERE c.owner=? ORDER BY json_extract(e.payload,'$.occurredAt') DESC,e.id`).all(owner);
    return { items: [...rows.map(row => {
      const item = JSON.parse(row.payload);
      if (item.status === 'verified' && (Date.parse(item.validUntil) <= this.now() || row.connection_status !== 'connected')) item.status = 'stale';
      if (publicOnly) { delete item.externalRecordId; delete item.snapshotHash; }
      return item;
    }), ...this.claims.evidence(owner, { publicOnly })], mappingVersion: 'fsp-discipline-v1' };
  }
  employerEvidence(owner, candidateId) {
    const row = candidateId === 'candidate-anna' ? this.store.forOwner(owner) : this.store.get(candidateId);
    if (!row?.owner || row.owner !== owner && (!row.consent || !row.visible || !row.eligible)) throw new RequestError(404, 'Профиль недоступен.');
    return this.evidence(row.owner, { publicOnly: row.owner !== owner });
  }
  disconnect(owner, id) {
    this.store.transaction(() => {
      const connection = this.db.prepare('SELECT * FROM integration_connections WHERE owner=? AND provider=?').get(owner, id);
      this.db.prepare('DELETE FROM integration_pending WHERE owner=? AND provider=?').run(owner, id);
      if (!connection) return;
      this.db.prepare("UPDATE integration_jobs SET status='cancelled',error='disconnected',updated_at=? WHERE connection_id=? AND status IN ('queued','running')").run(iso(this.now), connection.id);
      this.db.prepare('DELETE FROM integration_connections WHERE id=?').run(connection.id);
      this.reindex(owner);
    });
    return { status: 'disconnected' };
  }
  removeOwner(owner) {
    this.claims.removeOwner(owner);
    for (const row of this.db.prepare('SELECT provider FROM integration_connections WHERE owner=?').all(owner)) this.disconnect(owner, row.provider);
    this.db.prepare('DELETE FROM integration_pending WHERE owner=?').run(owner);
  }
  webhook(raw, headers) {
    if (!this.webhookSecret) throw new RequestError(503, 'Webhook источника не настроен.');
    const timestamp = headers['x-integration-timestamp'], signature = headers['x-integration-signature'];
    if (typeof timestamp !== 'string' || !/^\d{10}$/u.test(timestamp) || Math.abs(this.now() / 1000 - Number(timestamp)) > 300
      || typeof signature !== 'string' || !/^v1=[a-f\d]{64}$/u.test(signature)) throw new RequestError(401, 'Недействительная подпись события.');
    const expected = createHmac('sha256', this.webhookSecret).update(timestamp + '.').update(raw).digest();
    if (!timingSafeEqual(expected, Buffer.from(signature.slice(3), 'hex'))) throw new RequestError(401, 'Недействительная подпись события.');
    let event;
    try { event = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)); } catch { throw new RequestError(400, 'Некорректный JSON.'); }
    if (!own(event) || Object.keys(event).some(key => !['id','type','subject','fspId'].includes(key))
      || typeof event.id !== 'string' || !event.id || event.id.length > 200 || !['achievements.changed','identity.revoked'].includes(event.type)
      || typeof event.subject !== 'string' || !event.subject || event.subject.length > 255
      || typeof event.fspId !== 'string' || !event.fspId || event.fspId.length > 100) throw new RequestError(400, 'Некорректное событие.');
    const previous = this.db.prepare('SELECT payload_hash FROM integration_events WHERE provider=? AND id=?').get('fsp', event.id);
    if (previous) {
      if (previous.payload_hash !== hash(raw)) throw new RequestError(409, 'Идентификатор события уже использован.');
      return { status: 'accepted' };
    }
    const provider = this.provider('fsp');
    this.store.transaction(() => {
      this.db.prepare('INSERT INTO integration_events VALUES(?,?,?,?)').run('fsp', event.id, iso(this.now), hash(raw));
      const connection = this.db.prepare('SELECT * FROM integration_connections WHERE provider=? AND subject=? AND external_id=?').get('fsp', `${provider.issuer}#${event.subject}`, event.fspId);
      if (!connection) return;
      if (event.type === 'identity.revoked') {
        this.db.prepare("UPDATE integration_connections SET status='reauthorization_required',credentials=?,last_error='identity_revoked' WHERE id=?").run(this.seal({}), connection.id);
        for (const row of this.db.prepare('SELECT * FROM integration_evidence WHERE connection_id=?').all(connection.id)) {
          const payload = { ...JSON.parse(row.payload), status: 'revoked', checkedAt: iso(this.now) };
          this.db.prepare("UPDATE integration_evidence SET status='revoked',payload=? WHERE id=?").run(JSON.stringify(payload), row.id);
        }
        this.db.prepare("UPDATE integration_jobs SET status='cancelled',error='identity_revoked',updated_at=? WHERE connection_id=? AND status IN ('queued','running')").run(iso(this.now), connection.id);
        this.reindex(connection.owner);
      } else if (connection.status !== 'reauthorization_required') {
        try { this.requireConsent(connection.owner); this.sync(connection.owner, 'fsp'); }
        catch (error) { if (!(error instanceof RequestError) || error.status !== 409) throw error; }
      }
    });
    return { status: 'accepted' };
  }
  reindex(owner) {
    const row = this.store.forOwner(owner);
    const account = this.db.prepare('SELECT * FROM platform_accounts WHERE owner=?').get(owner);
    if (row && account) this.store.upsert({ ...JSON.parse(account.profile), id: row.id }, owner, Boolean(row.eligible));
    if (account) this.db.prepare('UPDATE platform_accounts SET revision=revision+1,updated_at=? WHERE owner=?').run(iso(this.now), owner);
  }
  wake() { setImmediate(() => { if (!this.closed) void this.drain().catch(() => { /* Durable queued jobs are retried on the next tick. */ }); }); }
  validConnection(job) {
    if (this.closed) return null;
    const connection = this.db.prepare('SELECT * FROM integration_connections WHERE id=?').get(job.connection_id);
    const active = this.db.prepare("SELECT 1 FROM integration_jobs WHERE id=? AND status='running'").get(job.id);
    const account = this.db.prepare('SELECT profile FROM platform_accounts WHERE owner=?').get(job.owner);
    return connection && active && account && JSON.parse(account.profile).consent ? connection : null;
  }
  async drain() {
    if (this.closed || this.processing) return;
    this.processing = true;
    try {
      while (!this.closed) {
        const job = this.db.prepare("SELECT * FROM integration_jobs WHERE status='queued' ORDER BY created_at,id LIMIT 1").get();
        if (!job) break;
        this.db.prepare("UPDATE integration_jobs SET status='running',updated_at=? WHERE id=?").run(iso(this.now), job.id);
        let error;
        for (let attempt = job.attempts; attempt < 3 && !this.closed; attempt++) {
          const connection = this.validConnection(job);
          if (!connection) { if (!this.closed) this.cancelJob(job.id, 'consent_revoked'); break; }
          this.db.prepare('UPDATE integration_jobs SET attempts=?,updated_at=? WHERE id=?').run(attempt + 1, iso(this.now), job.id);
          this.db.prepare('UPDATE integration_connections SET last_attempt_at=? WHERE id=?').run(iso(this.now), connection.id);
          try {
            const provider = this.provider(connection.provider);
            const snapshot = await provider.load({ ...connection, externalId: connection.external_id, credentials: this.unseal(connection.credentials) }, credentials => {
              if (!this.validConnection(job)) throw new ProviderError('disconnected');
              this.db.prepare('UPDATE integration_connections SET credentials=? WHERE id=?').run(this.seal(credentials), connection.id);
            });
            if (!this.validConnection(job)) { if (!this.closed) this.cancelJob(job.id, 'disconnected'); break; }
            if (snapshot.subject !== connection.subject || snapshot.externalId !== connection.external_id || !Array.isArray(snapshot.achievements) || snapshot.achievements.length > 2000) throw new ProviderError('identity_mismatch');
            const records = snapshot.achievements.map(value => normalizeEvidence(value, connection, provider, this.now));
            if (new Set(records.map(item => item.externalRecordId)).size !== records.length) throw new ProviderError('invalid_source_response');
            this.store.transaction(() => {
              const retained = new Set(records.map(item => item.id));
              for (const row of this.db.prepare('SELECT * FROM integration_evidence WHERE connection_id=?').all(connection.id)) {
                if (!retained.has(row.id)) {
                  const payload = { ...JSON.parse(row.payload), status: 'revoked', checkedAt: iso(this.now) };
                  this.db.prepare("UPDATE integration_evidence SET status='revoked',payload=? WHERE id=?").run(JSON.stringify(payload), row.id);
                }
              }
              for (const record of records) this.db.prepare(`INSERT INTO integration_evidence VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
                status=excluded.status,valid_until=excluded.valid_until,payload=excluded.payload`).run(record.id, connection.id, record.externalRecordId, record.status, record.validUntil, JSON.stringify(record));
              this.db.prepare("UPDATE integration_connections SET status='connected',last_synced_at=?,last_error=NULL WHERE id=?").run(iso(this.now), connection.id);
              this.db.prepare("UPDATE integration_jobs SET status='succeeded',error=NULL,result_count=?,updated_at=? WHERE id=?").run(records.length, iso(this.now), job.id);
              this.reindex(job.owner);
            });
            error = null; break;
          } catch (failure) {
            if (this.closed) break;
            if (!this.validConnection(job)) { this.cancelJob(job.id, 'disconnected'); break; }
            error = failure instanceof ProviderError ? failure : new ProviderError('source_unavailable');
            if (!error.retryable || attempt === 2) break;
            try { await delay(Math.max(this.retryDelayMs * 2 ** attempt, error.retryAfter * 1000), undefined, { signal: this.abort.signal }); }
            catch { break; }
          }
        }
        if (!this.closed && error && this.validConnection(job)) {
          this.store.transaction(() => {
            this.db.prepare("UPDATE integration_jobs SET status='failed',error=?,updated_at=? WHERE id=?").run(error.code, iso(this.now), job.id);
            const status = ['reauthorization_required', 'invalid_identity', 'identity_mismatch'].includes(error.code) ? 'reauthorization_required' : 'error';
            this.db.prepare('UPDATE integration_connections SET status=?,last_error=? WHERE id=?').run(status, error.code, job.connection_id);
            this.reindex(job.owner);
          });
        } else if (!this.closed) {
          // A crash after the third durable attempt must not strand running work.
          const remaining = this.db.prepare("SELECT 1 FROM integration_jobs WHERE id=? AND status='running'").get(job.id);
          if (remaining) this.cancelJob(job.id, 'retry_exhausted');
        }
      }
    } finally { this.processing = false; }
  }
  cancelJob(id, error) { this.db.prepare("UPDATE integration_jobs SET status='cancelled',error=?,updated_at=? WHERE id=? AND status IN ('running','queued')").run(error, iso(this.now), id); }
  tick() {
    if (this.closed) return;
    for (const row of this.db.prepare('SELECT * FROM integration_connections').all()) {
      const account = this.db.prepare('SELECT profile FROM platform_accounts WHERE owner=?').get(row.owner);
      if (!account || !JSON.parse(account.profile).consent) { this.disconnect(row.owner, row.provider); continue; }
      if (row.status !== 'reauthorization_required' && (!row.last_attempt_at || this.now() - Date.parse(row.last_attempt_at) >= 86400000)) {
        try { this.sync(row.owner, row.provider); } catch { /* Provider disabled or account removed. */ }
      }
      // Recompute the filter when freshness changes, even during an outage.
      const candidate = this.store.forOwner(row.owner);
      if (candidate) this.store.upsert({ ...JSON.parse(account.profile), id: candidate.id }, row.owner, Boolean(candidate.eligible));
    }
    const cutoff = new Date(this.now() - 30 * 86400000).toISOString();
    this.db.prepare("DELETE FROM integration_jobs WHERE status NOT IN ('running','queued') AND updated_at<?").run(cutoff);
    this.db.prepare('DELETE FROM integration_pending WHERE expires_at<=?').run(iso(this.now));
    this.claims.tick();
    this.wake();
  }
  close() { this.closed = true; clearInterval(this.timer); this.abort.abort(); }
}
