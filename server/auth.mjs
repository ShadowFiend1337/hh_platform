import { DatabaseSync } from 'node:sqlite';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash, randomBytes, randomInt, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { connect as connectSocket } from 'node:net';
import { connect as connectTls } from 'node:tls';
import { fileURLToPath } from 'node:url';

const scrypt = promisify(scryptCallback);
const passwordParameters = { cost: 16384, blockSize: 8, parallelization: 1, maxmem: 64 * 1024 * 1024 };
const codeAttempts = 5;
const developmentMailLog = fileURLToPath(new URL('./data/mail.log', import.meta.url));

export class AuthError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function asText(value, label, maximum, { required = true } = {}) {
  if (value === undefined || value === null) {
    if (!required) return '';
    throw new AuthError(400, `Укажите ${label}.`);
  }
  if (typeof value !== 'string') throw new AuthError(400, `Некорректное значение: ${label}.`);
  const result = value.normalize('NFKC').trim();
  if (required && !result) throw new AuthError(400, `Укажите ${label}.`);
  if (result.length > maximum) throw new AuthError(400, `${label}: допустимо до ${maximum} символов.`);
  return result;
}

export function normalizeEmail(value) {
  const email = asText(value, 'e-mail', 254).toLocaleLowerCase('en-US');
  const [local, domain, ...rest] = email.split('@');
  if (!local || !domain || rest.length || local.length > 64 || !/^[^\s@]+@[^\s@]+\.[^\s@.]+$/u.test(email)) {
    throw new AuthError(400, 'Укажите корректный e-mail.');
  }
  return email;
}

export function normalizeLogin(value) {
  const login = asText(value, 'логин', 32);
  if (login.length < 3 || !/^[\p{L}\p{N}][\p{L}\p{N}._-]{2,31}$/u.test(login)) {
    throw new AuthError(400, 'Логин должен содержать от 3 до 32 букв, цифр, точек, дефисов или подчёркиваний.');
  }
  return { login, normalized: login.toLocaleLowerCase('ru-RU') };
}

function password(value) {
  if (typeof value !== 'string') throw new AuthError(400, 'Укажите пароль.');
  if (value.length < 8 || value.length > 128 || Buffer.byteLength(value, 'utf8') > 512) {
    throw new AuthError(400, 'Пароль должен содержать от 8 до 128 символов.');
  }
  return value;
}

function role(value) {
  if (value !== 'candidate' && value !== 'employer') throw new AuthError(400, 'Выберите роль: соискатель или работодатель.');
  return value;
}

export function validateRegistration(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new AuthError(400, 'Некорректные данные регистрации.');
  const allowed = new Set(['email', 'login', 'password', 'role', 'name', 'companyName', 'consent']);
  if (Object.keys(input).some(key => !allowed.has(key))) throw new AuthError(400, 'Недопустимые поля регистрации.');
  if (input.consent !== true) throw new AuthError(400, 'Для регистрации необходимо согласие на обработку данных.');
  const selectedRole = role(input.role);
  const parsedLogin = normalizeLogin(input.login);
  const result = {
    email: normalizeEmail(input.email),
    login: parsedLogin.login,
    loginNormalized: parsedLogin.normalized,
    password: password(input.password),
    role: selectedRole,
    name: '',
    companyName: '',
  };
  if (selectedRole === 'candidate') {
    result.name = asText(input.name, 'имя', 100);
    if (input.companyName !== undefined && asText(input.companyName, 'название компании', 160, { required: false })) {
      throw new AuthError(400, 'Название компании можно указать при регистрации работодателя.');
    }
  } else {
    result.companyName = asText(input.companyName, 'название компании', 160);
    if (input.name !== undefined && asText(input.name, 'имя', 100, { required: false })) {
      throw new AuthError(400, 'Имя можно указать при регистрации соискателя.');
    }
  }
  return result;
}

function hash(value) { return createHash('sha256').update(value).digest('hex'); }

export async function hashPassword(value) {
  const salt = randomBytes(16);
  const derived = await scrypt(value, salt, 64, passwordParameters);
  return ['scrypt', passwordParameters.cost, passwordParameters.blockSize, passwordParameters.parallelization,
    salt.toString('base64url'), Buffer.from(derived).toString('base64url')].join('$');
}

