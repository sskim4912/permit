export function normalizeRecipients(value) {
 const addresses=String(value||'').split(/[,;\s]+/).filter(Boolean);
 if(!addresses.length||addresses.length>10||addresses.some(address=>address.length>254||!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(address)))throw Error('올바른 이메일 주소를 최대 10개까지 쉼표로 구분해 입력해 주세요.');
 const seen=new Set();const unique=addresses.filter(address=>{const key=address.toLowerCase();if(seen.has(key))return false;seen.add(key);return true;});
 const result=unique.join(',');if(result.length>2540)throw Error('수신 이메일 주소가 너무 깁니다.');return result;
}
export function composeMailto(recipient,subject,body){
 return 'mailto:'+normalizeRecipients(recipient).split(',').map(encodeURIComponent).join(',')+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
}
