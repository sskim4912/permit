"""Extract the original BIFF8 formatting for the browser-only XLS exporter (requires xlrd)."""
from pathlib import Path
import base64,hashlib,json,struct,xlrd
from xlrd.compdoc import CompDoc
root=Path(__file__).resolve().parents[1]
source=(root/'public/templates/seetec-entry-original.xls').read_bytes()
book=xlrd.open_workbook(file_contents=source,formatting_info=True);sheet=book.sheet_by_index(0)
stream=CompDoc(source).get_named_stream('Workbook');records=[];pos=0;skip_strings=False
while pos+4<=len(stream):
 code,size=struct.unpack_from('<HH',stream,pos);data=stream[pos+4:pos+4+size];pos+=4+size
 if code in (0x00fc,0x00ff):skip_strings=code==0x00fc;continue
 if code==0x003c and skip_strings:continue
 skip_strings=False
 if code==0x000a:break
 # Keep original fonts, formats, borders and header fills; literal cell records replace examples.
 if code==0x00e0:
  data=bytearray(data);data[6]=(data[6]&0x80)|0x2a # centered, wrapped, vertically centered
  # Data row uses XF107: white fill instead of the grey example-only row.
  xf_index=sum(c==0x00e0 for c,_ in records)
  if xf_index in (107,109,115):
   value=struct.unpack_from('<I',data,14)[0]&0x03ffffff
   struct.pack_into('<I',data,14,value) # no fill pattern
  data=bytes(data)
 records.append((code,data))
encode=lambda bs:base64.b64encode(bs).decode()
result={'sourceSha256':hashlib.sha256(source).hexdigest(),'records':[[code,encode(data)] for code,data in records],
 'headers':[sheet.cell_value(0,c) for c in range(13)],'headerStyles':[sheet.cell_xf_index(0,c) for c in range(13)],
 'dataStyles':[sheet.cell_xf_index(2,c) for c in range(13)]}
(root/'src/seetec-template.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n')
print('Original template headers and formatting extracted; no application data included.')
