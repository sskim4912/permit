import {test} from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {createApplicantWorkbook} from '../src/xlsx-export.js';

test('xlsx roundtrip retains styled template, periods, phone zeros and literal formula-like text',async()=>{
 const bytes=await createApplicantWorkbook([{visit_date:'2026-10-28',visit_end_date:'2026-10-30',name:'예시 방문자',birth:'1990-01-01',phone:'010-0123-4567',plate:'=1+1',vehicle_type:'승용',role:'운전자',shoes:'270'}]);
 const book=new ExcelJS.Workbook();await book.xlsx.load(bytes);const sheet=book.worksheets[0];
 assert.equal(sheet.columnCount,9);assert.equal(sheet.rowCount,6);
 assert.equal(sheet.getCell('B2').value,'2026-10-28 ~ 2026-10-30');
 assert.equal(sheet.getCell('E2').value,'010-0123-4567');assert.equal(sheet.getCell('F2').type,ExcelJS.ValueType.String);assert.equal(sheet.getCell('F2').value,'=1+1');
 assert.equal(sheet.getCell('H2').value,'운전자');assert.equal(sheet.getCell('I2').value,'270mm');
 assert.equal(sheet.getCell('A1').fill.fgColor.argb,'FFD0D0D0');assert.equal(sheet.getCell('I6').border.bottom.style,'thin');
 assert.equal(sheet.pageSetup.orientation,'landscape');
});
test('xlsx includes every visitor beyond template minimum without truncation',async()=>{
 const book=new ExcelJS.Workbook();await book.xlsx.load(await createApplicantWorkbook(Array.from({length:12},(_,i)=>({visit_date:'2026-10-28',name:`방문자${i}`,shoes:'필요없음'}))));
 assert.equal(book.worksheets[0].rowCount,13);assert.equal(book.worksheets[0].getCell('A13').value,12);assert.equal(book.worksheets[0].getCell('I13').value,'필요없음');
});
