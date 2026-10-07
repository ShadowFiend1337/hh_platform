import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';

export const textHash = text => createHash('sha256').update(text).digest('hex');
export const PROFILE_INDEX_POLICY = 'profile-sections-max-v2';
const MAX_SEGMENTS = 8;
const MAX_SEGMENT_CHARACTERS = 4000;
const MAX_PROFILE_CHARACTERS = 12000;
const lower = value => value.normalize('NFKC').toLocaleLowerCase('ru');
const scrub = text => String(text || '').replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/gu, '[контакт скрыт]')
  .replace(/(?:\+?\d[\d ()-]{8,}\d)/gu, value => {
    const digits = value.replace(/\D/gu, '').length;
    return digits >= 10 && digits <= 15 ? '[контакт скрыт]' : value;
  });

const syntheticMetadataLine = /^(?:Демонстрационный профиль:|Демонстрационные данные:|Результат демонстрационного проекта:)/u;
function professionalContent(person, value, history = false) {
  const text = String(value || '');
  if (person.synthetic !== true) return text;
  let lines = text.split(/\r?\n/u);
  if (history) {
    const suffix = lines.findIndex((line, index) => index > 0 && syntheticMetadataLine.test(line.trimStart()));
    if (suffix >= 0) lines = lines.slice(0, suffix);
  }
  // These known seed-factory lines declare provenance, not candidate evidence.
  // Preserve the public explanation and all real-profile contents unchanged.
  return lines.filter(line => !syntheticMetadataLine.test(line.trimStart())).join('\n');
}

export function semanticSegments(person, { includeIdentity = true } = {}) {
  const result = [], seen = new Set();
  let remaining = MAX_PROFILE_CHARACTERS;
  const identity = [person.professionalRole, (person.stack || []).join(', ')].filter(Boolean).join('\n');
  const fields = [['bio', person.bio], ['workHistory', person.workHistory],
    ['careerAchievements', person.careerAchievements], ['education', person.education]];
  if (includeIdentity) fields.push(['identity', identity]);
  for (const [field, value] of fields) {
    if (!value || !remaining || result.length >= MAX_SEGMENTS) continue;
    const bounded = scrub(professionalContent(person, value, field === 'workHistory')).trim().slice(0, MAX_SEGMENT_CHARACTERS).trim();
    if (!bounded || seen.has(bounded)) continue;
    const text = bounded.slice(0, remaining).trim();
    if (!text || seen.has(text)) continue;
    seen.add(bounded); seen.add(text); result.push(text); remaining -= text.length;
  }
  return result;
}

export function semanticDocument(person) {
  return JSON.stringify(semanticSegments(person));
}

export function parseSemanticSegments(document) {
  const segments = JSON.parse(document);
  if (!Array.isArray(segments) || segments.length > MAX_SEGMENTS
    || segments.some(text => typeof text !== 'string' || !text.trim() || text.length > MAX_SEGMENT_CHARACTERS)
    || segments.reduce((length, text) => length + text.length, 0) > MAX_PROFILE_CHARACTERS) {
    throw new Error('Некорректные профессиональные секции профиля.');
  }
  return segments;
}

export function publicCandidate(person, id = person.id) {
  const allowed = ['name', 'specialization', 'desiredGrade', 'confirmed', 'gradeChangedAt', 'stack', 'industry', 'professionalRole',
    'surveyCompletedAt', 'experience', 'city', 'format', 'bio', 'careerAchievements', 'education', 'workHistory',
    'portfolio', 'languages', 'achievements', 'visible', 'consent', 'salaryFrom', 'salaryTo', 'experienceMonths',
    'employmentType', 'availableFrom', 'languageCodes', 'synthetic'];
  const output = Object.fromEntries(allowed.filter(key => Object.hasOwn(person, key)).map(key => [key, person[key]]));
  for (const key of ['name', 'professionalRole', 'experience', 'bio', 'careerAchievements', 'education', 'workHistory', 'languages']) {
    if (output[key]) output[key] = scrub(output[key]);
  }
  if (Array.isArray(output.stack)) output.stack = output.stack.map(scrub);
  return { ...output, id, email: '', phone: '', fspId: '', softSkills: [] };
}

