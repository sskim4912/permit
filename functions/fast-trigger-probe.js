import {initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
let db;
try{
 initializeApp({projectId:'permit-daesan-461e8'});db=getFirestore();const queues=await db.collection('notificationQueue').orderBy('created','desc').limit(5).get();let verified=false,code=0;
 for(const d of queues.docs){const q=d.data();if(!q.ids?.length||!/^[a-f0-9]{64}$/.test(q.owner_key||''))continue;const url='https://firestore.googleapis.com/v1/projects/permit-daesan-461e8/databases/(default)/documents/applicantCopies/'+q.owner_key+'/items/'+q.ids[0]+'?key=AIzaSyAVNKvKku3o-nvV0Dc80eB9W4DOJHhdnoU&mask.fieldPaths=owner_key&mask.fieldPaths=notification_queue_id&mask.fieldPaths=created';const response=await fetch(url);code=response.status;if(!response.ok)continue;const data=await response.json();verified=data.fields?.owner_key?.stringValue===q.owner_key&&data.fields?.notification_queue_id?.stringValue===d.id;if(verified)break;}
 console.log(`::notice title=Fast trigger proof check::Read-only anonymous ownership proof verified=${verified}; HTTP=${code}. No tokens, keys or request contents were printed. No messages were sent.`);if(!verified)process.exitCode=1;
}catch(e){console.error('::error title=Fast trigger proof check failed::Read-only ownership check could not complete. No messages were sent.');process.exitCode=1;}finally{if(db)await db.terminate();}
