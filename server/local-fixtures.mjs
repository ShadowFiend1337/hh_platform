// These exact immutable account tuples belong to the explicit local setup
// script. Profile names, contact email, synthetic and client flags confer no
// authority. Old fixture rows are recognised without a schema migration.
const localFixtures = Object.freeze([
  Object.freeze({ role: 'candidate', login: 'local_candidate', email: 'candidate@local.example.test' }),
  Object.freeze({ role: 'employer', login: 'local_employer', email: 'employer@local.example.test' }),
  // A separate moderator account; it sees only the test realm. Earlier setups made it an
  // employer: such a row stays in the test realm until the setup script replaces it.
  Object.freeze({ role: 'moderator', login: 'local_moderator', email: 'moderator@local.example.test', formerRole: 'employer' }),
]);

/** Public demo password of the team test accounts (never available in production). */
export const localFixturePassword = 'LocalDemo2026!';
export const localFixtureLogins = localFixtures.map(fixture => ({ role: fixture.role, login: fixture.login }));

export function isLocalFixtureAccount(account) {
  const login = typeof account?.login === 'string' ? account.login.normalize('NFKC').toLowerCase() : '';
  return Boolean(account && localFixtures.some(fixture => (fixture.role === account.role || fixture.formerRole === account.role)
    && fixture.login === login && fixture.email === account.email));
}

export function accountsShareRealm(viewer, target) {
  return Boolean(viewer && target && isLocalFixtureAccount(viewer) === isLocalFixtureAccount(target));
}