export class DirectoryStore {
  constructor(path, seeds = []) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path, { timeout: 5000 });
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS directory_candidates (
        id TEXT PRIMARY KEY, owner TEXT UNIQUE, synthetic INTEGER NOT NULL,
        visible INTEGER NOT NULL, consent INTEGER NOT NULL, eligible INTEGER NOT NULL,
        specialization TEXT NOT NULL, grade TEXT NOT NULL, score INTEGER NOT NULL,
        city TEXT NOT NULL, industry TEXT NOT NULL, format TEXT NOT NULL,
        salary_from INTEGER, salary_to INTEGER, experience_months INTEGER,
        employment_type TEXT NOT NULL, has_portfolio INTEGER NOT NULL, fsp INTEGER NOT NULL,
        public_payload TEXT NOT NULL, document TEXT NOT NULL, document_hash TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS directory_category ON directory_candidates(eligible, visible, consent, specialization, grade, score DESC);
      CREATE INDEX IF NOT EXISTS directory_salary ON directory_candidates(salary_from);
      CREATE INDEX IF NOT EXISTS directory_city ON directory_candidates(city, format);
      CREATE INDEX IF NOT EXISTS directory_experience ON directory_candidates(experience_months);
      CREATE TABLE IF NOT EXISTS directory_skills (
        candidate_id TEXT NOT NULL REFERENCES directory_candidates(id) ON DELETE CASCADE, skill TEXT NOT NULL,
        PRIMARY KEY(candidate_id, skill)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS directory_skill_value ON directory_skills(skill, candidate_id);
      CREATE TABLE IF NOT EXISTS directory_languages (
        candidate_id TEXT NOT NULL REFERENCES directory_candidates(id) ON DELETE CASCADE, language TEXT NOT NULL,
        PRIMARY KEY(candidate_id, language)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS directory_language_value ON directory_languages(language, candidate_id);
      CREATE TABLE IF NOT EXISTS directory_vectors (
        candidate_id TEXT PRIMARY KEY REFERENCES directory_candidates(id) ON DELETE CASCADE,
        model_version TEXT NOT NULL, document_hash TEXT NOT NULL, dimension INTEGER NOT NULL, vector BLOB NOT NULL,
        CHECK(length(vector) = dimension * 4)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS platform_accounts (
        owner TEXT PRIMARY KEY, public_id TEXT NOT NULL UNIQUE, revision INTEGER NOT NULL,
        profile TEXT NOT NULL, company TEXT NOT NULL, updated_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS platform_surveys (
        owner TEXT NOT NULL REFERENCES platform_accounts(owner) ON DELETE CASCADE, id TEXT NOT NULL,
        created_at TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(owner,id)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS platform_searches (
        owner TEXT NOT NULL REFERENCES platform_accounts(owner) ON DELETE CASCADE, id TEXT NOT NULL,
        position INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(owner,id)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS platform_candidate_decisions (
        owner TEXT NOT NULL REFERENCES platform_accounts(owner) ON DELETE CASCADE,
        candidate_id TEXT NOT NULL REFERENCES directory_candidates(id) ON DELETE CASCADE,
        decision TEXT NOT NULL CHECK(decision IN ('liked','passed')), created_at TEXT NOT NULL,
        PRIMARY KEY(owner,candidate_id)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS platform_decision_candidate ON platform_candidate_decisions(candidate_id);
      CREATE TABLE IF NOT EXISTS platform_invitations (
        id TEXT PRIMARY KEY, sender TEXT NOT NULL REFERENCES platform_accounts(owner),
        candidate_id TEXT NOT NULL REFERENCES directory_candidates(id), status TEXT NOT NULL,
        created_at TEXT NOT NULL, payload TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS platform_invitation_sender ON platform_invitations(sender, created_at);
      CREATE INDEX IF NOT EXISTS platform_invitation_recipient ON platform_invitations(candidate_id, status);
    `);
    this.transaction(() => {
      for (const person of seeds) this.upsert(person, null, true);
      // Older stored profiles used one concatenated text. Rebuild from their
      // scrubbed professional fields so reopening also adopts section indexing.
      const update = this.db.prepare('UPDATE directory_candidates SET public_payload=?,document=?,document_hash=? WHERE id=?');
      for (const row of this.db.prepare('SELECT id,public_payload,document FROM directory_candidates').all()) {
        const person = publicCandidate(JSON.parse(row.public_payload), row.id);
        const payload = JSON.stringify(person), document = semanticDocument(person);
        if (document !== row.document || payload !== row.public_payload) update.run(payload, document, textHash(document), row.id);
        this.replaceSkills(row.id, person.stack || []);
      }
    });
  }

  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const output = fn(); this.db.exec('COMMIT'); return output; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  upsert(person, owner, eligible) {
    const document = semanticDocument(person);
    const payload = publicCandidate(person);
    this.db.prepare(`INSERT INTO directory_candidates VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET owner=excluded.owner, synthetic=excluded.synthetic, visible=excluded.visible,
      consent=excluded.consent, eligible=excluded.eligible, specialization=excluded.specialization, grade=excluded.grade,
      score=excluded.score, city=excluded.city, industry=excluded.industry, format=excluded.format,
      salary_from=excluded.salary_from, salary_to=excluded.salary_to, experience_months=excluded.experience_months,
      employment_type=excluded.employment_type, has_portfolio=excluded.has_portfolio, fsp=excluded.fsp,
      public_payload=excluded.public_payload, document=excluded.document, document_hash=excluded.document_hash`)
      .run(person.id, owner, Number(person.synthetic === true), Number(person.visible === true), Number(person.consent === true), Number(eligible),
        person.confirmed?.specialization || person.specialization || '', person.confirmed?.grade || '', person.confirmed?.score || 0,
        person.city || '', person.industry || '', person.format || '', person.salaryFrom ?? null, person.salaryTo ?? null, person.experienceMonths ?? null,
        person.employmentType || '', Number(Boolean(person.portfolio)), Number((person.achievements || []).length > 0), JSON.stringify(payload), document, textHash(document));
    this.replaceSkills(person.id, payload.stack || []);
    this.db.prepare('DELETE FROM directory_languages WHERE candidate_id=?').run(person.id);
    for (const language of new Set(person.languageCodes || [])) this.db.prepare('INSERT INTO directory_languages VALUES (?,?)').run(person.id, language);
  }

  replaceSkills(id, skills) {
    this.db.prepare('DELETE FROM directory_skills WHERE candidate_id=?').run(id);
    for (const skill of new Set(skills.map(lower))) this.db.prepare('INSERT INTO directory_skills VALUES (?,?)').run(id, skill);
  }

  matching(filters, queryConstraints = {}) {
    const conditions = ['eligible=1', 'visible=1', 'consent=1'];
    const args = [];
    for (const [key, column] of [['specialization','specialization'],['grade','grade'],['city','city'],['industry','industry'],['format','format'],['employmentType','employment_type']]) {
      if (filters[key]) { conditions.push(`${column}=?`); args.push(filters[key]); }
    }
    for (const [key, column, comparison] of [['salaryMax','salary_from','<='],['experienceMin','experience_months','>='],['experienceMax','experience_months','<='],['minScore','score','>=']]) {
      if (filters[key] !== null) { conditions.push(`${column}${comparison}?`); args.push(filters[key]); }
    }
    if (filters.fsp) conditions.push('fsp=1');
    if (filters.hasPortfolio) conditions.push('has_portfolio=1');
    for (const skill of filters.stack) {
      conditions.push('EXISTS(SELECT 1 FROM directory_skills s WHERE s.candidate_id=directory_candidates.id AND s.skill=?)'); args.push(lower(skill));
    }
    if (filters.language) { conditions.push('EXISTS(SELECT 1 FROM directory_languages l WHERE l.candidate_id=directory_candidates.id AND l.language=?)'); args.push(filters.language); }
    // Parsed alternatives and exclusions are private constraints, independent of UI equality filters.
    const columns = { specialization: 'specialization', grade: 'grade', format: 'format', city: 'city' };
    for (const [kind, values] of Object.entries(queryConstraints)) {
      if (!['any', 'exclude', 'all'].includes(kind) || !values || typeof values !== 'object') continue;
      for (const [key, entries] of Object.entries(values)) {
        if (!Array.isArray(entries) || !entries.length) continue;
        const items = [...new Set(entries.filter(value => typeof value === 'string' && value.length > 0))];
        if (!items.length) continue;
        const placeholders = items.map(() => '?').join(',');
        if (Object.hasOwn(columns, key)) {
          conditions.push(`${columns[key]} ${kind === 'exclude' ? 'NOT IN' : 'IN'} (${placeholders})`);
          args.push(...items);
        } else if (key === 'stack' || key === 'language') {
          const table = key === 'stack' ? 'directory_skills' : 'directory_languages';
          const column = key === 'stack' ? 'skill' : 'language';
          if (kind === 'all') {
            for (const value of items) {
              conditions.push(`EXISTS(SELECT 1 FROM ${table} c WHERE c.candidate_id=directory_candidates.id AND c.${column}=?)`);
              args.push(key === 'stack' ? lower(value) : value);
            }
            continue;
          }
          conditions.push(`${kind === 'exclude' ? 'NOT ' : ''}EXISTS(SELECT 1 FROM ${table} c WHERE c.candidate_id=directory_candidates.id AND c.${column} IN (${placeholders}))`);
          args.push(...(key === 'stack' ? items.map(lower) : items));
        }
      }
    }
    for (const [key, groups] of Object.entries(queryConstraints.groups || {})) {
      if (!['stack', 'language'].includes(key) || !Array.isArray(groups)) continue;
      const table = key === 'stack' ? 'directory_skills' : 'directory_languages';
      const column = key === 'stack' ? 'skill' : 'language';
      for (const group of groups) {
        if (!Array.isArray(group)) continue;
        const items = [...new Set(group.filter(value => typeof value === 'string' && value.length > 0))];
        if (!items.length) continue;
        conditions.push(`EXISTS(SELECT 1 FROM ${table} c WHERE c.candidate_id=directory_candidates.id AND c.${column} IN (${items.map(() => '?').join(',')}))`);
        args.push(...(key === 'stack' ? items.map(lower) : items));
      }
    }
    return this.db.prepare(`SELECT * FROM directory_candidates WHERE ${conditions.join(' AND ')} ORDER BY score DESC,fsp DESC,id`).all(...args);
  }

  get(id) { return this.db.prepare('SELECT * FROM directory_candidates WHERE id=?').get(id); }
  forOwner(owner) { return this.db.prepare('SELECT * FROM directory_candidates WHERE owner=?').get(owner); }
  all() { return this.db.prepare('SELECT * FROM directory_candidates WHERE eligible=1 AND visible=1 AND consent=1 ORDER BY id').all(); }
  vectors() { return new Map(this.db.prepare('SELECT * FROM directory_vectors').all().map(row => [row.candidate_id, row])); }
  putVector(row, modelVersion, vector) {
    if (!Array.isArray(vector) || vector.some(number => !Number.isFinite(number) || !Number.isFinite(Math.fround(number)))) throw new Error('Некорректные векторы секций профиля.');
    const bytes = Buffer.alloc(vector.length * 4);
    vector.forEach((number, index) => bytes.writeFloatLE(number, index * 4));
    this.db.prepare(`INSERT INTO directory_vectors VALUES(?,?,?,?,?) ON CONFLICT(candidate_id) DO UPDATE SET
      model_version=excluded.model_version,document_hash=excluded.document_hash,dimension=excluded.dimension,vector=excluded.vector`)
      .run(row.id, modelVersion, row.document_hash, vector.length, bytes);
  }
  options() {
    const unique = column => this.db.prepare(`SELECT DISTINCT ${column} AS value FROM directory_candidates WHERE eligible=1 AND visible=1 AND consent=1 AND ${column}<>'' ORDER BY ${column}`).all().map(row => row.value);
    return { cities: unique('city'), industries: unique('industry') };
  }
  close() { this.db.close(); }
}

export function semanticMatch(vector, blob) {
  if (!Array.isArray(vector) || !vector.length || vector.some(number => !Number.isFinite(number))
    || !ArrayBuffer.isView(blob) || !blob.byteLength || blob.byteLength % (vector.length * 4)) return null;
  const bytes = Buffer.from(blob.buffer, blob.byteOffset, blob.byteLength);
  let best = null;
  for (let offset = 0, segment = 0; offset < bytes.byteLength; offset += vector.length * 4, segment++) {
    let score = 0;
    for (let index = 0; index < vector.length; index++) score += vector[index] * bytes.readFloatLE(offset + index * 4);
    if (!Number.isFinite(score)) return null;
    if (!best || score > best.score) best = { score, index: segment };
  }
  return best;
}

export function cosine(vector, blob) {
  return semanticMatch(vector, blob)?.score ?? null;
}
