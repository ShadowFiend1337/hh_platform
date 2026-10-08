import test from 'node:test';
import assert from 'node:assert/strict';
import { rankComparableCandidates, rankingFspEvidence } from '../search-ranking.mjs';
import { DirectoryStore } from '../directory-store.mjs';
import { openStore } from '../store.mjs';
import { PlatformService } from '../platform.mjs';
import { FspIntegrationService } from '../fsp-integration.mjs';
import { DemoFspProvider } from '../fsp-provider.mjs';
import { createInitialState } from '../../frontend/src/model.ts';

const owner = 'aaaaaaaaaaaaaaaaaaaa-fsp-candidate-owner';
const other = 'bbbbbbbbbbbbbbbbbbbb-fsp-candidate-owner';
const employer = 'cccccccccccccccccccc-fsp-employer-owner';
const time = Date.parse('2026-10-08T09:00:00.000Z');
const errorStatus = expected => error => error.status === expected;
function fixture(t, env = {}) {
  const store = new DirectoryStore(':memory:', []);
  const assessments = openStore(':memory:');
  const accounts = new Map([[owner, { role: 'candidate' }], [other, { role: 'candidate' }], [employer, { role: 'employer' }]]);
  const accountForOwner = key => accounts.get(key) || null;
  const platform = new PlatformService(store, assessments, { accountForOwner, now: () => time });
  const fsp = new FspIntegrationService(store, { accountForOwner, env, now: () => time });
  platform.profileSource = (key, profile) => fsp.applyProfile(key, profile);
  for (const key of [owner, other]) {
    const state = createInitialState();
    Object.assign(state.profile, { name: 'Вымышленный кандидат', email: 'fsp-candidate@example.invalid',
      stack: ['React'], professionalRole: 'Frontend разработчик', consent: true, visible: true });
    platform.save(key, state, 0, 'candidate');
  }
  t.after(() => { assessments.close(); store.close(); });
  return { store, assessments, fsp, platform, accounts };
}

test('demo provider derives a distinct fictional identity from the session, never an entered federation ID', () => {
  const provider = new DemoFspProvider();
  const a = provider.load(owner), b = provider.load(other);
  assert.notEqual(a.subject, b.subject); assert.notEqual(a.externalId, b.externalId);
  assert.equal(a.identityVerified, false); assert.equal(a.evidence[0].source, 'demo');
  assert.equal(a.evidence[0].identityVerified, false);
  assert.deepEqual(provider.load(owner), a);
  assert.throws(() => provider.load(owner, 'live-identity'), errorStatus(400));
});

test('only the authenticated candidate can connect; demo consent and exact revision are required', t => {
  const { fsp, platform } = fixture(t);
  assert.throws(() => fsp.read('unknown'), errorStatus(401));
  assert.throws(() => fsp.read(employer), errorStatus(403));
  assert.throws(() => fsp.connect(owner, { baseRevision: 1, scenario: 'achievements', consent: false }), errorStatus(400));
  assert.throws(() => fsp.connect(owner, { baseRevision: 0, consent: true }), errorStatus(409));
  assert.throws(() => fsp.connect(owner, { baseRevision: 1, consent: true, externalId: 'REAL-123' }), errorStatus(400));
  assert.throws(() => fsp.connect(owner, { baseRevision: 1, consent: true, scenario: false }), errorStatus(400));
  assert.throws(() => fsp.connect(owner, { baseRevision: 1, consent: true, scenario: 'anything' }), errorStatus(400));
  assert.equal(platform.read(owner).revision, 1);
  assert.equal(fsp.read(owner).connection, null);
});

