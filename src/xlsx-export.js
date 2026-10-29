import ExcelJS from 'exceljs';

export async function createApplicantWorkbook(rows) {
 const workbook=new ExcelJS.Workbook();
 const sheet=workbook.addWorksheet('출입신청 명단',{views:[{state:'frozen',ySplit:1}],pageSetup:{paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:1'}});
 sheet.columns=[{header:'순번',width:8},{header:'출입날짜',width:27},{header:'이름',width:14},{header:'생년월일',width:16},{header:'휴대전화번호',width:20},{header:'차량번호',width:18},{header:'차종',width:16},{header:'운전자\n해당여부',width:17},{header:'안전화',width:14}];
 rows.forEach((row,index)=>{
  const end=row.visit_end_date||row.visit_date;
  sheet.addRow([index+1,row.visit_date===end?row.visit_date:`${row.visit_date} ~ ${end}`,row.name||'',row.birth||'',row.phone||'',row.plate||'',row.vehicle_type||'',row.role||'',row.shoes==='필요없음'?'필요없음':row.shoes?`${row.shoes}mm`:'']);
 });
 while(sheet.rowCount<6)sheet.addRow([sheet.rowCount]);
 sheet.eachRow(row=>{
  row.height=row.number===1?44:30;
  for(let col=1;col<=9;col++){
   const cell=row.getCell(col);cell.font={name:'맑은 고딕',size:11,bold:row.number===1};
   cell.alignment={horizontal:'center',vertical:'middle',wrapText:true};
   const edge={style:'thin',color:{argb:'FFAAAAAA'}};cell.border={top:edge,bottom:edge,left:edge,right:edge};
   if(row.number===1)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFD0D0D0'}};
   if(row.number>1&&col>1)cell.numFmt='@';
  }
 });
 configurePrint(sheet,9,rows.length);
 return workbook.xlsx.writeBuffer();
}

export async function createDetailedWorkbook(rows) {
 const book=new ExcelJS.Workbook();
 const sheet=book.addWorksheet('상세 내역',{views:[{state:'frozen',ySplit:1,xSplit:1}],pageSetup:{paperSize:8,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:1'}});
 const columns=[['번호',8],['방문시작일',15],['방문종료일',15],['방문목적',28],['요청팀',16],['출입위치',13],['이름',15],['생년월일',15],['휴대전화',19],['차량번호',17],['차종',13],['차명',17],['탑승 구분',14],['안전화',13],['진행 상태',14],['기존 상태값',16],['발주처 전달시각',25],['최초 작성자',16],['최근 수정자',16],['최근 수정시각',25],['처리자',16],['등록시각',25]];
 sheet.columns=columns.map(([header,width])=>({header,width}));
 const localTime=value=>{if(!value)return '';const d=new Date(value);return Number.isNaN(d.getTime())?String(value):new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(d);};
 rows.forEach((r,i)=>sheet.addRow([i+1,r.visit_date||'',r.visit_end_date||r.visit_date||'',r.purpose||'',r.team||'',r.gate||'',r.name||'',r.birth||'',r.phone||'',r.plate||'',r.vehicle_type||'',r.vehicle_name||'',r.role||'',r.shoes==='필요없음'?'필요없음':r.shoes?`${r.shoes}mm`:'',r.status==='승인 완료'?'승인 완료':'승인 대기',r.status||'',localTime(r.delivery_at),r.author_name||'',r.modified_by||'',localTime(r.modified_at),r.reviewer||'',localTime(r.created)]));
 while(sheet.rowCount<6)sheet.addRow([sheet.rowCount]);
 sheet.eachRow(row=>{row.height=row.number===1?36:30;for(let col=1;col<=columns.length;col++){
  const cell=row.getCell(col);cell.font={name:'맑은 고딕',size:11,bold:row.number===1};cell.alignment={horizontal:'center',vertical:'middle',wrapText:true};
  const edge={style:'thin',color:{argb:'FFAAAAAA'}};cell.border={top:edge,bottom:edge,left:edge,right:edge};
  if(row.number===1)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFD0D0D0'}};else if(col>1)cell.numFmt='@';
 }});
 sheet.autoFilter={from:'A1',to:'V'+Math.max(2,rows.length+1)};
 configurePrint(sheet,22,rows.length);
 return book.xlsx.writeBuffer();
}

function configurePrint(sheet,columnCount,peopleCount){
 sheet.pageSetup={...sheet.pageSetup,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:peopleCount<=15?1:0,printTitlesRow:'1:1',horizontalCentered:true,printArea:'A1:'+sheet.getColumn(columnCount).letter+sheet.rowCount,margins:{left:0.25,right:0.25,top:0.3,bottom:0.3,header:0.15,footer:0.15}};
 sheet.headerFooter.oddFooter='&C&P / &N';
}
