import { RequestError } from './assessment.mjs';
import { DemoFspProvider, fspDemoScenarios } from './fsp-provider.mjs';
import { participantByFspId, participantEvidence } from './fsp-id.mjs';
import { createHash } from 'node:crypto';

const invalid = message => { throw new RequestError(400, message); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);

/** Session-bound demonstration of a provider-owned FSP connection. No network
 * request, user-supplied external identity, real OAuth or federation proof. */
export class FspIntegrationService {
  constructor(store, { now = Date.now, accountForOwner, env = {}, provider = new DemoFspProvider(),
    publishProfile = (_owner, profile) => profile } = {}) {
    this.store = store; this.db = store.db; this.now = now; this.accountForOwner = accountForOwner; this.provider = provider;
    this.publishProfile = publishProfile;
    this.enabled = ![env.APP_ENV, env.NODE_ENV].includes('production') && env.INTEGRATION_DEMO !== '0';
    this.db.exec(`CREATE TABLE IF NOT EXISTS fsp_demo_connections (
      owner TEXT PRIMARY KEY REFERENCES platform_accounts(owner) ON DELETE CASCADE,
      provider TEXT NOT NULL, subject TEXT NOT NULL UNIQUE, external_id TEXT NOT NULL UNIQUE,
      scenario TEXT NOT NULL, consent_at TEXT NOT NULL, last_synced_at TEXT NOT NULL,
      evidence TEXT NOT NULL
    ) STRICT;`);
  }

  authorize(owner) {
    const account = typeof owner === 'string' && this.accountForOwner?.(owner);
    if (!account) throw new RequestError(401, 'Войдите в аккаунт.');
    if (account.role !== 'candidate') throw new RequestError(403, 'Привязка ФСП доступна соискателю.');
    return account;
  }

  account(owner) {
    this.authorize(owner);
    return this.db.prepare('SELECT * FROM platform_accounts WHERE owner=?').get(owner);
  }

  connection(owner) {
    return this.db.prepare('SELECT * FROM fsp_demo_connections WHERE owner=?').get(owner);
  }

  evidence(connection) {
    if (!connection) return [];
    return JSON.parse(connection.evidence);
  }

  fields(connection) {
    const evidence = this.evidence(connection);
    const active = evidence.filter(item => item.status === 'active');
    return { fspId: connection?.external_id || '', achievements: active.map(({ title, result, year }) => ({ title, result, year })),
      fspEvidence: connection ? { provider: 'fsp-demo', mode: 'demo', identityVerified: false,
        lastSyncedAt: connection.last_synced_at, activeCount: active.length,
        revokedCount: evidence.filter(item => item.status === 'revoked').length } : null };
  }

  read(owner) {
    const account = this.account(owner);
    const profile = account ? JSON.parse(account.profile) : null;
    const connection = this.connection(owner);
    const usable = Boolean(connection && profile?.consent && profile.fspId === connection.external_id);
    return { enabled: this.enabled, revision: account?.revision || 0,
      connection: usable ? { provider: 'fsp-demo', mode: 'demo', identityVerified: false,
        externalId: connection.external_id, scenario: connection.scenario, consentAt: connection.consent_at,
        lastSyncedAt: connection.last_synced_at } : null,
      evidence: usable ? this.evidence(connection) : [],
      profile: usable ? this.fields(connection) : { fspId: profile?.fspId || '', achievements: [], fspEvidence: null } };
  }

  checked(owner, input, allowed) {
    if (!object(input) || Object.keys(input).some(key => !allowed.includes(key))) invalid('Недопустимые поля запроса ФСП.');
    if (!Number.isSafeInteger(input.baseRevision) || input.baseRevision < 0) invalid('Некорректная версия данных.');
    const account = this.account(owner);
    if (!account) throw new RequestError(409, 'Сначала сохраните профиль.');
    if (account.revision !== input.baseRevision) throw new RequestError(409, 'Профиль изменился. Обновите привязку.');
    return { account, profile: JSON.parse(account.profile) };
  }

  persist(owner, account, profile) {
    const timestamp = new Date(this.now()).toISOString();
    this.db.prepare('UPDATE platform_accounts SET profile=?,revision=revision+1,updated_at=? WHERE owner=? AND revision=?')
      .run(JSON.stringify(profile), timestamp, owner, account.revision);
    const row = this.store.get(account.public_id);
    // Preserve the assessment-owned eligibility; a provider cannot grant a grade.
    if (row) this.store.upsert({ ...this.publishProfile(owner, profile, row), id: account.public_id }, owner, Boolean(row.eligible));
  }

