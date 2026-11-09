import template from './seetec-template.json' with {type:'json'};

// Original BIFF8 fonts/XFs/palette are retained. No server or visitor data leaves the browser.
const bytes=(length)=>new Uint8Array(length);
const view=data=>new DataView(data.buffer,data.byteOffset,data.byteLength);
const word=value=>{const data=bytes(2);view(data).setUint16(0,value,true);return data;};
const join=parts=>{const data=bytes(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const part of parts){data.set(part,at);at+=part.length;}return data;};
const record=(id,data=bytes(0))=>join([word(id),word(data.length),data]);
const decode=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
const unicode=text=>{const data=bytes(text.length*2);for(let i=0;i<text.length;i++)view(data).setUint16(i*2,text.charCodeAt(i),true);return data;};
const widths=[11,10,16,13,14,10,10,2.5,16,2.5,14,16,18];
export function seetecValues(row){
 const birth=String(row.birth||'');
 return [row.name||'',/^\d{4}-\d{2}-\d{2}$/.test(birth)?birth.slice(2).replaceAll('-',''):'',row.purpose||'',row.plate||'',row.vehicle_name||'','','','','','','',row.phone||'',''].map(String);
}
function cell(row,col,style,text){
 const address=join([word(row),word(col),word(style)]);
 // BIFF LABEL is a literal UTF-16 string, never a formula, including leading '=' or '+'.
 return text?record(0x0204,join([address,word(text.length),new Uint8Array([1]),unicode(text)])):record(0x0201,address);
}
function rowRecord(index,height){const data=bytes(16),v=view(data);v.setUint16(0,index,true);v.setUint16(4,13,true);v.setUint16(6,Math.round(height*20),true);v.setUint32(12,0x140,true);return record(0x0208,data);}
function margin(id,value){const data=bytes(8);view(data).setFloat64(0,value,true);return record(id,data);}
function worksheet(rows){
 const bof=bytes(16),b=view(bof);b.setUint16(0,0x0600,true);b.setUint16(2,0x0010,true);b.setUint16(4,0x0dbb,true);b.setUint16(6,0x07cc,true);
 const setup=bytes(34),s=view(setup);[9,100,1,1,1,0,600,600].forEach((n,i)=>s.setUint16(i*2,n,true));s.setFloat64(16,0.1,true);s.setFloat64(24,0.1,true);s.setUint16(32,1,true);
 const dim=bytes(14);view(dim).setUint32(4,rows.length+1,true);view(dim).setUint16(10,13,true);
 const parts=[record(0x0809,bof),record(0x0081,word(0x05c0)),record(0x002a,word(0)),record(0x002b,word(0)),record(0x0083,word(1)),record(0x0084,word(0)),margin(0x0026,0.2),margin(0x0027,0.2),margin(0x0028,0.25),margin(0x0029,0.25),record(0x00a1,setup)];
 widths.forEach((width,col)=>{const data=bytes(12),v=view(data);v.setUint16(0,col,true);v.setUint16(2,col,true);v.setUint16(4,Math.round(width*256),true);parts.push(record(0x007d,data));});
 parts.push(record(0x0200,dim),rowRecord(0,32));
 template.headers.forEach((text,col)=>parts.push(cell(0,col,template.headerStyles[col],text)));
 // Larger lists still fit a single page; every visitor is retained without truncation.
 const height=Math.min(30,Math.max(0.05,Math.min(Math.max(16,480/Math.max(1,rows.length)),3000/rows.length)));
 rows.forEach((data,index)=>{parts.push(rowRecord(index+1,height));seetecValues(data).forEach((text,col)=>parts.push(cell(index+1,col,template.dataStyles[col],text)));});
 // Normal worksheet view with gridlines hidden; borders come from the original template.
 const window=bytes(18);view(window).setUint16(0,0x06b4,true);parts.push(record(0x023e,window),record(0x000a));return join(parts);
}
function compoundFile(workbook){
 // CFB v3 regular stream with FAT and optional DIFAT; compatible with genuine Excel 97–2003 .xls.
 const FREE=0xffffffff,END=0xfffffffe,FAT=0xfffffffd,DIF=0xfffffffc;
 const streamSize=Math.max(4096,workbook.length),count=Math.ceil(streamSize/512);let fats=1,difs=0;
 for(;;){const nextFats=Math.ceil((1+count+fats+difs)/128),nextDifs=Math.max(0,Math.ceil((nextFats-109)/127));if(nextFats===fats&&nextDifs===difs)break;fats=nextFats;difs=nextDifs;}
 const file=bytes((2+count+fats+difs)*512),header=view(file.subarray(0,512));
 file.set([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]);header.setUint16(24,0x003e,true);header.setUint16(26,3,true);header.setUint16(28,0xfffe,true);header.setUint16(30,9,true);header.setUint16(32,6,true);header.setUint32(44,fats,true);header.setUint32(48,0,true);header.setUint32(56,4096,true);header.setUint32(60,END,true);header.setUint32(68,difs?1+count+fats:END,true);header.setUint32(72,difs,true);
 for(let i=0;i<109;i++)header.setUint32(76+i*4,i<fats?1+count+i:FREE,true);
 function directory(offset,name,type,child,start,size){const data=file.subarray(512+offset,512+offset+128),v=view(data);data.set(unicode(name+'\0'));v.setUint16(64,(name.length+1)*2,true);data[66]=type;data[67]=1;v.setUint32(68,FREE,true);v.setUint32(72,FREE,true);v.setUint32(76,child,true);v.setUint32(116,start,true);v.setUint32(120,size,true);}
 directory(0,'Root Entry',5,1,END,0);directory(128,'Workbook',2,FREE,1,streamSize);file.set(workbook,1024);
 const table=Array(fats*128).fill(FREE);table[0]=END;for(let i=1;i<=count;i++)table[i]=i===count?END:i+1;
 for(let i=0;i<fats;i++)table[1+count+i]=FAT;for(let i=0;i<difs;i++)table[1+count+fats+i]=DIF;
 table.forEach((value,i)=>view(file).setUint32((2+count)*512+i*4,value,true));
 for(let i=0;i<difs;i++){const at=(2+count+fats+i)*512;for(let j=0;j<127;j++){const index=109+i*127+j;view(file).setUint32(at+j*4,index<fats?1+count+index:FREE,true);}view(file).setUint32(at+508,i===difs-1?END:2+count+fats+i,true);}
 return file;
}
export async function createSeetecWorkbook(rows){
 if(!Array.isArray(rows)||!rows.length)throw Error('다운로드할 내역이 없습니다.');
 if(rows.length>65535)throw Error('원본 XLS 양식에는 65,535명까지 저장할 수 있습니다. 조회 기간을 나눠 다운로드해 주세요.');
 const globals=template.records.map(([id,data])=>({id,data:decode(data)}));
 // Excel/Calc enforce a minimum print scaling. Compact unusually long lists before scaling.
 const height=Math.min(30,Math.max(0.05,Math.min(Math.max(16,480/rows.length),3000/rows.length)));
 if(height<16){
  const fonts=globals.filter(r=>r.id===0x0031),font={id:0x0031,data:fonts[6].data.slice()};
  view(font.data).setUint16(0,Math.max(1,Math.floor(Math.min(11,height*0.65)*20)),true);
  const fontIndex=fonts.length>=4?fonts.length+1:fonts.length;
  let index=0;for(const item of globals)if(item.id===0x00e0){if(template.dataStyles.includes(index))view(item.data).setUint16(0,fontIndex,true);index++;}
  globals.splice(globals.findIndex(r=>r.id===0x00e0),0,font);
 }
 // Explicitly bound the print area, including the template's two empty spacer columns.
 const area=bytes(27),a=view(area);a.setUint16(0,0x20,true);area[3]=1;a.setUint16(4,11,true);a.setUint16(8,1,true);area[15]=6;area[16]=0x3b;a.setUint16(21,rows.length,true);a.setUint16(25,12,true);
 globals.push({id:0x01ae,data:join([word(1),new Uint8Array([1,4])])},{id:0x0017,data:join([word(1),word(0),word(0),word(0)])},{id:0x0018,data:area});
 const offset=globals.reduce((n,r)=>n+4+r.data.length,4);
 for(const item of globals)if(item.id===0x0085)view(item.data).setUint32(0,offset,true);
 return compoundFile(join([...globals.map(r=>record(r.id,r.data)),record(0x000a),worksheet(rows)]));
}
