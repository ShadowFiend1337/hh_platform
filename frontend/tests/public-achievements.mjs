import assert from 'node:assert/strict';
import { PRIVACY_POLICY_VERSION } from '../../shared/privacy.ts';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { createAssessmentServer } from '../../server/server.mjs';
import { publicSourceRegistry } from '../../server/integrations/public-collector.mjs';
import { parsePublicSource } from '../../server/integrations/public-parsers.mjs';
import { createInitialState } from '../src/model.ts';
const codes=new Map(),news=publicSourceRegistry()[1];
let places=[1,2,3],banner='';
const html=()=>`<h1>${news.requiredTitle}</h1><div class="opis"><p>С 25 по 28 июня 2026 года; 26 и 27 июня.</p><h4>Итоги турнира<br>· ${places[0]}-е место — команда «Гутид» (Санкт-Петербург);<br>· ${places[1]}-е место — сборная Чувашской Республики;<br>· ${places[2]}-е место — сборная Самарской области.<br>Победители и призёры получили награды.</h4></div>${banner}`;
const app=createAssessmentServer({dbPath:':memory:',authEnv:{},authMailer:async({email,code})=>codes.set(email,code),integrationOptions:{automatic:false,publicFetcher:async()=>new Response(html()),publicCollectorOptions:{sources:[news],seed:{snapshots:[parsePublicSource(news,html())]},spacingMs:0}}});
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+app.server.address().port;
let browser;
try {
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});
  const candidate=await browser.newContext({viewport:{width:1440,height:1100}}),moderator=await browser.newContext({viewport:{width:1440,height:1100}});
  async function register(context,login,role){
    const api=context.request,email=login+'@example.invalid';
    assert.equal((await api.post(base+'/api/auth/register/request-code',{data:{email,login,role,password:'browser fixture password',consent:true,privacyVersion:PRIVACY_POLICY_VERSION,...(role==='candidate'?{name:'Иван Петров'}:{companyName:'Модерация'})}})).status(),202);
    const verified=await api.post(base+'/api/auth/register/verify',{data:{email,code:codes.get(email)}});assert.equal(verified.status(),201);return (await verified.json()).account;
  }
  const account=await register(candidate,'public-news-candidate','candidate'),reviewer=await register(moderator,'public-news-reviewer','employer');
  app.auth.store.setModerator(reviewer.id,true,'browser-fixture');
  const state=createInitialState(),survey={id:'public-news-survey',date:new Date().toISOString(),industry:'ИТ',professionalRole:'Frontend разработчик',specialization:'Frontend',desiredGrade:'Junior',experience:'1 год',stack:['React'],softSkills:[]};
  Object.assign(state.profile,survey,{id:'candidate-anna',name:'Иван Петров',email:account.email,consent:true,visible:true,surveyCompletedAt:survey.date});state.surveys=[survey];
  async function save(){const snapshot=await candidate.request.get(base+'/api/platform/state'),payload=await snapshot.json();const saved=await candidate.request.put(base+'/api/platform/state',{headers:{'X-Platform-Identity':snapshot.headers()['x-platform-identity']},data:{state,baseRevision:payload.revision}});assert.equal(saved.status(),200,await saved.text());}
  await save();
  const started=await candidate.request.post(base+'/api/assessment/attempts',{data:{survey,vacancyDescription:''}}),attempt=await started.json(),internal=app.store.get(attempt.id).attempt;
  const submitted=await candidate.request.post(base+`/api/assessment/attempts/${attempt.id}/submit`,{data:{token:attempt.token,answers:internal.questions.map(question=>({questionId:question.id,optionId:question.correctOptionId}))}}),result=await submitted.json();assert(result.passed);
  state.history=[result];state.profile.confirmed={specialization:result.specialization,grade:result.grade,score:result.score,date:result.date,surveyId:survey.id};await save();
  const page=await candidate.newPage(),reviewPage=await moderator.newPage(),errors=[];
  for(const p of [page,reviewPage])p.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+'/app?role=candidate&tab=profile');
  await page.getByRole('heading',{name:'Внешние подтверждения',exact:true}).waitFor();
  const search=page.locator('.integration-source').filter({has:page.getByRole('heading',{name:'Результаты из открытых источников',exact:true})});
  await search.getByLabel('Имя участника или команда').fill('Гутид');await search.getByRole('button',{name:'Найти результат'}).click();await search.getByRole('link',{name:'Оригинальная публикация'}).waitFor();
  assert.equal(await search.getByRole('link',{name:'Оригинальная публикация'}).getAttribute('href'),news.sourceUrl);assert(await search.locator('blockquote').innerText());
  await search.getByRole('button',{name:'Это мой результат'}).click();const form=search.locator('.claim-form');await form.getByLabel('Описание участия').fill('Я входил в состав команды Гутид на финале Кубка России. Материалы содержат private@example.com.');await form.getByLabel(/Ссылки на подтверждающие материалы/u).fill('https://proof.example/team-certificate');
  await form.getByRole('checkbox',{name:/Это мой результат/u}).check();await form.getByRole('button',{name:'Отправить на проверку'}).click();const claims=page.locator('.claim-panel');await claims.getByText('На проверке',{exact:true}).waitFor();
  assert.deepEqual((await (await candidate.request.get(base+'/api/profile/evidence')).json()).items,[]);
  await reviewPage.goto(base+'/moderation');await reviewPage.getByText('Сбор из открытых источников',{exact:true}).click();const management=reviewPage.locator('.public-source-management');await management.getByRole('button',{name:'Обновить источник'}).click();await management.getByText('Источник актуален · записей: 3',{exact:true}).waitFor();
  await reviewPage.getByRole('button',{name:'Рассмотреть заявку'}).click();const detail=reviewPage.locator('.moderation-detail');await detail.getByText('Материалы кандидата',{exact:true}).waitFor();assert.equal(await detail.getByRole('link',{name:'Оригинальная публикация'}).getAttribute('href'),news.sourceUrl);
  await detail.getByRole('button',{name:'Проверить свежесть источника'}).click();await detail.getByText(/Последняя проверка источника:/u).waitFor();await detail.getByLabel('Обоснование решения для кандидата').fill('Проверены результаты и участие в составе команды.');await detail.getByLabel('Основание проверки — доступно модераторам').fill('Организатор подтвердил состав команды и участие кандидата в этом финале.');await detail.getByRole('checkbox',{name:/Проверил материалы/u}).check();
  assert(await detail.getByRole('button',{name:'Сохранить решение'}).isDisabled());await detail.getByRole('checkbox',{name:/Проверил участие кандидата в составе команды/u}).check();await reviewPage.screenshot({path:'/tmp/hh-public-news-moderation.png',fullPage:true});await detail.getByRole('button',{name:'Сохранить решение'}).click();await reviewPage.getByText('Всего заявок: 0',{exact:true}).waitFor();
  await page.reload();await claims.getByText('Одобрено',{exact:true}).waitFor();await page.getByText(/^Подтверждено модератором ·/u).waitFor();const claim=(await (await candidate.request.get(base+'/api/achievement-claims')).json()).claims[0],owner=app.integrations.claims.get(claim.id).owner;
  const evidence=(await (await candidate.request.get(base+'/api/profile/evidence')).json()).items[0];assert.equal(evidence.provider,'public-achievements');assert.equal(evidence.status,'verified');assert.equal(evidence.participation,'team');assert.equal(app.directory.store.forOwner(owner).fsp,0);
  const publicId=app.directory.store.forOwner(owner).id,response=await moderator.request.get(base+'/api/directory/'+publicId+'/evidence');assert.equal(response.status(),200);assert(!JSON.stringify(await response.json()).includes('private@example.com'));assert.equal((await (await candidate.request.get(base+'/api/platform/state')).json()).state.profile.confirmed.grade,'Junior');await page.screenshot({path:'/tmp/hh-public-news-approved.png',fullPage:true});
  banner='<nav>Обновлённое меню</nav>';await app.integrations.publicCollector.refresh(news.id);assert.equal(app.integrations.evidence(owner).items[0].status,'verified');places=[2,1,3];await app.integrations.publicCollector.refresh(news.id);await page.reload();await claims.getByText('Одобрено · требуется повторная проверка',{exact:true}).waitFor();assert.equal(app.integrations.evidence(owner).items[0].status,'stale');
  await claims.getByRole('button',{name:'Отозвать заявку'}).click();await claims.getByText('Отозвано кандидатом',{exact:true}).waitFor();assert.equal((await (await candidate.request.get(base+'/api/profile/evidence')).json()).items.length,0);assert.deepEqual(errors,[]);console.log('Public news browser flow passed: search, source collection, membership gate, approval, privacy, unchanged grade, correction and withdrawal.');
} catch(error) {for(const context of browser?.contexts()||[])for(const page of context.pages()){console.error(page.url(),(await page.locator('body').innerText()).slice(0,4000));}throw error;} finally {await browser?.close();await new Promise(resolve=>{app.server.close(resolve);app.server.closeAllConnections();});}
