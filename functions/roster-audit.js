import {initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
let db;
try{
 const date=process.argv[2];if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))throw Error('조회 날짜를 YYYY-MM-DD로 지정해 주세요.');
 initializeApp({projectId:'permit-daesan-461e8'});db=getFirestore();const rows=await db.collection('requests').select('visit_date','visit_end_date','status').get();const summary={total:rows.size,date,startingOnDate:0,coveringDate:0,statuses:{}};
 for(const doc of rows.docs){const row=doc.data();if(row.visit_date===date)summary.startingOnDate++;if(row.visit_date<=date&&(row.visit_end_date||row.visit_date)>=date){summary.coveringDate++;const status=['승인 완료','승인 대기','현장 제출','현장 확인','발주처 제출'].includes(row.status)?row.status:'기타';summary.statuses[status]=(summary.statuses[status]||0)+1;}}
 console.log('::notice title=Roster date coverage::'+JSON.stringify(summary));console.log('읽기 전용 조회입니다. 신청 원본·문자 발송 상태를 변경하지 않았으며 이름·연락처는 출력하지 않았습니다.');
}catch(e){console.error('::error title=Roster audit failed::'+(e.code?'신청 조회 권한 또는 연결을 확인해 주세요.':e.message));process.exitCode=1;}finally{if(db)await db.terminate();}
