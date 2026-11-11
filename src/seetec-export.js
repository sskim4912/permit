import template from './seetec-template.json' with {type:'json'};

// Original BIFF8 fonts/XFs/palette are retained. No server or visitor data leaves the browser.
const bytes=(length)=>new Uint8Array(length);
const view=data=>new DataView(data.buffer,data.byteOffset,data.byteLength);
const word=value=>{const data=bytes(2);view(data).setUint16(0,value,true);return data;};
const join=parts=>{const data=bytes(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const part of parts){data.set(part,at);at+=part.length;}return data;};
const record=(id,data=bytes(0))=>join([word(id),word(data.length),data]);
const decode=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
const unicode=text=>{const data=bytes(text.length*2);for(let i=0;i<text.length;i++)view(data).setUint16(i*2,text.charCodeAt(i),true);return data;};
const sourceRecords=records=>records.map(([id,data])=>({id,data:decode(data)}));
const bodyHeight=rows=>Math.min(template.rowHeights[template.startRow],3000/rows.length);
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
function worksheet(rows,styleMap){
 const rowCount=Math.max(template.minimumRows,template.startRow+rows.length);
 const dim=bytes(14);view(dim).setUint32(4,rowCount,true);view(dim).setUint16(10,13,true);
 const prefix=sourceRecords(template.sheetPrefix);
 for(const item of prefix){
  // The upload layout stays identical; retain the existing A4 one-page print option.
  if(item.id===0x0081)view(item.data).setUint16(0,view(item.data).getUint16(0,true)|0x100,true);
  if(item.id===0x00a1){const v=view(item.data);v.setUint16(0,9,true);v.setUint16(6,1,true);v.setUint16(8,1,true);v.setUint16(10,v.getUint16(10,true)&~0x46,true);}
 }
 const parts=prefix.map(r=>record(r.id,r.data));parts.push(record(0x0200,dim));
 parts.push(...sourceRecords(template.prefixRows).map(r=>record(r.id,r.data)));
 parts.push(...sourceRecords(template.prefixCells).map(r=>record(r.id,r.data)));
 for(let r=template.startRow;r<rowCount;r++){
  const index=r-template.startRow,hasData=index<rows.length;
  const styles=template.bodyStyles[index]||template.bodyStyles[0];
  parts.push(rowRecord(r,hasData?bodyHeight(rows):template.rowHeights[r]||template.rowHeights[template.startRow]));
  const values=hasData?seetecValues(rows[index]):Array(13).fill('');
  values.forEach((text,col)=>parts.push(cell(r,col,hasData?(styleMap.get(styles[col])??styles[col]):styles[col],text)));
 }
 parts.push(...sourceRecords(template.sheetSuffix).map(r=>record(r.id,r.data)),record(0x000a));return join(parts);
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
 if(rows.length>65536-template.startRow)throw Error('원본 XLS 양식에는 65,531명까지 저장할 수 있습니다. 조회 기간을 나눠 다운로드해 주세요.');
 const globals=sourceRecords(template.records),styleMap=new Map();
 // Compact only newly written data when necessary. Never mutate a source font/XF used by rows 1–5.
 const height=bodyHeight(rows);
 if(height<template.rowHeights[template.startRow]){
  const fonts=globals.filter(r=>r.id===0x0031),xfs=globals.filter(r=>r.id===0x00e0),fontMap=new Map(),newFonts=[],newXfs=[];
  for(const style of new Set(template.bodyStyles.flat())){
   const xf=xfs[style].data.slice(),oldFont=view(xf).getUint16(0,true);
   if(!fontMap.has(oldFont)){
    const font={id:0x0031,data:fonts[oldFont>4?oldFont-1:oldFont].data.slice()},index=fonts.length+1+newFonts.length;
    view(font.data).setUint16(0,Math.max(1,Math.min(view(font.data).getUint16(0,true),Math.floor(height*0.65*20))),true);
    fontMap.set(oldFont,index);newFonts.push(font);
   }
   view(xf).setUint16(0,fontMap.get(oldFont),true);styleMap.set(style,xfs.length+newXfs.length);newXfs.push({id:0x00e0,data:xf});
  }
  globals.splice(globals.findIndex(r=>r.id===0x00e0),0,...newFonts);globals.push(...newXfs);
 }
 const lastRow=Math.max(template.minimumRows,rows.length+template.startRow)-1;
 const area=bytes(27),a=view(area);a.setUint16(0,0x20,true);area[3]=1;a.setUint16(4,11,true);a.setUint16(8,1,true);area[15]=6;area[16]=0x3b;a.setUint16(21,lastRow,true);a.setUint16(25,12,true);
 globals.push({id:0x01ae,data:join([word(1),new Uint8Array([1,4])])},{id:0x0017,data:join([word(1),word(0),word(0),word(0)])},{id:0x0018,data:area});
 const offset=globals.reduce((n,r)=>n+4+r.data.length,4);
 for(const item of globals)if(item.id===0x0085)view(item.data).setUint32(0,offset,true);
 return compoundFile(join([...globals.map(r=>record(r.id,r.data)),record(0x000a),worksheet(rows,styleMap)]));
}
