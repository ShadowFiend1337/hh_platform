// Synthetic transport data for workflow tests only. Never a content-quality or difficulty evaluation.
import { randomBytes } from 'node:crypto';
import { validateAnchoredDraft } from '../../anchored-generator.mjs';
export function mixedReply(passport) {
  const words = Array.from({length:85},()=>randomBytes(6).toString('hex').replace(/[0-9]/g,c=>String.fromCharCode(103+Number(c))));
  const quotes = [words.slice(0,24).join(' '),words.slice(24,48).join(' '),words.slice(48).join(' ')];
  const solution = 'Транспортная фикстура для проверки сохранения ответов и маршрутов. Содержательная эквивалентность этим тестом не оценивается. ' + quotes[0];
  const raw = {title:'Тестовый сценарий маршрута '+words[0],prompt:quotes.join('. '),solution,
    questions:passport.criteria.slice(0,passport.questionCount).map(c=>({prompt:'Выберите решение для транспортного сценария '+words[1],
      options:['Проверочное решение первого типа','Проверочное решение второго типа','Проверочное решение третьего типа','Проверочное решение четвёртого типа'],correct:0,
      explanation:'Тестовый ключ используется только для проверки маршрута оценки, правильность настоящих задач проверяется отдельно.',criterionIds:[c.id],
      distractors:[1,2,3].map(option=>({option,misconception:'Транспортная фикстура ошибочного ответа.',whyWrong:'Проверка механизма перестановки вариантов и сохранения ключа.'}))})),
    criterionMap:passport.criteria.map(c=>({criterionId:c.id,adaptedCriterion:'Тестовый критерий сохранения развёрнутого ответа кандидата.',preservedOperation:'Выполнить тестовую операцию в изолированном сценарии проверки маршрутов.',evidenceQuotes:[quotes[0]],solutionQuote:solution})),
    criticalErrorMap:passport.criticalErrors.map((_,index)=>({index,adaptedError:'Тестовая критическая ошибка транспортного сценария.',check:'Проверить целостность ответа и сохранение критерия в тестовой базе.'})),
    changes:['domain','representation','question'].map((dimension,i)=>({dimension,beforeQuote:passport.referenceScenario.slice(i*30,i*30+28),afterQuote:quotes[i],explanation:'Транспортная фикстура содержит отдельную цитату для проверки контракта структурного валидатора.'})),
    equivalence:{rationale:'Это исключительно транспортная фикстура проверки маршрутов смешанного теста. Она не используется для подтверждения сложности или содержательной корректности задач и не выдаётся реальным кандидатам.',addedPrerequisites:[],removedOperations:[],risks:['Содержательная сложность не оценивается в транспортном тесте.']}};
  const errors=validateAnchoredDraft(raw,passport);if(errors.length)throw new Error(errors.join(','));return raw;
}
export function mixedLlm() {
  return {configured:true,models:{chat:'fixture'},calls:0,async chat(options){this.calls++;const {passport}=JSON.parse(options.messages.at(-1).content);return {model:'fixture',json:mixedReply(passport)};}};
}
