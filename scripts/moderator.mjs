import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AuthService } from '../server/auth.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
try {process.loadEnvFile(resolve(root,'.env'));} catch(error){if(error.code!=='ENOENT')throw error;}
const [action,identifier,...extra]=process.argv.slice(2);
const usage='Usage: npm run moderator -- create <login> <email> [display name] | grant|revoke <login-or-email> | list';
if(!['create','grant','revoke','list'].includes(action) || action!=='list'&&!identifier || action==='create'&&(extra.length<1||extra.length>2) || ['grant','revoke'].includes(action)&&extra.length) throw new Error(usage);
const auth=new AuthService(process.env.ASSESSMENT_DB || resolve(root,'server/data/assessment.sqlite')),store=auth.store;
try {
  if(action==='list') console.log(JSON.stringify(store.db.prepare(`SELECT a.id,a.login,a.email,a.name,g.granted_at FROM auth_accounts a LEFT JOIN auth_moderator_grants g ON a.id=g.account_id WHERE a.role='moderator'`).all(),null,2));
  else if(action==='create') {
    // A moderator is a separate staff account. The password is printed once unless MODERATOR_PASSWORD is set.
    const password=process.env.MODERATOR_PASSWORD || randomBytes(12).toString('base64url');
    const account=await auth.createModerator({login:identifier,email:extra[0],...(extra[1]?{name:extra[1]}:{}),password,actor:'local-operator'});
    console.log(JSON.stringify({id:account.id,login:account.login,role:account.role,canModerate:store.canModerate(account.id),...(process.env.MODERATOR_PASSWORD?{}:{password})}));
  } else {
    const account=store.accountByIdentifier(identifier.trim().toLocaleLowerCase('ru-RU'));
    if(!account) throw new Error('No such account. Create a moderator with: npm run moderator -- create <login> <email>.');
    store.setModerator(account.id,action==='grant');console.log(JSON.stringify({id:account.id,login:account.login,canModerate:store.canModerate(account.id)}));
  }
} finally {auth.close();}