  connect(owner, input) {
    this.authorize(owner);
    if (!this.enabled) throw new RequestError(403, 'Демонстрационная привязка отключена.');
    return this.store.transaction(() => {
      const { account, profile } = this.checked(owner, input, ['baseRevision', 'scenario', 'consent']);
      if (input.consent !== true || !profile.consent) invalid('Подтвердите демонстрационную привязку и согласие на обработку данных.');
      const scenario = input.scenario === undefined ? 'achievements' : input.scenario;
      if (!fspDemoScenarios.includes(scenario)) invalid('Неизвестный демонстрационный сценарий.');
      const data = this.provider.load(owner, scenario);
      const timestamp = new Date(this.now()).toISOString();
      this.db.prepare(`INSERT INTO fsp_demo_connections VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(owner) DO UPDATE SET
        provider=excluded.provider,subject=excluded.subject,external_id=excluded.external_id,
        scenario=excluded.scenario,consent_at=excluded.consent_at,last_synced_at=excluded.last_synced_at,evidence=excluded.evidence`)
        .run(owner, 'fsp-demo', data.subject, data.externalId, scenario, timestamp, timestamp, JSON.stringify(data.evidence));
      Object.assign(profile, this.fields(this.connection(owner)));
      this.persist(owner, account, profile);
      return this.read(owner);
    });
  }

  /** Links the participant confirmed by FSP ID sign-in and imports their results. */
  connectIdentity(owner, user) {
    this.authorize(owner);
    const participant = participantByFspId(user.fsp_id);
    if (!participant) return null;
    return this.store.transaction(() => {
      const account = this.account(owner);
      if (!account) throw new RequestError(409, 'Сначала сохраните профиль.');
      const profile = JSON.parse(account.profile);
      const timestamp = new Date(this.now()).toISOString();
      const subject = createHash('sha256').update(`fsp-id\0${participant.sub}`).digest('hex');
      this.db.prepare(`INSERT INTO fsp_demo_connections VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(owner) DO UPDATE SET
        provider=excluded.provider,subject=excluded.subject,external_id=excluded.external_id,
        scenario=excluded.scenario,consent_at=excluded.consent_at,last_synced_at=excluded.last_synced_at,evidence=excluded.evidence`)
        .run(owner, 'fsp-demo', subject, participant.fspId, 'fsp-id', timestamp, timestamp, JSON.stringify(participantEvidence(participant)));
      Object.assign(profile, this.fields(this.connection(owner)));
      this.persist(owner, account, profile);
      return this.read(owner);
    });
  }

  sync(owner, input) {
    this.authorize(owner);
    if (!this.enabled) throw new RequestError(403, 'Демонстрационная привязка отключена.');
    return this.store.transaction(() => {
      const { account, profile } = this.checked(owner, input, ['baseRevision']);
      const connection = this.connection(owner);
      if (!connection || !profile.consent || profile.fspId !== connection.external_id) throw new RequestError(409, 'Сначала привяжите ФСП.');
      const participant = connection.scenario === 'fsp-id' ? participantByFspId(connection.external_id) : null;
      const data = participant ? { subject: connection.subject, externalId: participant.fspId, evidence: participantEvidence(participant) }
        : this.provider.load(owner, connection.scenario);
      if (data.subject !== connection.subject || data.externalId !== connection.external_id) throw new RequestError(409, 'Внешняя привязка изменилась.');
      this.db.prepare('UPDATE fsp_demo_connections SET evidence=?,last_synced_at=? WHERE owner=?')
        .run(JSON.stringify(data.evidence), new Date(this.now()).toISOString(), owner);
      Object.assign(profile, this.fields(this.connection(owner)));
      this.persist(owner, account, profile);
      return this.read(owner);
    });
  }

  disconnect(owner, input) {
    this.authorize(owner);
    return this.store.transaction(() => {
      const { account, profile } = this.checked(owner, input, ['baseRevision']);
      this.db.prepare('DELETE FROM fsp_demo_connections WHERE owner=?').run(owner);
      Object.assign(profile, this.fields(null));
      this.persist(owner, account, profile);
      return this.read(owner);
    });
  }

  /** Called inside PlatformService.save's existing transaction AFTER normal
   * profile validation, BEFORE profile JSON and directory indexes are saved. */
  applyProfile(owner, profile) {
    const connection = this.connection(owner);
    if (!connection) { delete profile.fspEvidence; return profile; }
    if (!profile.consent || profile.fspId !== connection.external_id) {
      this.db.prepare('DELETE FROM fsp_demo_connections WHERE owner=?').run(owner);
      profile.achievements = []; delete profile.fspEvidence;
      if (!profile.consent && profile.fspId === connection.external_id) profile.fspId = '';
      return profile;
    }
    Object.assign(profile, this.fields(connection));
    return profile;
  }
}
