import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
let config;try{config=JSON.parse(process.env.PERMIT_NOTIFICATION_CONFIG||'');}catch(e){throw Error('PERMIT_NOTIFICATION_CONFIG must be valid JSON.');}
for(const [service,keys] of [['solapi',['apiKey','apiSecret','from']],['microsoft365',['tenantId','clientId','clientSecret','sender']]])for(const key of keys)if(typeof config[service]?.[key]!=='string'||!config[service][key].trim())throw Error(`PERMIT_NOTIFICATION_CONFIG needs ${service}.${key}.`);
const folder=mkdtempSync(join(tmpdir(),'permit-notifications-'));
try{const file=join(folder,'config.json');writeFileSync(file,JSON.stringify(config),{mode:0o600});execFileSync('npx',['--no-install','firebase','functions:secrets:set','PERMIT_NOTIFICATION_CONFIG','--data-file',file,'--project','permit-daesan-461e8','--force','--non-interactive'],{stdio:'inherit'});}finally{rmSync(folder,{recursive:true,force:true});}
