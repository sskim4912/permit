import {validateNotificationConfig} from '../functions/lib/config.js';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
let config,folder;
const values=[];
const collect=value=>{if(typeof value==='string'&&value)values.push(value);else if(value&&typeof value==='object')Object.values(value).forEach(collect);};
const redact=value=>values.sort((a,b)=>b.length-a.length).reduce((text,secret)=>text.split(secret).join('[REDACTED]'),String(value));
function firebase(args){try{const output=execFileSync('npx',['--no-install','firebase',...args,'--project','permit-daesan-461e8','--non-interactive'],{encoding:'utf8',maxBuffer:10*1024*1024});if(output)console.log(redact(output));}catch(error){throw Error(redact(String(error.stdout||'')+'\n'+String(error.stderr||''))||'Firebase notification deployment failed.');}}
try{
 try{config=JSON.parse(process.env.PERMIT_NOTIFICATION_CONFIG||'');}catch(e){throw Error('PERMIT_NOTIFICATION_CONFIG must be valid JSON.');}
 collect(config);validateNotificationConfig(config);
 folder=mkdtempSync(join(tmpdir(),'permit-notifications-'));const file=join(folder,'config.json');writeFileSync(file,JSON.stringify(config),{mode:0o600});
 firebase(['functions:secrets:set','PERMIT_NOTIFICATION_CONFIG','--data-file',file,'--force']);
 if(process.argv.includes('--deploy'))firebase(['deploy','--only','functions:permit-notifications']);
}catch(error){const message=redact(error.message).replace(/\x1b\[[0-9;]*m/g,'').slice(-3000);console.error(message);if(process.env.GITHUB_ACTIONS==='true')console.log('::error title=Notification setup failed::'+message.replace(/%/g,'%25').replace(/\r/g,'%0D').replace(/\n/g,'%0A'));process.exitCode=1;
}finally{if(folder)rmSync(folder,{recursive:true,force:true});}
