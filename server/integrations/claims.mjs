import { createHash, randomUUID } from 'node:crypto';
import { RequestError } from '../assessment.mjs';
import { evaluateClaim, normalizedName } from './claim-checks.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
const iso = now => new Date(now()).toISOString();
const validDays = 90;
const allowedStatuses = ['pending','needs_info','approved','rejected','withdrawn','revoked'];
function strict(input, fields) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !fields.includes(key))) throw new RequestError(400,'Недопустимые поля запроса.');
}
function text(value, min, max, label) {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) throw new RequestError(400,`Некорректное поле: ${label}.`);
  return value.trim();
}
function materials(input, previousDocument = null) {
  const statement = text(input.statement,20,3000,'описание участия');
  if (!Array.isArray(input.links) || input.links.length > 5) throw new RequestError(400,'Допустимо до пяти ссылок.');
  const links = input.links.map(value => {
    try { const url = new URL(text(value,8,1000,'ссылка')); if (url.protocol !== 'https:' || url.username || url.password) throw new Error(); return url.href; }
    catch { throw new RequestError(400,'Ссылка должна быть HTTPS без логина и пароля.'); }
  });
  if (input.retainDocument !== undefined && typeof input.retainDocument !== 'boolean') throw new RequestError(400,'Некорректное сохранение файла.');
  if (input.retainDocument && (input.document != null || !previousDocument)) throw new RequestError(400,'Сохранение предыдущего файла недоступно.');
  let document = input.retainDocument ? previousDocument : null;
  if (input.document != null) {
    strict(input.document,['name','mediaType','dataBase64']);
    const name = text(input.document.name,1,100,'имя файла').replace(/[\\/\r\n]/gu,'_');
    const {mediaType,dataBase64} = input.document;
    if (typeof dataBase64 !== 'string' || dataBase64.length > 2_800_000 || !/^[A-Za-z\d+/]*={0,2}$/u.test(dataBase64)) throw new RequestError(400,'Некорректный файл.');
    const bytes = Buffer.from(dataBase64,'base64');
    if (!bytes.length || bytes.length > 2_000_000 || bytes.toString('base64') !== dataBase64) throw new RequestError(413,'Файл должен быть не более 2 МБ.');
    const isPdf = bytes.subarray(0,5).equals(Buffer.from('%PDF-'));
    const isPng = bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const isJpeg = bytes[0]===255 && bytes[1]===216 && bytes[2]===255;
    if (!(mediaType==='application/pdf' && isPdf || mediaType==='image/png' && isPng || mediaType==='image/jpeg' && isJpeg)) throw new RequestError(415,'Допустимы PDF, PNG и JPEG; содержимое должно соответствовать формату.');
    document = {name,mediaType,dataBase64,sha256:hash(bytes),size:bytes.length};
  }
  if (!document && links.length===0) throw new RequestError(400,'Приложите файл или ссылку на подтверждающие материалы.');
  return {statement,links,document};
}
export class AchievementClaims {
  constructor(integrations) {
    this.integrations = integrations; this.db = integrations.db; this.store = integrations.store; this.now = integrations.now;
    this.db.exec(`CREATE TABLE IF NOT EXISTS achievement_claims (
      id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES platform_accounts(owner) ON DELETE CASCADE,
      record_id TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','needs_info','approved','rejected','withdrawn','revoked')),
      version INTEGER NOT NULL, snapshot TEXT NOT NULL, candidate_name TEXT NOT NULL, materials TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, reviewed_at TEXT, valid_until TEXT, decision_note TEXT,
      verification_method TEXT, verification_reference TEXT, approved_profile_name TEXT,
      UNIQUE(owner,record_id)
    ) STRICT;
    CREATE UNIQUE INDEX IF NOT EXISTS achievement_one_owner ON achievement_claims(record_id) WHERE status='approved';
    CREATE INDEX IF NOT EXISTS achievement_queue ON achievement_claims(status,updated_at);
    CREATE TABLE IF NOT EXISTS achievement_claim_audit (
      id INTEGER PRIMARY KEY, claim_id TEXT NOT NULL REFERENCES achievement_claims(id) ON DELETE CASCADE,
      actor_id TEXT NOT NULL, action TEXT NOT NULL, version INTEGER NOT NULL, created_at TEXT NOT NULL, detail TEXT NOT NULL
    ) STRICT;`);
  }
  profile(owner) {
    const row = this.db.prepare('SELECT profile FROM platform_accounts WHERE owner=?').get(owner);
    return row ? JSON.parse(row.profile) : null;
  }
  get(id, owner) {
    const row = this.db.prepare('SELECT * FROM achievement_claims WHERE id=?' + (owner ? ' AND owner=?' : '')).get(...(owner ? [id,owner] : [id]));
    if (!row) throw new RequestError(404,'Заявка не найдена.'); return row;
  }
  current(row) {
    try {
      const current=this.integrations.publicCatalog.get(row.record_id), checked=this.integrations.publicSourceChecks?.status(current);
      if(checked==='unavailable') return {current:null,catalogUnavailable:true};
      if(checked==='missing') return {current:null};
      if(checked==='changed') return {current:{...current,documentHash:'changed:'+current.documentHash}};
      return {current};
    }
    catch(error) { return {current:null,catalogUnavailable:error.status!==404}; }
  }
  checks(row, support = null) {
    const source = this.current(row);
    const duplicate = this.db.prepare("SELECT 1 FROM achievement_claims WHERE record_id=? AND status='approved' AND id<>?").get(row.record_id,row.id);
    return evaluateClaim({snapshot:JSON.parse(row.snapshot),...source,candidateName:this.profile(row.owner)?.name,
      duplicateApproved:Boolean(duplicate),documentProvided:support ? Boolean(support.document || support.links.length) : true});
  }
  active(row) {
    return this.integrations.claimsEncryptionConfigured && row.status==='approved' && Date.parse(row.valid_until)>this.now() && this.profile(row.owner)?.consent === true
      && normalizedName(this.profile(row.owner)?.name) === normalizedName(row.approved_profile_name) && this.checks(row).sourceStatus==='matched';
  }
  audit(row,actor,action,detail = {}) {
    this.db.prepare('INSERT INTO achievement_claim_audit(claim_id,actor_id,action,version,created_at,detail) VALUES(?,?,?,?,?,?)')
      .run(row.id,actor,action,row.version,iso(this.now),this.integrations.seal(detail));
  }
  view(row, { moderator = false } = {}) {
    const support = this.integrations.unseal(row.materials), checks = this.checks(row,support);
    const view = {id:row.id,recordId:row.record_id,status:row.status,version:row.version,candidateName:row.candidate_name,
      record:JSON.parse(row.snapshot),statement:support.statement,links:support.links,
      document:support.document ? {name:support.document.name,mediaType:support.document.mediaType,size:support.document.size,sha256:support.document.sha256} : null,
      createdAt:row.created_at,updatedAt:row.updated_at,reviewedAt:row.reviewed_at,validUntil:row.valid_until,
      decisionNote:row.decision_note,verificationMethod:row.verification_method,active:this.active(row),checks,sourceCheck:this.integrations.publicSourceChecks?.view(JSON.parse(row.snapshot).sourceId) || null};
    if (moderator) { view.currentCandidateName=this.profile(row.owner)?.name || ''; view.verificationReference=row.verification_reference ? this.integrations.unseal(row.verification_reference).value : null;
      view.audit=this.db.prepare('SELECT * FROM achievement_claim_audit WHERE claim_id=? ORDER BY id').all(row.id)
        .map(event=>({id:event.id,actorId:event.actor_id,action:event.action,version:event.version,createdAt:event.created_at,detail:this.integrations.unseal(event.detail)})); }
    return view;
  }
  list(owner) { return {claims:this.db.prepare('SELECT * FROM achievement_claims WHERE owner=? ORDER BY updated_at DESC,id').all(owner).map(row=>this.view(row))}; }
  requireStorage() { if (!this.integrations.claimsEncryptionConfigured) throw new RequestError(503,'Для хранения материалов в production настройте INTEGRATION_ENCRYPTION_KEY.'); }
  submit(owner, actor, input) {
    this.requireStorage();
    this.integrations.requireConsent(owner);
    strict(input,['recordId','consent','statement','links','document']);
    if(input.consent!==true || typeof input.recordId!=='string' || !/^[a-f\d]{64}$/u.test(input.recordId)) throw new RequestError(400,'Нужно согласие на проверку принадлежности результата.');
    const record=this.integrations.publicCatalog.get(input.recordId), support=materials(input);
    return this.store.transaction(()=>{
      if(this.db.prepare('SELECT 1 FROM achievement_claims WHERE owner=? AND record_id=?').get(owner,input.recordId)) throw new RequestError(409,'Заявка на этот результат уже существует.');
      if(this.db.prepare("SELECT COUNT(*) AS n FROM achievement_claims WHERE owner=? AND status IN ('pending','needs_info')").get(owner).n>=20) throw new RequestError(409,'Одновременно допустимо до 20 незавершённых заявок.');
      const id=randomUUID(), at=iso(this.now);
      this.db.prepare(`INSERT INTO achievement_claims(id,owner,record_id,status,version,snapshot,candidate_name,materials,created_at,updated_at)
        VALUES(?,?,?,'pending',1,?,?,?,?,?)`).run(id,owner,input.recordId,JSON.stringify(record),this.profile(owner).name,this.integrations.seal(support),at,at);
      const row=this.get(id,owner);this.audit(row,actor,'submitted');return this.view(row);
    });
  }
  version(row,value) { if(!Number.isSafeInteger(value) || value!==row.version) throw new RequestError(409,'Заявка изменена. Обновите данные перед действием.'); }
  revise(owner,actor,id,input) {
    this.requireStorage();
    this.integrations.requireConsent(owner); strict(input,['version','consent','statement','links','document','retainDocument']);
    if(input.consent!==true) throw new RequestError(400,'Нужно согласие на проверку.');
    return this.store.transaction(()=>{
      const row=this.get(id,owner);this.version(row,input.version);
      const support=materials(input, this.integrations.unseal(row.materials).document);
      if(!['pending','needs_info','rejected','withdrawn','revoked'].includes(row.status)) throw new RequestError(409,'Одобренную заявку сначала отзовите.');
      if (this.db.prepare("SELECT COUNT(*) AS n FROM achievement_claims WHERE owner=? AND status IN ('pending','needs_info') AND id<>?").get(owner,id).n>=20) throw new RequestError(409,'Одновременно допустимо до 20 незавершённых заявок.');
      const record=this.integrations.publicCatalog.get(row.record_id);
      this.db.prepare(`UPDATE achievement_claims SET status='pending',version=version+1,snapshot=?,candidate_name=?,materials=?,updated_at=?,
        reviewed_at=NULL,valid_until=NULL,decision_note=NULL,verification_method=NULL,verification_reference=NULL,approved_profile_name=NULL WHERE id=?`)
        .run(JSON.stringify(record),this.profile(owner).name,this.integrations.seal(support),iso(this.now),id);
      const next=this.get(id,owner);this.audit(next,actor,'resubmitted');this.integrations.reindex(owner);return this.view(next);
    });
  }
  withdraw(owner,actor,id,input) {
    strict(input,['version']);
    return this.store.transaction(()=>{
      const row=this.get(id,owner);this.version(row,input.version);
      this.db.prepare("UPDATE achievement_claims SET status='withdrawn',version=version+1,valid_until=NULL,updated_at=? WHERE id=?").run(iso(this.now),id);
      const next=this.get(id,owner);this.audit(next,actor,'withdrawn');this.integrations.reindex(owner);return this.view(next);
    });
  }
  queue(status='pending',limit='20',offset='0') {
    if(!allowedStatuses.includes(status) || !/^\d{1,2}$/u.test(String(limit)) || +limit<1 || +limit>50 || !/^\d{1,6}$/u.test(String(offset))) throw new RequestError(400,'Некорректные параметры очереди.');
    return {total:this.db.prepare('SELECT COUNT(*) AS n FROM achievement_claims WHERE status=?').get(status).n,
      limit:+limit,offset:+offset,claims:this.db.prepare('SELECT * FROM achievement_claims WHERE status=? ORDER BY updated_at,id LIMIT ? OFFSET ?').all(status,+limit,+offset).map(row=>this.view(row))};
  }
  decide(reviewer,id,input) {
    this.requireStorage();
    strict(input,['version','decision','reason','ownershipConfirmed','verificationMethod','verificationReference']);
    if(!reviewer.canModerate) throw new RequestError(403,'Требуется право модератора.');
    const choices={approve:'approved',reject:'rejected',request_information:'needs_info',revoke:'revoked'};
    if(!Object.hasOwn(choices,input.decision)) throw new RequestError(400,'Неизвестное решение.');
    const note=text(input.reason,10,1500,'обоснование решения');
    return this.store.transaction(()=>{
      const row=this.get(id);this.version(row,input.version);
      if(row.owner===reviewer.platformOwner) throw new RequestError(403,'Нельзя модерировать собственную заявку.');
      const profile=this.profile(row.owner);
      if(!profile?.consent) throw new RequestError(409,'Согласие кандидата отозвано.');
      if(input.decision==='revoke' ? row.status!=='approved' : !['pending','needs_info',...(input.decision==='approve'?['approved']:[])].includes(row.status)) throw new RequestError(409,'Для текущего статуса это решение недоступно.');
      let method=null,reference=null;
      if(input.decision==='approve') {
        if (this.integrations.publicSourceChecks?.running.has(JSON.parse(row.snapshot).sourceId)) throw new RequestError(409,'Дождитесь завершения проверки источника.');
        const checks=this.checks(row);
        if(checks.sourceStatus!=='matched' || checks.duplicateApproved) throw new RequestError(409,'Источник изменён, недоступен или результат уже привязан. Нужна повторная проверка.');
        if(input.ownershipConfirmed!==true || !['document_review','organizer_confirmation','account_ownership'].includes(input.verificationMethod)) throw new RequestError(400,'Укажите способ проверки и подтвердите принадлежность результата.');
        reference=text(input.verificationReference,20,2000,'основание проверки принадлежности'); method=input.verificationMethod;
        if(method==='document_review' && !checks.documentProvided) throw new RequestError(400,'Для проверки документа нужны подтверждающие материалы.');
      } else if(input.ownershipConfirmed || input.verificationMethod || input.verificationReference) throw new RequestError(400,'Проверка принадлежности указывается только при одобрении.');
      const at=iso(this.now),until=input.decision==='approve'?new Date(this.now()+validDays*86400000).toISOString():null;
      this.db.prepare(`UPDATE achievement_claims SET status=?,version=version+1,updated_at=?,reviewed_at=?,valid_until=?,decision_note=?,verification_method=?,verification_reference=?,approved_profile_name=? WHERE id=?`)
        .run(choices[input.decision],at,at,until,note,method,reference?this.integrations.seal({value:reference}):null,input.decision==='approve'?profile.name:null,id);
      const next=this.get(id);this.audit(next,reviewer.id,input.decision,{reason:note,verificationMethod:method,verificationReference:reference});this.integrations.reindex(row.owner);return this.view(next,{moderator:true});
    });
  }
  attachment(row, actor) {
    const document=this.integrations.unseal(row.materials).document;
    if(!document) throw new RequestError(404,'Файл не приложен.');
    this.audit(row,actor,'document_downloaded');return {...document,bytes:Buffer.from(document.dataBase64,'base64')};
  }
  count(owner) { return this.db.prepare("SELECT * FROM achievement_claims WHERE owner=? AND status='approved'").all(owner).filter(row=>this.active(row)).length; }
  evidence(owner,{publicOnly=false}={}) {
    return this.db.prepare("SELECT * FROM achievement_claims WHERE owner=? AND status IN ('approved','revoked') ORDER BY reviewed_at DESC,id").all(owner).map(row=>{
      const record=JSON.parse(row.snapshot),active=this.active(row);
      const item={id:hash('claim:'+row.id),provider:'fsp-public',title:record.title,discipline:record.discipline,occurredAt:record.occurredOn+'T00:00:00.000Z',
        result:`Место ${record.place}; решено задач: ${record.solvedTasks}`,place:record.place,participation:record.participation,teamRole:null,sourceUrl:record.sourceUrl+'#page='+record.sourcePage,
        status:row.status==='revoked'?'revoked':active?'verified':'stale',identityVerified:active,checkedAt:row.reviewed_at,validUntil:row.valid_until || row.reviewed_at,
        verificationMethod:'manual_review',skills:record.discipline==='algorithms'?[{skill:'Алгоритмы',scope:'individual_result',ruleVersion:'fsp-discipline-v1'},{skill:'Структуры данных',scope:'individual_result',ruleVersion:'fsp-discipline-v1'}]:[],
        externalRecordId:row.record_id,snapshotHash:record.documentHash,mappingVersion:'fsp-discipline-v1'};
      if(publicOnly){delete item.externalRecordId;delete item.snapshotHash;}return item;
    });
  }
  removeOwner(owner) { this.db.prepare('DELETE FROM achievement_claims WHERE owner=?').run(owner); }
  tick() { for(const row of this.db.prepare("SELECT DISTINCT owner FROM achievement_claims WHERE status='approved'").all()) this.integrations.reindex(row.owner); }
}
