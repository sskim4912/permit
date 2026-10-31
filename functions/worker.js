import {initializeApp} from 'firebase-admin/app';
import {getFirestore,Timestamp} from 'firebase-admin/firestore';
import {validateNotificationConfig} from './lib/config.js';
import {processNotificationQueue} from './lib/queue.js';
let db;
try{
 let config;try{config=JSON.parse(process.env.PERMIT_NOTIFICATION_CONFIG||'');}catch(e){throw Error('GitHub의 PERMIT_NOTIFICATION_CONFIG 형식을 확인해 주세요.');}validateNotificationConfig(config);
 initializeApp({projectId:'permit-daesan-461e8'});db=getFirestore();const result=await processNotificationQueue({db,Timestamp,config});console.log(`알림 처리 완료: 조회 ${result.scanned}개, 처리 ${result.processed}개. 수신자와 비밀값은 로그에 기록하지 않습니다.`);
}catch(error){const message=error.code===7?'Firestore 데이터 접근 권한이 필요합니다. GitHub 배포 서비스 계정에 Cloud Datastore User 역할을 추가해 주세요.':error.code?'알림 작업의 Firestore 연결을 확인해 주세요.':error.message;console.error(message);if(process.env.GITHUB_ACTIONS==='true')console.log('::error title=Notification worker failed::'+message.replace(/%/g,'%25').replace(/\r/g,'%0D').replace(/\n/g,'%0A'));process.exitCode=1;
}finally{if(db)await db.terminate();}
