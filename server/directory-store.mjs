import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';

export const textHash = text => createHash('sha256').update(text).digest('hex');
const lower = value => value.normalize('NFKC').toLocaleLowerCase('ru');
const scrub = text => String(text || '').replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/gu, '[контакт скрыт]')
  .replace(/(?:\+?\d[\d ()-]{8,}\d)/gu, '[контакт скрыт]');

export function semanticDocument(person) {
  return [person.professionalRole, person.bio, (person.stack || []).join(', '), person.workHistory]
    .filter(Boolean).map(scrub).join('\n').slice(0, 7000);
}

export function publicCandidate(person, id = person.id) {
  const allowed = ['name', 'specialization', 'desiredGrade', 'confirmed', 'gradeChangedAt', 'stack', 'industry', 'professionalRole',
    'surveyCompletedAt', 'experience', 'city', 'format', 'bio', 'careerAchievements', 'education', 'workHistory',
    'portfolio', 'languages', 'achievements', 'visible', 'consent', 'salaryFrom', 'salaryTo', 'experienceMonths',
    'employmentType', 'availableFrom', 'languageCodes', 'synthetic'];
  const output = Object.fromEntries(allowed.filter(key => Object.hasOwn(person, key)).map(key => [key, person[key]]));
  for (const key of ['bio', 'careerAchievements', 'education', 'workHistory', 'languages']) if (output[key]) output[key] = scrub(output[key]);
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
      CREATE TABLE IF NOT EXISTS platform_invitations (
        id TEXT PRIMARY KEY, sender TEXT NOT NULL REFERENCES platform_accounts(owner),
        candidate_id TEXT NOT NULL REFERENCES directory_candidates(id), status TEXT NOT NULL,
        created_at TEXT NOT NULL, payload TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS platform_invitation_sender ON platform_invitations(sender, created_at);
      CREATE INDEX IF NOT EXISTS platform_invitation_recipient ON platform_invitations(candidate_id, status);
    `);
    this.transaction(() => { for (const person of seeds) this.upsert(person, null, true); });
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
    this.db.prepare('DELETE FROM directory_skills WHERE candidate_id=?').run(person.id);
    this.db.prepare('DELETE FROM directory_languages WHERE candidate_id=?').run(person.id);
    for (const skill of new Set((person.stack || []).map(lower))) this.db.prepare('INSERT INTO directory_skills VALUES (?,?)').run(person.id, skill);
    for (const language of new Set(person.languageCodes || [])) this.db.prepare('INSERT INTO directory_languages VALUES (?,?)').run(person.id, language);
  }

  matching(filters) {
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
    return this.db.prepare(`SELECT * FROM directory_candidates WHERE ${conditions.join(' AND ')} ORDER BY score DESC,fsp DESC,id`).all(...args);
  }

  get(id) { return this.db.prepare('SELECT * FROM directory_candidates WHERE id=?').get(id); }
  forOwner(owner) { return this.db.prepare('SELECT * FROM directory_candidates WHERE owner=?').get(owner); }
  all() { return this.db.prepare('SELECT * FROM directory_candidates WHERE eligible=1 AND visible=1 AND consent=1 ORDER BY id').all(); }
  vectors() { return new Map(this.db.prepare('SELECT * FROM directory_vectors').all().map(row => [row.candidate_id, row])); }
  putVector(row, modelVersion, vector) {
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

export function cosine(vector, blob) {
  const bytes = Buffer.from(blob.buffer, blob.byteOffset, blob.byteLength);
  let result = 0;
  for (let index = 0; index < vector.length; index++) result += vector[index] * bytes.readFloatLE(index * 4);
  return result;
}