test('connecting writes provider-owned evidence, advances the shared revision and updates FSP filters without granting a grade', t => {
  const { fsp, platform, store } = fixture(t);
  const before = store.forOwner(owner);
  assert.equal(before.fsp, 0); assert.equal(before.eligible, 0);
  const connected = fsp.connect(owner, { baseRevision: 1, consent: true });
  assert.equal(connected.revision, 2); assert.equal(connected.profile.achievements.length, 1);
  assert.equal(connected.connection.identityVerified, false); assert.equal(connected.evidence[0].source, 'demo');
  assert.equal(connected.profile.fspEvidence.mode, 'demo');
  const saved = platform.read(owner);
  assert.equal(saved.revision, 2); assert.equal(saved.state.profile.achievements[0].title, connected.evidence[0].title);
  assert.equal(saved.state.profile.fspId, connected.connection.externalId);
  assert.equal(saved.state.profile.confirmed, null);
  assert.equal(store.forOwner(owner).fsp, 1); assert.equal(store.forOwner(owner).eligible, 0);
  assert.equal(fsp.read(other).connection, null); assert.equal(platform.read(other).state.profile.achievements.length, 0);
  assert.throws(() => fsp.sync(owner, { baseRevision: 1 }), errorStatus(409));
  const synced = fsp.sync(owner, { baseRevision: 2 });
  assert.equal(synced.revision, 3); assert.equal(synced.evidence.length, 1);
});

test('empty and revoked provider results do not qualify for the achievement filter', t => {
  const { fsp, store } = fixture(t);
  const empty = fsp.connect(owner, { baseRevision: 1, scenario: 'empty', consent: true });
  assert.equal(empty.connection.scenario, 'empty'); assert.equal(empty.evidence.length, 0);
  assert.equal(empty.profile.achievements.length, 0); assert.equal(store.forOwner(owner).fsp, 0);
  const revoked = fsp.connect(owner, { baseRevision: 2, scenario: 'revoked', consent: true });
  assert.equal(revoked.evidence[0].status, 'revoked'); assert.equal(revoked.profile.achievements.length, 0);
  assert.equal(revoked.profile.fspEvidence.revokedCount, 1); assert.equal(store.forOwner(owner).fsp, 0);
});

test('disconnect clears profile evidence and the directory signal together', t => {
  const { fsp, store, platform } = fixture(t);
  fsp.connect(owner, { baseRevision: 1, consent: true });
  const result = fsp.disconnect(owner, { baseRevision: 2 });
  assert.equal(result.connection, null); assert.equal(result.revision, 3);
  assert.equal(result.profile.fspId, ''); assert.deepEqual(result.profile.achievements, []);
  assert.equal(platform.read(owner).state.profile.fspId, ''); assert.equal(store.forOwner(owner).fsp, 0);
  assert.equal(fsp.connection(owner), undefined);
});

test('normal profile saves preserve source-owned evidence, reject client forgery and invalidate changed external IDs', t => {
  const { fsp, platform, store } = fixture(t);
  fsp.connect(owner, { baseRevision: 1, consent: true });
  let snapshot = platform.read(owner);
  const edited = structuredClone(snapshot.state);
  edited.profile.bio = 'Разрабатываю интерфейсы';
  edited.profile.achievements = [{ title: 'Поддельный титул', result: 'Чемпион', year: '2026' }];
  edited.profile.fspEvidence = { mode: 'live', identityVerified: true, activeCount: 999 };
  snapshot = platform.save(owner, edited, snapshot.revision, 'candidate');
  assert.equal(snapshot.state.profile.achievements[0].title, 'Демонстрационное соревнование ФСП');
  assert.equal(snapshot.state.profile.fspEvidence.identityVerified, false);
  assert.equal(snapshot.state.profile.fspEvidence.mode, 'demo');
  edited.profile.fspId = 'somebody-else';
  snapshot = platform.save(owner, edited, snapshot.revision, 'candidate');
  assert.equal(snapshot.state.profile.fspId, 'somebody-else');
  assert.deepEqual(snapshot.state.profile.achievements, []); assert.equal(snapshot.state.profile.fspEvidence, undefined);
  assert.equal(fsp.connection(owner), undefined); assert.equal(store.forOwner(owner).fsp, 0);
  assert.throws(() => fsp.sync(owner, { baseRevision: snapshot.revision }), errorStatus(409));
});