export async function passwordMatches(value, stored) {
  if (typeof stored !== 'string') return false;
  const [algorithm, cost, blockSize, parallelization, saltText, digestText, ...extra] = stored.split('$');
  if (algorithm !== 'scrypt' || extra.length || !/^[1-9]\d*$/u.test(cost) || !/^[1-9]\d*$/u.test(blockSize)
    || !/^[1-9]\d*$/u.test(parallelization) || !saltText || !digestText) return false;
  const options = { cost: Number(cost), blockSize: Number(blockSize), parallelization: Number(parallelization), maxmem: 64 * 1024 * 1024 };
  if (options.cost > 32768 || options.blockSize > 16 || options.parallelization > 4) return false;
  let salt, expected;
  try {
    salt = Buffer.from(saltText, 'base64url'); expected = Buffer.from(digestText, 'base64url');
    if (!salt.length || !expected.length || salt.toString('base64url') !== saltText || expected.toString('base64url') !== digestText) return false;
  } catch { return false; }
  const derived = Buffer.from(await scrypt(value, salt, expected.length, options));
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

function accountPayload(row, canModerate = false) {
  return {
    id: row.id,
    canModerate,
    email: row.email,
    login: row.login,
    role: row.role,
    name: row.name || '',
    companyName: row.company_name || '',
  };
}

function timestamp(now) { return new Date(now()).toISOString(); }

export class AuthStore {
  constructor(path) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path, { timeout: 5000 });
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS auth_accounts (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        login TEXT NOT NULL,
        login_normalized TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL CHECK(role IN ('candidate','employer')),
        name TEXT NOT NULL,
        company_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        platform_owner TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS auth_moderator_grants (
        account_id TEXT PRIMARY KEY REFERENCES auth_accounts(id) ON DELETE CASCADE,
        granted_at TEXT NOT NULL, granted_by TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS auth_moderator_audit (
        id INTEGER PRIMARY KEY, account_id TEXT NOT NULL, action TEXT NOT NULL,
        actor TEXT NOT NULL, created_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS auth_pending_registrations (
        email TEXT PRIMARY KEY,
        login TEXT NOT NULL,
        login_normalized TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL CHECK(role IN ('candidate','employer')),
        name TEXT NOT NULL,
        company_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        platform_owner TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        code_expires_at TEXT NOT NULL,
        attempts INTEGER NOT NULL CHECK(attempts >= 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS auth_sessions (
        token_hash TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES auth_accounts(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS auth_sessions_account ON auth_sessions(account_id, expires_at);
      CREATE INDEX IF NOT EXISTS auth_sessions_expiry ON auth_sessions(expires_at);
    `);
  }

  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  savePending(registration) {
    return this.transaction(() => {
      this.db.prepare('DELETE FROM auth_pending_registrations WHERE code_expires_at<=?').run(registration.createdAt);
      const account = this.db.prepare('SELECT id FROM auth_accounts WHERE email=? OR login_normalized=?').get(registration.email, registration.loginNormalized);
      if (account) return { state: 'account_exists' };
      const pendingLogin = this.db.prepare('SELECT email FROM auth_pending_registrations WHERE login_normalized=? AND email<>?')
        .get(registration.loginNormalized, registration.email);
      if (pendingLogin) return { state: 'login_pending' };
      this.db.prepare(`INSERT INTO auth_pending_registrations
        (email,login,login_normalized,role,name,company_name,password_hash,platform_owner,code_hash,code_expires_at,attempts,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,0,?,?)
        ON CONFLICT(email) DO UPDATE SET login=excluded.login,login_normalized=excluded.login_normalized,role=excluded.role,
          name=excluded.name,company_name=excluded.company_name,password_hash=excluded.password_hash,platform_owner=excluded.platform_owner,
          code_hash=excluded.code_hash,code_expires_at=excluded.code_expires_at,attempts=0,updated_at=excluded.updated_at`)
        .run(registration.email, registration.login, registration.loginNormalized, registration.role, registration.name, registration.companyName,
          registration.passwordHash, registration.platformOwner, registration.codeHash, registration.expiresAt, registration.createdAt, registration.createdAt);
      return { state: 'saved' };
    });
  }

  verifyPending(email, codeHash, nowText) {
    return this.transaction(() => {
      const row = this.db.prepare('SELECT * FROM auth_pending_registrations WHERE email=?').get(email);
      if (!row) return { state: 'missing' };
      if (row.code_expires_at <= nowText) {
        this.db.prepare('DELETE FROM auth_pending_registrations WHERE email=?').run(email);
        return { state: 'expired' };
      }
      const supplied = Buffer.from(codeHash, 'hex');
      const expected = Buffer.from(row.code_hash, 'hex');
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
        const attempts = Number(row.attempts) + 1;
        if (attempts >= codeAttempts) this.db.prepare('DELETE FROM auth_pending_registrations WHERE email=?').run(email);
        else this.db.prepare('UPDATE auth_pending_registrations SET attempts=?,updated_at=? WHERE email=?').run(attempts, nowText, email);
        return { state: attempts >= codeAttempts ? 'locked' : 'invalid' };
      }
      const existing = this.db.prepare('SELECT id FROM auth_accounts WHERE email=? OR login_normalized=? OR platform_owner=?')
        .get(row.email, row.login_normalized, row.platform_owner);
      if (existing) return { state: 'account_exists' };
      const id = randomBytes(16).toString('hex');
      this.db.prepare(`INSERT INTO auth_accounts
        (id,email,login,login_normalized,role,name,company_name,password_hash,platform_owner,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id, row.email, row.login, row.login_normalized, row.role, row.name, row.company_name, row.password_hash,
          row.platform_owner, nowText, nowText);
      this.db.prepare('DELETE FROM auth_pending_registrations WHERE email=?').run(email);
      return { state: 'verified', account: this.db.prepare('SELECT * FROM auth_accounts WHERE id=?').get(id) };
    });
  }

  discardPending(email, codeHash, platformOwner) {
    this.db.prepare('DELETE FROM auth_pending_registrations WHERE email=? AND code_hash=? AND platform_owner=?')
      .run(email, codeHash, platformOwner);
  }

  accountByIdentifier(identifier) {
    return this.db.prepare('SELECT * FROM auth_accounts WHERE email=? OR login_normalized=?').get(identifier, identifier);
  }

  accountBySession(tokenHash, nowText) {
    const row = this.db.prepare(`SELECT a.* FROM auth_sessions s JOIN auth_accounts a ON a.id=s.account_id
      WHERE s.token_hash=? AND s.expires_at>?`).get(tokenHash, nowText);
    if (!row) this.db.prepare('DELETE FROM auth_sessions WHERE token_hash=? AND expires_at<=?').run(tokenHash, nowText);
    return row || null;
  }

  accountByPlatformOwner(platformOwner) {
    return this.db.prepare('SELECT * FROM auth_accounts WHERE platform_owner=?').get(platformOwner) || null;
  }

  createSession(accountId, tokenHash, createdAt, expiresAt) {
    this.db.prepare('DELETE FROM auth_sessions WHERE expires_at<=?').run(createdAt);
    this.db.prepare('INSERT INTO auth_sessions(token_hash,account_id,created_at,expires_at) VALUES (?,?,?,?)')
      .run(tokenHash, accountId, createdAt, expiresAt);
  }

  canModerate(accountId) { return Boolean(this.db.prepare('SELECT 1 FROM auth_moderator_grants WHERE account_id=?').get(accountId)); }
  setModerator(accountId, enabled, actor = 'local-operator', nowText = new Date().toISOString()) {
    if (!this.db.prepare('SELECT 1 FROM auth_accounts WHERE id=?').get(accountId)) throw new AuthError(404, 'Аккаунт не найден.');
    this.transaction(() => {
      if (enabled) this.db.prepare('INSERT INTO auth_moderator_grants VALUES(?,?,?) ON CONFLICT(account_id) DO NOTHING').run(accountId,nowText,actor);
      else this.db.prepare('DELETE FROM auth_moderator_grants WHERE account_id=?').run(accountId);
      this.db.prepare('INSERT INTO auth_moderator_audit(account_id,action,actor,created_at) VALUES(?,?,?,?)').run(accountId,enabled ? 'grant' : 'revoke',actor,nowText);
    });
  }
  revokeSession(tokenHash) { this.db.prepare('DELETE FROM auth_sessions WHERE token_hash=?').run(tokenHash); }

  close() { this.db.close(); }
}

function positiveInteger(value, fallback, minimum, maximum) {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function smtpConfig(env) {
  const rawMode = String(env.SMTP_TLS || '').trim().toLocaleLowerCase('en-US');
  const tls = ['implicit', 'starttls', 'none'].includes(rawMode) ? rawMode : (['1', 'true', 'yes'].includes(rawMode) ? 'starttls' : 'none');
  const host = String(env.SMTP_HOST || '').trim();
  const user = String(env.SMTP_USER || '').trim();
  const password = String(env.SMTP_PASSWORD || '');
  const from = String(env.SMTP_FROM || '').trim();
  const port = positiveInteger(env.SMTP_PORT, tls === 'implicit' ? 465 : 587, 1, 65535);
  const supplied = [host, user, password, from].some(Boolean);
  if (supplied && (!host || !user || !password || !from)) return { state: 'invalid' };
  const timeoutMs = positiveInteger(env.SMTP_TIMEOUT_MS, 15000, 1000, 60000);
  return supplied ? { state: 'ready', host, port, user, password, from, tls, timeoutMs } : { state: 'missing' };
}

function headerValue(value, name) {
  if (!value || /[\r\n]/u.test(value)) throw new Error(`Invalid ${name} header.`);
  return value;
}

function envelopeAddress(value) {
  const matched = /<([^<>]+)>\s*$/u.exec(value);
  const address = (matched?.[1] || value).trim();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u.test(address)) throw new Error('Invalid SMTP envelope address.');
  return address;
}

class SmtpReader {
  constructor(socket) {
    this.socket = socket;
    this.buffer = '';
    this.lines = [];
    this.waiter = null;
    this.error = null;
    this.onData = data => {
      this.buffer += data.toString('utf8');
      let marker;
      while ((marker = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, marker).replace(/\r$/u, '');
        this.buffer = this.buffer.slice(marker + 1);
        this.lines.push(line); this.wake();
      }
    };
    this.onError = error => { this.error = error; this.wake(); };
    this.onClose = () => { if (!this.error) this.error = new Error('SMTP connection closed.'); this.wake(); };
    socket.on('data', this.onData); socket.on('error', this.onError); socket.on('close', this.onClose);
  }

  wake() { if (this.waiter) { const wake = this.waiter; this.waiter = null; wake(); } }

  async line() {
    while (!this.lines.length) {
      if (this.error) throw this.error;
      await new Promise(resolve => { this.waiter = resolve; });
    }
    return this.lines.shift();
  }

  async response() {
    const lines = [];
    for (;;) {
      const line = await this.line(); lines.push(line);
      const matched = /^(\d{3})([ -])(.*)$/u.exec(line);
      if (!matched) throw new Error('Malformed SMTP response.');
      if (matched[2] === ' ') return { code: Number(matched[1]), lines };
    }
  }

  async command(value, accepted) {
    this.socket.write(value + '\r\n');
    const result = await this.response();
    if (!accepted.includes(result.code)) throw new Error(`SMTP rejected command (${result.code}).`);
    return result;
  }

  dispose() {
    this.socket.off('data', this.onData); this.socket.off('error', this.onError); this.socket.off('close', this.onClose);
  }
}

function openPlainSocket(host, port, onSocket) {
  return new Promise((resolveSocket, reject) => {
    const socket = connectSocket({ host, port });
    const fail = error => { socket.destroy(); reject(error); };
    socket.once('error', fail);
    onSocket(socket);
    socket.once('connect', () => { socket.off('error', fail); resolveSocket(socket); });
  });
}

function openTlsSocket(options, onSocket) {
  return new Promise((resolveSocket, reject) => {
    const socket = connectTls(options);
    const fail = error => { socket.destroy(); reject(error); };
    socket.once('error', fail);
    onSocket(socket);
    socket.once('secureConnect', () => { socket.off('error', fail); resolveSocket(socket); });
  });
}

async function upgradeToTls(socket, host, onSocket) {
  return openTlsSocket({ socket, servername: host }, onSocket);
}

async function sendSmtpMessage(config, recipient, code) {
  let socket;
  let reader;
  const timeout = setTimeout(() => socket?.destroy(new Error('SMTP request timed out.')), config.timeoutMs);
  const rememberSocket = value => { socket = value; };
  try {
    socket = config.tls === 'implicit' ? await openTlsSocket({ host: config.host, port: config.port, servername: config.host }, rememberSocket)
      : await openPlainSocket(config.host, config.port, rememberSocket);
    reader = new SmtpReader(socket);
    const greeting = await reader.response();
    if (greeting.code !== 220) throw new Error(`SMTP greeting failed (${greeting.code}).`);
    let hello = await reader.command('EHLO localhost', [250]);
    if (config.tls === 'starttls') {
      if (!hello.lines.some(line => /^250[ -]STARTTLS\b/iu.test(line))) throw new Error('SMTP server does not support STARTTLS.');
      await reader.command('STARTTLS', [220]);
      reader.dispose();
      socket = await upgradeToTls(socket, config.host, rememberSocket);
      reader = new SmtpReader(socket);
      hello = await reader.command('EHLO localhost', [250]);
    }
    const capabilities = hello.lines.join('\n');
    const encodedUser = Buffer.from(config.user, 'utf8').toString('base64');
    const encodedPassword = Buffer.from(config.password, 'utf8').toString('base64');
    if (/\bAUTH\b[^\n]*\bPLAIN\b/iu.test(capabilities)) {
      const credentials = Buffer.from(`\u0000${config.user}\u0000${config.password}`, 'utf8').toString('base64');
      await reader.command(`AUTH PLAIN ${credentials}`, [235]);
    } else if (/\bAUTH\b[^\n]*\bLOGIN\b/iu.test(capabilities)) {
      await reader.command('AUTH LOGIN', [334]);
      await reader.command(encodedUser, [334]);
      await reader.command(encodedPassword, [235]);
    } else throw new Error('SMTP server does not support a configured authentication method.');
    const from = headerValue(config.from, 'from');
    const envelopeFrom = envelopeAddress(from);
    await reader.command(`MAIL FROM:<${envelopeFrom}>`, [250]);
    await reader.command(`RCPT TO:<${envelopeAddress(recipient)}>`, [250, 251]);
    await reader.command('DATA', [354]);
    const subject = Buffer.from('Код подтверждения Предел', 'utf8').toString('base64');
    const text = `Ваш код подтверждения: ${code}\r\n\r\nОн действует ограниченное время. Если вы не регистрировались, проигнорируйте это письмо.`;
    const message = [
      `From: ${from}`,
      `To: ${headerValue(recipient, 'to')}`,
      `Subject: =?UTF-8?B?${subject}?=`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      text,
    ].join('\r\n').replace(/(^|\n)\./gu, '$1..');
    socket.write(message + '\r\n.\r\n');
    const delivered = await reader.response();
    if (delivered.code !== 250) throw new Error(`SMTP did not accept the message (${delivered.code}).`);
    await reader.command('QUIT', [221]);
  } finally {
    clearTimeout(timeout);
    reader?.dispose();
    socket?.destroy();
  }
}

export function createVerificationMailer({ env = process.env, logger = console, mailLogPath = developmentMailLog } = {}) {
  const config = smtpConfig(env);
  return async ({ email, code, expiresAt }) => {
    if (config.state === 'invalid') throw new AuthError(503, 'Почтовый сервис настроен не полностью. Попробуйте позже.');
    if (config.state === 'missing') {
      if ([env.APP_ENV, env.NODE_ENV].some(value => String(value || '').trim().toLowerCase() === 'production')) {
        throw new AuthError(503, 'Почтовый сервис временно недоступен. Попробуйте позже.');
      }
      if (mailLogPath === null) {
        logger.info(`Registration verification code for ${email}: ${code}`);
      } else {
        try {
          mkdirSync(dirname(mailLogPath), { recursive: true });
          appendFileSync(mailLogPath, JSON.stringify({ email, code, expiresAt }) + '\n', 'utf8');
        } catch {
          throw new AuthError(503, 'Не удалось сохранить локальное письмо. Попробуйте позже.');
        }
        logger.info('Local registration confirmation saved to server/data/mail.log.');
      }
      return { delivery: 'development' };
    }
    try { await sendSmtpMessage(config, email, code); return { delivery: 'email' }; }
    catch (error) {
      logger.error(`Could not send registration verification e-mail: ${error.message}`);
      throw new AuthError(503, 'Не удалось отправить код на e-mail. Попробуйте позже.');
    }
  };
}

export class AuthService {
  constructor(path, { now = Date.now, env = process.env, mailer = createVerificationMailer({ env }), codeTtlMinutes, sessionDays } = {}) {
    this.store = new AuthStore(path);
    this.now = now;
    this.mailer = mailer;
    this.codeTtlMs = 60000 * positiveInteger(codeTtlMinutes ?? env.AUTH_CODE_TTL_MINUTES, 10, 1, 60);
    this.sessionMs = 86400000 * positiveInteger(sessionDays ?? env.AUTH_SESSION_DAYS, 30, 1, 90);
  }

  async requestRegistration(input, platformOwner) {
    if (typeof platformOwner !== 'string' || !/^[a-f0-9]{64}$/u.test(platformOwner)) throw new AuthError(401, 'Сессия недоступна.');
    const registration = validateRegistration(input);
    const now = this.now();
    const code = String(randomInt(0, 1000000)).padStart(6, '0');
    const prepared = {
      ...registration,
      passwordHash: await hashPassword(registration.password),
      // A confirmed account starts with its own cabinet. Browser demo data must
      // never become another person's account after a shared-device signup.
      platformOwner: randomBytes(32).toString('hex'),
      codeHash: hash(code),
      createdAt: timestamp(() => now),
      expiresAt: new Date(now + this.codeTtlMs).toISOString(),
    };
    const saved = this.store.savePending(prepared);
    if (saved.state === 'account_exists') throw new AuthError(409, 'Этот e-mail или логин уже зарегистрирован.');
    if (saved.state === 'login_pending') throw new AuthError(409, 'Этот логин уже ожидает подтверждения.');
    let delivery;
    try {
      const sent = await this.mailer({ email: prepared.email, code, expiresAt: prepared.expiresAt });
      delivery = sent?.delivery === 'development' ? 'development' : 'email';
    } catch (error) {
      // A failed delivery must not reserve a login or keep unconfirmed credentials.
      // A newer request for this email may already have replaced this code.
      this.store.discardPending(prepared.email, prepared.codeHash, prepared.platformOwner);
      throw error;
    }
    return { email: prepared.email, expiresAt: prepared.expiresAt, delivery };
  }

  verifyRegistration(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['email', 'code'].includes(key))) {
      throw new AuthError(400, 'Некорректные данные подтверждения.');
    }
    const email = normalizeEmail(input.email);
    if (typeof input.code !== 'string' || !/^\d{6}$/u.test(input.code)) throw new AuthError(400, 'Введите шестизначный код.');
    const nowText = timestamp(this.now);
    const result = this.store.verifyPending(email, hash(input.code), nowText);
    if (result.state === 'verified') return result.account;
    if (result.state === 'missing' || result.state === 'expired') throw new AuthError(400, 'Код истёк. Запросите новый.');
    if (result.state === 'locked') throw new AuthError(429, 'Слишком много неверных попыток. Запросите новый код.');
    if (result.state === 'account_exists') throw new AuthError(409, 'Этот e-mail или логин уже зарегистрирован.');
    throw new AuthError(400, 'Неверный код.');
  }

  async login(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new AuthError(400, 'Некорректные данные входа.');
    const allowed = new Set(['loginOrEmail', 'login', 'email', 'password']);
    if (Object.keys(input).some(key => !allowed.has(key))) throw new AuthError(400, 'Недопустимые поля входа.');
    const candidates = [input.loginOrEmail, input.login, input.email].filter(value => value !== undefined);
    if (candidates.length !== 1 || typeof candidates[0] !== 'string') throw new AuthError(400, 'Укажите логин или e-mail.');
    const supplied = candidates[0].normalize('NFKC').trim();
    if (!supplied || supplied.length > 254) throw new AuthError(400, 'Укажите логин или e-mail.');
    const identifier = supplied.includes('@') ? supplied.toLocaleLowerCase('en-US') : supplied.toLocaleLowerCase('ru-RU');
    const suppliedPassword = password(input.password);
    const account = this.store.accountByIdentifier(identifier);
    if (!account || !(await passwordMatches(suppliedPassword, account.password_hash))) {
      throw new AuthError(401, 'Неверный логин, e-mail или пароль.');
    }
    return account;
  }

  createSession(account) {
    const raw = randomBytes(32).toString('hex');
    const now = this.now();
    this.store.createSession(account.id, hash(raw), timestamp(() => now), new Date(now + this.sessionMs).toISOString());
    return { token: raw, maxAge: Math.floor(this.sessionMs / 1000), account: accountPayload(account, this.store.canModerate(account.id)) };
  }

  accountForToken(token) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/u.test(token)) return null;
    const account = this.store.accountBySession(hash(token), timestamp(this.now));
    return account ? { account: accountPayload(account, this.store.canModerate(account.id)), platformOwner: account.platform_owner } : null;
  }

  accountForPlatformOwner(platformOwner) {
    const account = this.store.accountByPlatformOwner(platformOwner);
    return account ? accountPayload(account, this.store.canModerate(account.id)) : null;
  }

  revokeToken(token) {
    if (typeof token === 'string' && /^[a-f0-9]{64}$/u.test(token)) this.store.revokeSession(hash(token));
  }

  close() { this.store.close(); }
}
