// Public deployment address only. GitHub credentials stay in Apps Script properties.
export const notificationTriggerURL = 'https://script.google.com/macros/s/AKfycbw7xf_z3mpPxWjQgqrm5PeQJsPyN4dgjeLq4NRwLCejuP73TkDBFmZwVLSnnd9nNA8V/exec';

export async function requestFastNotification({queue_id,request_id,owner_key},{fetchImpl=globalThis.fetch,url=notificationTriggerURL}={}) {
  if(!/^[A-Za-z0-9]{20}$/.test(queue_id||'') || !/^[A-Za-z0-9]{20}$/.test(request_id||'') || !/^[a-f0-9]{64}$/.test(owner_key||''))return;
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
  try {
    // Apps Script has no CORS acknowledgement. Only Firestore receipts establish SMS status.
    await fetchImpl(url,{method:'POST',mode:'no-cors',credentials:'omit',referrerPolicy:'no-referrer',
      headers:{'Content-Type':'text/plain;charset=UTF-8'},keepalive:true,signal:controller.signal,
      body:JSON.stringify({queue_id,request_id,owner_key})});
  } catch (_) {
    // The application is already committed. The existing scheduled worker is the fallback.
  } finally {clearTimeout(timeout);}
}
