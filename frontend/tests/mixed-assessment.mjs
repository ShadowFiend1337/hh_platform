import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { startIsolatedService } from './helpers/isolated-service.mjs';
import { mixedLlm } from '../../server/tests/fixtures/mixed-llm.mjs';
import { PRIVACY_POLICY_VERSION } from '../../shared/privacy.ts';

const llm=mixedLlm();let release;
const gate=new Promise(r=>{release=r;}),chat=llm.chat.bind(llm);
llm.chat=async options=>{await gate;return chat(options);};
const isolated=await startIsolatedService({llm,integrationOptions:{automatic:false}}),{base,service,codes}=isolated;
const browser=await chromium.launch({headless:true}),require=createRequire(import.meta.url),errors=[],outbound=[];
async function context() {
  const c=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await c.route('**/*',async route=>{const url=new URL(route.request().url());if(['http:','https:'].includes(url.protocol)&&url.hostname!=='127.0.0.1'){outbound.push(url.origin);await route.abort();}else await route.continue();});return c;
}
async function register(c,role,login) {
  const email=login+'@example.invalid';
  const requested=await c.request.post(base+'/api/auth/register/request-code',{data:{email,login,role,password:'Mixed browser fixture 2026!',consent:true,privacyVersion:PRIVACY_POLICY_VERSION,...(role==='candidate'?{name:'Проверка смешанного теста'}:{companyName:'Проверка модерации'})}});assert.equal(requested.status(),202);
  const verified=await c.request.post(base+'/api/auth/register/verify',{data:{email,code:codes.get(email)}});assert.equal(verified.status(),201);return (await verified.json()).account;
}
async function audit(page,label) {
  await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
  const issues=await page.evaluate(async()=> (await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)})));assert.deepEqual(issues,[],label);
}
try {
  const candidate=await context();await register(candidate,'candidate','mixed.browser');const page=await candidate.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.type()==='beforeunload'?d.accept():d.dismiss());
  await page.goto(base+'/app?role=candidate&tab=onboarding');await page.getByRole('heading',{name:'Анкета',exact:true}).waitFor();
  for(const [name,value] of [['industry','ИТ'],['specialization','DataAnalysis'],['desiredGrade','Middle']])await page.locator(`.onboarding-form [name="${name}"]`).selectOption(value);
  for(const [name,value] of [['professionalRole','Продуктовый аналитик'],['experience','3 года'],['stack','SQL, Python']])await page.locator(`.onboarding-form [name="${name}"]`).fill(value);
  await page.getByLabel('Согласен на обработку персональных данных',{exact:true}).check();await page.getByRole('button',{name:'К тесту',exact:true}).click();
  await page.locator('.main-content[data-sync-status="saved"]').waitFor();await page.getByLabel('Ознакомлен с правилами и готов начать').check();
  const created=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/assessment/attempts'&&r.request().method()==='POST');await page.getByRole('button',{name:'Начать тест',exact:true}).click();const response=await created;assert.equal(response.status(),202);const attempt=await response.json();
  await page.getByRole('heading',{name:'Готовим задания'}).waitFor();assert.equal(await page.locator('.exam-protected-content').count(),0);assert.equal(await page.evaluate(()=>!!document.fullscreenElement),false);release();
  await page.getByRole('button',{name:'Начать решение',exact:true}).click();
  for(let i=0;i<15;i++){
    await page.locator(`.exam-progress[aria-valuenow="${i+1}"]`).waitFor();const q=service.store.get(attempt.id).attempt.questions[i],index=q.options.findIndex(o=>o.id===q.correctOptionId);
    await page.locator('.answer-option').nth(index).getByRole('radio').check();await page.getByRole('button',{name:'Ответить',exact:true}).click();
  }
  await page.getByLabel('Развёрнутый ответ',{exact:true}).fill('Объяснение решения. Проверка единицы анализа и знаменателя.');
  await page.locator('.cm-content').fill('SELECT 1;');
  await page.reload();
  await page.waitForFunction(()=>document.querySelector('textarea[aria-label="Развёрнутый ответ"]') || [...document.querySelectorAll('button')].some(b=>b.textContent==='Вернуться к тесту'));
  if(await page.getByRole('button',{name:'Вернуться к тесту',exact:true}).count())await page.getByRole('button',{name:'Вернуться к тесту',exact:true}).click();
  await page.getByLabel('Развёрнутый ответ',{exact:true}).waitFor();assert.match(await page.getByLabel('Развёрнутый ответ',{exact:true}).inputValue(),/Объяснение решения/);assert.match(await page.locator('.cm-content').innerText(),/SELECT 1/);
  await audit(page,'Open answer is accessible');
  for(let i=15;i<20;i++){
    await page.locator(`.exam-progress[aria-valuenow="${i+1}"]`).waitFor();if(i>15)await page.getByLabel('Развёрнутый ответ',{exact:true}).fill('Объяснение решения с проверкой допущений и результата.');
    await page.getByRole('button',{name:i===19?'Завершить тест':'Ответить',exact:true}).click();
  }
  await page.getByRole('heading',{name:'Тест на ручной проверке',exact:true}).waitFor();assert.equal(await page.locator('.result-score').count(),0);
  const stored=service.store.get(attempt.id),open=stored.attempt.questions[15];assert.match(stored.progress.answers[open.id].answerText,/```sql\nSELECT 1;/);assert.equal(llm.calls,13);
  await page.reload();await page.getByRole('heading',{name:'Тест на ручной проверке',exact:true}).waitFor();
  const moderator=await context(),account=await register(moderator,'employer','mixed.reviewer');service.auth.store.setModerator(account.id,true,'fixture');const review=await moderator.newPage();review.on('pageerror',e=>errors.push(e.message));await review.goto(base+'/moderation');
  await review.getByRole('button',{name:'Тесты',exact:true}).click();await review.getByRole('button',{name:'Проверить тест',exact:true}).click();
  await review.getByRole('heading',{name:'Ручная проверка',exact:true}).waitFor();const marks=review.getByRole('combobox',{name:/^Оценка /});await marks.first().waitFor();assert.equal(await marks.count(),15);
  for(let i=0;i<await marks.count();i++)await marks.nth(i).selectOption('1');
  for(const label of ['Эталонные решения и ключи правильные','Путь решения исходных кейсов сохранён','Задания соответствуют указанному грейду','Объём работы сопоставим с исходными задачами','Условия и варианты ответа однозначны'])await review.getByLabel(label,{exact:true}).check();
  await review.getByLabel('Комментарий кандидату / причина отзыва',{exact:true}).fill('Открытые ответы выполнены частично.');await audit(review,'Moderator review is accessible');
  await review.getByRole('button',{name:'Сохранить проверку',exact:true}).click();await review.getByText('Всего: 0',{exact:true}).waitFor();
  await review.getByLabel('Статус теста',{exact:true}).selectOption('completed');await review.getByRole('button',{name:'Проверить тест',exact:true}).click();await review.getByRole('combobox',{name:/^Оценка /}).first().waitFor();assert.equal(await review.getByRole('combobox',{name:/^Оценка /}).first().inputValue(),'1');
  await page.getByRole('heading',{name:'Грейд подтверждён',exact:true}).waitFor({timeout:20000});assert.match(await page.locator('.result-score').innerText(),/75/);
  await page.locator('.main-content[data-sync-status="saved"]').waitFor();const state=await (await candidate.request.get(base+'/api/platform/state')).json();assert.equal(state.state.profile.confirmed.score,75);assert.equal(state.state.history[0].status,'completed');
  assert.deepEqual(errors,[]);assert.deepEqual(outbound,[]);console.log('Mixed browser flow passed: preparation, 15+5, restored text/code, pending review, moderator UI, 75-point confirmation, accessibility.');
} finally {release();await browser.close();await isolated.close();}
