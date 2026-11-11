"""Independent XLS reader: compare the retained Aurora form against the supplied source."""
import base64,json,struct,sys,xlrd
from pathlib import Path
from xlrd.compdoc import CompDoc
request=json.load(sys.stdin);raw=base64.b64decode(request['file']);book=xlrd.open_workbook(file_contents=raw,formatting_info=True);sheet=book.sheet_by_index(0)
source=(Path(__file__).resolve().parents[1]/'public/templates/Aurora.xls').read_bytes();original=xlrd.open_workbook(file_contents=source,formatting_info=True).sheet_by_index(0)
def records(raw):
 stream=CompDoc(raw).get_named_stream('Workbook');pos=0;result=[]
 while pos+4<=len(stream):
  code,size=struct.unpack_from('<HH',stream,pos);data=stream[pos+4:pos+4+size];pos+=4+size;result.append((code,data))
  if code==10 and sum(c==10 for c,_ in result)==2:break
 return result
actual_records=records(raw);source_records=records(source)
for code in (0x0031,0x00e0,0x0092):
 expected=[d for c,d in source_records if c==code];actual=[d for c,d in actual_records if c==code]
 assert actual[:len(expected)]==expected,'Original fonts/styles/palette changed'
for r in range(5):
 assert sheet.row_values(r)==original.row_values(r),'Original header/example/instruction row changed'
 assert sheet.rowinfo_map[r].height==original.rowinfo_map[r].height
 for c in range(13):assert sheet.cell_xf_index(r,c)==original.cell_xf_index(r,c),'Original cell format changed'
assert [(k,vars(v)) for k,v in sheet.colinfo_map.items()]==[(k,vars(v)) for k,v in original.colinfo_map.items()],'Original column widths/styles changed'
setup=None;fit=False
for code,data in actual_records:
 if code==0x00a1:
  paper,scale,start,width,height,flags=struct.unpack_from('<6H',data);setup={'paper':paper,'width':width,'height':height,'landscape':not bool(flags&2)}
 if code==0x0081:fit=bool(struct.unpack_from('<H',data)[0]&0x0100)
print(json.dumps({'sheets':book.nsheets,'rows':sheet.nrows,'cols':sheet.ncols,'prefixPreserved':True,'headers':sheet.row_values(0),'data':[sheet.row_values(r) for r in range(5,sheet.nrows)],'types':[[sheet.cell_type(r,c) for c in range(13)] for r in range(5,sheet.nrows)],'headerColors':[book.font_list[book.xf_list[sheet.cell_xf_index(0,c)].font_index].colour_index for c in range(13)],'fill':book.xf_list[sheet.cell_xf_index(5,0)].background.fill_pattern,'borders':[book.xf_list[sheet.cell_xf_index(5,0)].border.left_line_style,book.xf_list[sheet.cell_xf_index(5,0)].border.right_line_style],'setup':setup,'fit':fit,'printArea':book.name_map['print_area'][0].result.text},ensure_ascii=False))
