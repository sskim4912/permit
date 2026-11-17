// One API instance, one identity scope, memory only. Never persisted across sessions.
export function createRequestCache({loadAll,loadOne,clock=Date.now,ttl=60000}) {
 let scope='',rows=null,loadedAt=0,epoch=0,pending=null;const dirty=new Set();
 const clear=()=>{epoch++;rows=null;pending=null;dirty.clear();};
 return {
  clear,
  changed(ids){epoch++;pending=null;for(const id of ids)dirty.add(id);},
  async read(identity,{force=false}={}) {
   if(identity!==scope){clear();scope=identity;}
   if(force)clear();
   if(pending)return structuredClone(await pending);
   if(rows&&clock()-loadedAt<ttl&&!dirty.size)return structuredClone(rows);
   const base=rows,generation=epoch,ids=[...dirty],full=!rows||clock()-loadedAt>=ttl;
   const task=(async()=>{
    const next=full?await loadAll():await Promise.all(ids.map(loadOne)).then(changes=>{
     const map=new Map(base.map(row=>[row.id,row]));
     ids.forEach((id,i)=>{if(changes[i])map.set(id,changes[i]);else map.delete(id);});
     return [...map.values()].sort((a,b)=>b.created.localeCompare(a.created)||b.id.localeCompare(a.id));
    });
    if(generation===epoch){rows=next;if(full)loadedAt=clock();dirty.clear();}
    if(generation!==epoch)throw Error('목록 확인 중 세션 또는 자료가 변경되었습니다. 다시 확인해 주세요.');
    return next;
   })();pending=task;
   try{return structuredClone(await task);}catch(error){if(generation===epoch)clear();throw error;}finally{if(pending===task)pending=null;}
  }
 };
}
