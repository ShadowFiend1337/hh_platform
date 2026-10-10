import { RequestError } from '../assessment.mjs';
import { isLocalFixtureAccount } from '../local-fixtures.mjs';
function query(url, allowed) {
  if ([...url.searchParams.keys()].some(key=>!allowed.includes(key) || url.searchParams.getAll(key).length!==1)) throw new RequestError(400,'Недопустимые параметры запроса.');
}
export async function claimRoutes({request,response,url,identity,integrations,body,send,limit}) {
  const path=url.pathname;
  if(!path.startsWith('/api/achievement-claims') && !path.startsWith('/api/moderation/claims') && !path.startsWith('/api/moderation/sources')) return false;
  if(!identity.account) throw new RequestError(401,'Войдите в аккаунт.');
  const moderator=path.startsWith('/api/moderation/');
  if(moderator ? !identity.account.canModerate : identity.account.role!=='candidate') throw new RequestError(403,moderator?'Требуется право модератора.':'Заявки доступны кандидату.');
  // The public team test moderator reviews tests and the item bank only; achievement claims hold private documents.
  if(moderator && isLocalFixtureAccount(identity.account)) throw new RequestError(403,'Тестовый модератор проверяет тесты и банк заданий. Заявки на достижения — только реальный модератор.');
  integrations.claims.requireStorage();
  const scope='auth:'+identity.account.id;response.setHeader('X-Platform-Identity',scope);
  if(['POST','PUT','DELETE'].includes(request.method) && request.headers['x-platform-identity']!==scope) throw new RequestError(409,'Аккаунт изменился. Обновите страницу.');
  const sourceCheck = /^\/api\/moderation\/sources\/([a-z0-9-]{1,100})\/check$/u.exec(path);
  if(path==='/api/moderation/sources'&&request.method==='GET'){query(url,[]);send(response,200,integrations.publicCollector.list());return true;}
  const sourceCollect=/^\/api\/moderation\/sources\/([a-z0-9-]{1,100})\/collect$/u.exec(path);
  if(sourceCollect&&request.method==='POST'){query(url,[]);const input=await body(request);if(Object.keys(input).length)throw new RequestError(400,'Ожидается пустой объект.');limit('source-collect:'+identity.account.id,10,600000);send(response,202,{job:integrations.publicCollector.enqueue(sourceCollect[1])});return true;}
  const collectionJob=/^\/api\/moderation\/sources\/jobs\/([a-f\d-]{36})$/u.exec(path);
  if((sourceCollect&&request.method!=='POST')||(collectionJob&&request.method!=='GET')||(path==='/api/moderation/sources'&&request.method!=='GET'))throw new RequestError(405,'Метод не поддерживается.');
  if(collectionJob&&request.method==='GET'){query(url,[]);send(response,200,integrations.publicCollector.job(collectionJob[1]));return true;}
  if(sourceCheck && request.method!=='POST') throw new RequestError(405,'Метод не поддерживается.');
  if(sourceCheck && request.method==='POST') {
    query(url,[]);
    const input=await body(request); if(Object.keys(input).length) throw new RequestError(400,'Ожидается пустой объект.');
    limit('source-check:'+identity.account.id,5,600000);
    send(response,200,await integrations.publicSourceChecks.check(sourceCheck[1]));return true;
  }
  const service=integrations.claims;
  const match=/^\/api\/(achievement-claims|moderation\/claims)\/([a-f\d-]{36})(?:\/(decision|attachment))?$/u.exec(path);
  if(request.method==='GET') {
    if(path==='/api/achievement-claims') {query(url,[]);send(response,200,service.list(identity.owner));return true;}
    if(path==='/api/moderation/claims') {query(url,['status','limit','offset']);limit('moderation-queue:'+identity.account.id,60,60000);
      send(response,200,service.queue(url.searchParams.get('status')??'pending',url.searchParams.get('limit')??'20',url.searchParams.get('offset')??'0'));return true;}
    if(match && !match[3]) {query(url,[]);const row=service.get(match[2],moderator?undefined:identity.owner);if(moderator)service.audit(row,identity.account.id,'inspected');send(response,200,service.view(row,{moderator}));return true;}
    if(match?.[3]==='attachment') {query(url,[]);const row=service.get(match[2],moderator?undefined:identity.owner),doc=service.attachment(row,identity.account.id);
      response.writeHead(200,{'Content-Type':doc.mediaType,'Content-Disposition':`attachment; filename="attachment"; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
        'Content-Length':doc.bytes.length,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'",'Referrer-Policy':'no-referrer'});
      response.end(doc.bytes);return true;}
  }
  if(path==='/api/achievement-claims' && request.method==='POST') {
    limit('claim-create:'+identity.owner,10,600000);send(response,201,service.submit(identity.owner,identity.account.id,await body(request,2_900_000)));return true;
  }
  if(match && !moderator && !match[3]) {
    if(request.method==='PUT') {limit('claim-revise:'+identity.owner,10,600000);send(response,200,service.revise(identity.owner,identity.account.id,match[2],await body(request,2_900_000)));return true;}
    if(request.method==='DELETE') {send(response,200,service.withdraw(identity.owner,identity.account.id,match[2],await body(request)));return true;}
  }
  if(match && moderator && match[3]==='decision' && request.method==='POST') {
    limit('moderation-decisions:'+identity.account.id,30,60000);
    send(response,200,service.decide({...identity.account,platformOwner:identity.owner},match[2],await body(request)));return true;
  }
  throw new RequestError(match || ['/api/achievement-claims','/api/moderation/claims'].includes(path)?405:404,'Метод или путь не поддерживается.');
}
