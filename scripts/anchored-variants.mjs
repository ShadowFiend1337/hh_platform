import { DatabaseSync } from 'node:sqlite';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLlmClient, LlmError } from '../server/llm.mjs';
import { applyProxyFromEnv } from '../server/proxy.mjs';
import { anchorPassport, generateAnchoredVariant } from '../server/anchored-generator.mjs';
import { AnchoredVariantStore, independentReviewChecks } from '../server/anchored-variant-store.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
try { process.loadEnvFile(resolve(root, '.env')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
applyProxyFromEnv();
const [command = 'help', id, file] = process.argv.slice(2);
const help = `Authoring only; no command activates a variant.
node --use-env-proxy scripts/anchored-variants.mjs passport <anchor-id>
node --use-env-proxy scripts/anchored-variants.mjs generate <anchor-id> [output.json]
node scripts/anchored-variants.mjs list | show <variant-id>
node scripts/anchored-variants.mjs review <variant-id> <review.json>
node scripts/anchored-variants.mjs plan <variant-id> <plan-options.json>
node scripts/anchored-variants.mjs assign <plan-id> <participant.json>
node scripts/anchored-variants.mjs record <plan-id> <outcome.json>
node scripts/anchored-variants.mjs report <plan-id>
ASSESSMENT_DB chooses the SQLite path. VARIANT_REVIEWER is required for review/plan.
Review checks: ${independentReviewChecks.join(', ')}`;
const output = value => console.log(JSON.stringify(value, null, 2));
if (command === 'help') console.log(help);
else if (command === 'passport') output(anchorPassport(id));
else {
  const path = process.env.ASSESSMENT_DB || resolve(root, 'server/data/assessment.sqlite');
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path, { timeout: 5000 });
  try {
    const store = new AnchoredVariantStore(db);
    const input = () => JSON.parse(readFileSync(file, 'utf8'));
    const reviewer = () => {
      if (!process.env.VARIANT_REVIEWER?.trim()) throw new TypeError('Set VARIANT_REVIEWER to the responsible expert account.');
      return process.env.VARIANT_REVIEWER.trim();
    };
    if (command === 'generate') {
      anchorPassport(id); // Validate before any paid request.
      const llm = createLlmClient();
      let result;
      try { result = await generateAnchoredVariant({ llm, anchorId: id, existingScenarios: store.scenarios(id) }); }
      catch (error) { if (error instanceof LlmError) store.log(id, 'failed', [error.code]); throw error; }
      if (!result.accepted) { store.log(id, 'rejected-structure', result.reasons); output(result); process.exitCode = 2; }
      else {
        const candidate = store.save(result.candidate);
        if (file) {
          writeFileSync(resolve(file), JSON.stringify(candidate, null, 2) + '\n', { mode: 0o600 });
          chmodSync(resolve(file), 0o600);
        }
        output(file ? { id: candidate.id, status: candidate.review.status, file: resolve(file), llmCalls: 1 } : candidate);
      }
    } else if (command === 'list') output(store.list());
    else if (command === 'show') { const item = store.get(id); if (!item) throw new TypeError('Unknown variant'); output(item); }
    else if (command === 'review') output(store.review(id, input(), reviewer()));
    else if (command === 'plan') output(store.plan(id, input(), reviewer()));
    else if (command === 'assign') { const data = input(); output(store.assign(id, data.participantHash, data.stratum)); }
    else if (command === 'record') { const { participantHash, ...data } = input(); output(store.record(id, participantHash, data)); }
    else if (command === 'report') output(store.report(id));
    else throw new TypeError(help);
  } catch (error) {
    // LLM client errors deliberately contain no upstream response/request/key.
    console.error(error.message); process.exitCode = 1;
  } finally { db.close(); }
}
