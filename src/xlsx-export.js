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
 return workbook.xlsx.writeBuffer();
}
