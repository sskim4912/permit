"""Independent XLS reader used by the export tests; no production application data."""
import base64,json,struct,sys,xlrd
from xlrd.compdoc import CompDoc
request=json.load(sys.stdin);raw=base64.b64decode(request['file']);book=xlrd.open_workbook(file_contents=raw,formatting_info=True);sheet=book.sheet_by_index(0)
stream=CompDoc(raw).get_named_stream('Workbook');pos=0;setup=None;fit=False
while pos+4<=len(stream):
 code,size=struct.unpack_from('<HH',stream,pos);data=stream[pos+4:pos+4+size];pos+=4+size
 if code==0x00a1:
  paper,scale,start,width,height,flags=struct.unpack_from('<6H',data);setup={'paper':paper,'width':width,'height':height,'landscape':not bool(flags&2)}
 if code==0x0081:fit=bool(struct.unpack_from('<H',data)[0]&0x0100)
print(json.dumps({'sheets':book.nsheets,'rows':sheet.nrows,'cols':sheet.ncols,'headers':sheet.row_values(0),'data':[sheet.row_values(r) for r in range(1,sheet.nrows)],'types':[[sheet.cell_type(r,c) for c in range(13)] for r in range(1,sheet.nrows)],'headerColors':[book.font_list[book.xf_list[sheet.cell_xf_index(0,c)].font_index].colour_index for c in range(13)],'fill':book.xf_list[sheet.cell_xf_index(1,0)].background.fill_pattern,'borders':[book.xf_list[sheet.cell_xf_index(1,0)].border.left_line_style,book.xf_list[sheet.cell_xf_index(1,0)].border.right_line_style],'setup':setup,'fit':fit,'printArea':book.name_map['print_area'][0].result.text},ensure_ascii=False))
