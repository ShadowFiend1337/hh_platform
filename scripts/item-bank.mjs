// Dynamic bank maintenance: statistics, LLM generation and expert review from the console.
//   node scripts/item-bank.mjs stats [--specialization Backend --grade Middle]
//   node scripts/item-bank.mjs generate --specialization Backend --grade Middle [--per-family 3]
//   node scripts/item-bank.mjs generate --all [--per-family 2]
//   node scripts/item-bank.mjs list --status pilot [--specialization Backend --grade Middle]
//   node scripts/item-bank.mjs approve <item-id> | reject <item-id>
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore } from '../server/store.mjs';
import { programs } from '../server/bank.mjs';
import { ItemBank } from '../server/item-bank.mjs';
import { generateFamilyItems } from '../server/item-generator.mjs';
import { createLlmClient } from '../server/llm.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
try { process.loadEnvFile(resolve(root, '.env')); } catch { /* .env is optional */ }
const [command = 'stats', ...rest] = process.argv.slice(2);
const option = name => { const index = rest.indexOf('--' + name); return index >= 0 ? rest[index + 1] : undefined; };
const store = openStore(process.env.ASSESSMENT_DB || resolve(root, 'server/data/assessment.sqlite'));
const bank = new ItemBank(store.db, { programs });

function printSummary(specialization, grade) {
  const summary = bank.summary(specialization, grade);
  const label = specialization ? `${specialization}/${grade}` : 'весь банк';
  console.log(`${label}: авторских ${summary.authored}; сгенерированных: пилот ${summary.generated.pilot}, `
    + `в зачёте ${summary.generated.active}, выведено ${summary.generated.retired}, отклонено ${summary.generated.rejected}`);
}

try {
  if (command === 'stats') {
    printSummary(option('specialization'), option('grade'));
  } else if (command === 'list') {
    for (const item of bank.list({ specialization: option('specialization'), grade: option('grade'), status: option('status') })) {
      console.log(`\n[${item.status}] ${item.id} · ${item.specialization}/${item.grade} · ${item.topic} · сложность ${item.difficulty}`);
      console.log(item.text);
      item.options.forEach((text, index) => console.log(`  ${index === item.correct ? '✔' : ' '} ${text}`));
      console.log(`  показы ${item.stats.exposures}, ответы ${item.stats.responses}, верно ${item.stats.correct}`);
    }
  } else if (command === 'approve' || command === 'reject') {
    const id = rest[0];
    if (!bank.row(id)) throw new Error('Задание не найдено: ' + id);
    bank.setStatus(id, command === 'approve' ? 'active' : 'rejected', { decidedBy: 'expert:console', reason: command === 'approve' ? 'Одобрено экспертом.' : 'Отклонено экспертом.' });
    console.log(`${id}: ${bank.row(id).status}`);
  } else if (command === 'generate') {
    const llm = createLlmClient();
    if (!llm.configured) throw new Error('Добавьте OPENROUTER_API_KEY в .env.');
    const perFamily = Number(option('per-family') || 3);
    const targets = rest.includes('--all')
      ? Object.entries(programs).flatMap(([specialization, grades]) => Object.keys(grades).map(grade => [specialization, grade]))
      : [[option('specialization'), option('grade')]];
    for (const [specialization, grade] of targets) {
      const program = programs[specialization]?.[grade];
      if (!program) throw new Error('Укажите --specialization и --grade из каталога или --all.');
      for (const family of program.families) {
        const result = await generateFamilyItems({ llm, bank, familyId: family.id, count: perFamily });
        console.log(`${family.id}: принято ${result.accepted.length}, отклонено ${result.rejected.length}${result.rejected.length ? ' (' + [...new Set(result.rejected)].join('; ') + ')' : ''}`);
      }
      printSummary(specialization, grade);
    }
    const usage = llm.usage();
    console.log(`Токены: вход ${usage.promptTokens}, выход ${usage.completionTokens}, запросов ${usage.requests}.`);
  } else {
    throw new Error('Команды: stats, list, generate, approve, reject.');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  store.close();
}