test('withdrawn processing consent invalidates the binding, and account deletion cascades provider records', t => {
  const { fsp, platform, store } = fixture(t);
  fsp.connect(owner, { baseRevision: 1, consent: true });
  let snapshot = platform.read(owner);
  snapshot.state.profile.consent = false; snapshot.state.profile.visible = false;
  snapshot = platform.save(owner, snapshot.state, snapshot.revision, 'candidate');
  assert.equal(snapshot.state.profile.fspId, ''); assert.deepEqual(snapshot.state.profile.achievements, []);
  assert.equal(fsp.connection(owner), undefined); assert.equal(store.forOwner(owner).fsp, 0);
  fsp.connect(other, { baseRevision: 1, consent: true });
  platform.delete(other);
  assert.equal(fsp.connection(other), undefined);
});

test('failed directory updates roll back both source records and profile revisions', t => {
  const { fsp, platform, store } = fixture(t);
  const original = store.upsert.bind(store);
  store.upsert = () => { throw new Error('Isolated disk failure'); };
  assert.throws(() => fsp.connect(owner, { baseRevision: 1, consent: true }), /Isolated disk failure/u);
  store.upsert = original;
  assert.equal(fsp.connection(owner), undefined); assert.equal(platform.read(owner).revision, 1);
  assert.equal(store.forOwner(owner).fsp, 0);
});

test('provider writes use the platform public-profile projection instead of republishing private legacy claims', t => {
  const { fsp, platform, store } = fixture(t);
  const privateProfile = platform.read(owner).state.profile;
  privateProfile.confirmed = { specialization: 'Frontend', grade: 'Senior', score: 100,
    date: new Date(time).toISOString() };
  store.db.prepare('UPDATE platform_accounts SET profile=? WHERE owner=?').run(JSON.stringify(privateProfile), owner);
  let projected = false;
  fsp.publishProfile = (key, profile, row) => {
    assert.equal(key, owner); assert.equal(row.eligible, 0); projected = true;
    return { ...profile, confirmed: null };
  };
  fsp.connect(owner, { baseRevision: 1, consent: true });
  assert.equal(projected, true);
  assert.equal(JSON.parse(store.forOwner(owner).public_payload).confirmed, null);
  assert.equal(store.forOwner(owner).grade, ''); assert.equal(store.forOwner(owner).eligible, 0);
  assert.equal(platform.read(owner).state.profile.confirmed.grade, 'Senior');
});

test('server demo provenance enables the existing bounded demonstration bonus without verifying a real identity', t => {
  const { fsp, platform } = fixture(t);
  fsp.connect(owner, { baseRevision: 1, consent: true });
  const linked = platform.read(owner).state.profile;
  const confirmed = { specialization: 'Frontend', grade: 'Middle', score: 80 };
  const person = { ...linked, id: 'linked', synthetic: false, confirmed };
  assert.equal(rankingFspEvidence(person), 'synthetic-demo');
  const other = { ...person, id: 'ordinary', name: 'ordinary', achievements: [], fspEvidence: null,
    confirmed: { ...confirmed, score: 82 } };
  const items = [{ person: other, rank: 6.1, semanticScore: .8 }, { person, rank: 6, semanticScore: .79 }];
  const ranked = rankComparableCandidates(items);
  assert.equal(ranked[0].person.id, 'linked'); assert.equal(ranked[0].rank, 6);
  assert.match(ranked[0].reason, /Демонстрационные/u);
  assert.equal(person.fspEvidence.identityVerified, false);
});

test('demo connections are disabled in production and when explicitly configured off', t => {
  const first = fixture(t, { NODE_ENV: 'production' });
  assert.equal(first.fsp.read(owner).enabled, false);
  assert.throws(() => first.fsp.connect(owner, { baseRevision: 1, consent: true }), errorStatus(403));
  const second = fixture(t, { INTEGRATION_DEMO: '0' });
  assert.equal(second.fsp.read(owner).enabled, false);
  assert.throws(() => second.fsp.connect(owner, { baseRevision: 1, consent: true }), errorStatus(403));
});
