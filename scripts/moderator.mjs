import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AuthStore } from '../server/auth.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
try {process.loadEnvFile(resolve(root,'.env'));} catch(error){if(error.code!=='ENOENT')throw error;}
const [action,identifier,...extra]=process.argv.slice(2);
if(!['grant','revoke','list'].includes(action) || action!=='list'&&!identifier || extra.length) throw new Error('Usage: npm run moderator -- grant|revoke <login-or-email>, or list');
const store=new AuthStore(process.env.ASSESSMENT_DB || resolve(root,'server/data/assessment.sqlite'));
try {
  if(action==='list') console.log(JSON.stringify(store.db.prepare(`SELECT a.id,a.login,g.granted_at FROM auth_moderator_grants g JOIN auth_accounts a ON a.id=g.account_id`).all(),null,2));
  else {
    const account=store.accountByIdentifier(identifier.trim().toLocaleLowerCase('ru-RU'));
    if(!account) throw new Error('Register and confirm the account before granting moderation rights.');
    store.setModerator(account.id,action==='grant');console.log(JSON.stringify({id:account.id,login:account.login,canModerate:store.canModerate(account.id)}));
  }
} finally {store.close();}
