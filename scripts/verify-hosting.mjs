import {pathToFileURL} from 'node:url';

export async function verifyHosting({url='https://permit-daesan-461e8.web.app',commit,attempts=12,delayMs=10000,fetchImpl=fetch,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),log=console.log}={}) {
  if(!commit)throw Error('Expected deployment commit is required.');
  let reason='';
  for(let attempt=1;attempt<=attempts;attempt++) {
    try {
      const options={cache:'no-store',signal:AbortSignal.timeout(15000)};
      const response=await fetchImpl(url+'/',options);
      if(!response.ok)throw Error('Homepage HTTP '+response.status);
      if(!(await response.text()).includes('대산 출입관리'))throw Error('Homepage content does not match this application.');
      const marker=await fetchImpl(url+'/deployment.json',options);
      if(!marker.ok)throw Error('Deployment marker HTTP '+marker.status);
      if((await marker.json()).commit!==commit)throw Error('The previous deployment is still being served.');
      const script=await fetchImpl(url+'/app.js',options);
      if(!script.ok || !(await script.text()).trim())throw Error('Application script is missing.');
      log('Published and verified: '+url+' (commit '+commit+')');return url;
    }catch(error){reason=error.message;log(`Readiness ${attempt}/${attempts}: ${reason}`);}
    if(attempt<attempts)await sleep(delayMs);
  }
  throw Error('Hosting verification failed: '+reason+'. Check Firebase deploy output and Hosting site permit-daesan-461e8.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  verifyHosting({commit:process.env.GITHUB_SHA}).catch(error=>{console.error(error.message);process.exitCode=1;});
}
