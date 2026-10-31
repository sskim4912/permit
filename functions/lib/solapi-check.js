import {createHmac,randomBytes} from 'node:crypto';
export async function checkSolapi(config,{fetchImpl=fetch}={}){
 const api=config?.solapi;if(!api?.apiKey||!api?.apiSecret)throw Error('솔라피 API Key와 Secret 설정이 필요합니다.');
 const date=new Date().toISOString(),salt=randomBytes(16).toString('hex'),signature=createHmac('sha256',api.apiSecret).update(date+salt).digest('hex');
 let response;try{response=await fetchImpl('https://api.solapi.com/cash/v1/balance',{method:'GET',headers:{Authorization:`HMAC-SHA256 apiKey=${api.apiKey}, date=${date}, salt=${salt}, signature=${signature}`},signal:AbortSignal.timeout(12000)});}catch(e){throw Error('솔라피 인증 조회 서버에 연결하지 못했습니다. 문자 발송은 하지 않았습니다.');}
 if(!response.ok){let code='unknown';try{const data=await response.json();const value=data.errorCode||data.code;if(typeof value==='string'&&/^[A-Za-z0-9_.-]{1,80}$/.test(value)&&!value.includes(api.apiKey)&&!value.includes(api.apiSecret))code=value;}catch(e){}throw Error(`솔라피 인증 조회 오류 (HTTP ${response.status}, ${code}). GitHub Secret의 API Key·Secret 및 솔라피 허용 IP를 확인해 주세요.`);}
 return true;
}
