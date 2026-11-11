"""Extract the approved Aurora BIFF8 template without restyling it (requires xlrd)."""
from pathlib import Path
import base64,hashlib,json,struct,xlrd
from xlrd.compdoc import CompDoc
root=Path(__file__).resolve().parents[1]
source=(root/'public/templates/Aurora.xls').read_bytes()
book=xlrd.open_workbook(file_contents=source,formatting_info=True)
assert book.nsheets==1,'The upload template must contain one worksheet.'
sheet=book.sheet_by_index(0)
assert sheet.ncols==13 and sheet.cell_value(0,0)=='성명' and sheet.cell_value(0,11)=='휴대폰','Unexpected upload template columns.'
assert sheet.nrows>=6 and all(sheet.cell_value(5,c)=='' for c in range(13)),'A6:M6 must be an empty input row.'
stream=CompDoc(source).get_named_stream('Workbook');records=[];worksheet=[];pos=0;in_sheet=False
while pos+4<=len(stream):
 code,size=struct.unpack_from('<HH',stream,pos);data=stream[pos+4:pos+4+size];pos+=4+size
 assert len(data)==size
 if code==0x000a:
  if in_sheet:break
  in_sheet=True;continue
 if in_sheet:worksheet.append((code,data))
 elif code!=0x00ff:records.append((code,data)) # EXTSST is only an optional offset cache.
cell_ids={0x00fd,0x0201,0x0204,0x0203,0x027e,0x00bd,0x00be,0x0006,0x0205}
prefix=[];cells=[];suffix=[];prefix_rows=[]
for code,data in worksheet:
 if code==0x0200:continue
 if code==0x0208:
  if struct.unpack_from('<H',data)[0]<5:prefix_rows.append((code,data))
  continue
 if code in {0x020b,0x00d7}:continue # Rebuild dimensions/row positions, never reuse stale offsets.
 if code in cell_ids:
  if struct.unpack_from('<H',data)[0]<5:cells.append((code,data))
 elif code in {0x023e,0x0088b,0x00a0,0x001d,0x00ef,0x01b8,0x0867}:suffix.append((code,data))
 elif code!=0x004d:prefix.append((code,data)) # Printer-specific device blobs are not part of the form.
encode=lambda bs:base64.b64encode(bs).decode()
encode_records=lambda rs:[[code,encode(data)] for code,data in rs]
result={'sourceSha256':hashlib.sha256(source).hexdigest(),'sheetName':sheet.name,'startRow':5,'minimumRows':sheet.nrows,
 'records':encode_records(records),'sheetPrefix':encode_records(prefix),'prefixCells':encode_records(cells),'prefixRows':encode_records(prefix_rows),'sheetSuffix':encode_records(suffix),
 'headers':[sheet.cell_value(0,c) for c in range(13)],'headerStyles':[sheet.cell_xf_index(0,c) for c in range(13)],
 'prefixValues':[[sheet.cell_value(r,c) for c in range(13)] for r in range(5)],
 'bodyStyles':[[sheet.cell_xf_index(r,c) for c in range(13)] for r in range(5,sheet.nrows)],
 'rowHeights':[sheet.rowinfo_map[r].height/20 if r in sheet.rowinfo_map else 16.5 for r in range(sheet.nrows)]}
(root/'src/seetec-template.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n')
print('Aurora template extracted: original first five rows, original styles/widths, data starts at A6.')
