const PUBLIC_FIELDS=['visit_date','visit_end_date','purpose','team','status','reviewer','version','created','name','phone','plate','vehicle_type','vehicle_name','role','shoes','gate'];
export const maskBirth=value=>/^19/.test(String(value))?'19**-**-**':/^20/.test(String(value))?'20**-**-**':'****-**-**';
export function publicRoster(item){return {...Object.fromEntries(PUBLIC_FIELDS.filter(key=>key in item).map(key=>[key,item[key]])),birth_mask:maskBirth(item.birth)};}
