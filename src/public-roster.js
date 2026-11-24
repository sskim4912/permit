import {maskName,maskLastFour} from './privacy-mask.js';

const PUBLIC_FIELDS=['visit_date','visit_end_date','purpose','team','status','version','created','vehicle_type','vehicle_name','role','shoes','gate'];
export const maskBirth=value=>/^19/.test(String(value))?'19**-**-**':/^20/.test(String(value))?'20**-**-**':'****-**-**';
const publicStamp=stamp=>stamp?{by:maskName(stamp.by),at:stamp.at}:null;
export function publicRoster(item){
 return {
  ...Object.fromEntries(PUBLIC_FIELDS.filter(key=>key in item).map(key=>[key,item[key]])),
  privacy_version:1,
  name:maskName(item.name),phone:maskLastFour(item.phone),plate:maskLastFour(item.plate),reviewer:maskName(item.reviewer),
  birth_mask:maskBirth(item.birth),lunch:item.lunch||'',
  gaisu_requested:publicStamp(item.gaisu_requested),gaisu_approved:publicStamp(item.gaisu_approved),final_approved:publicStamp(item.final_approved)
 };
}
