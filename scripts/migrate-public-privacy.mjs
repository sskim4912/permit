import {initializeApp} from 'firebase-admin/app';
import {FieldValue,getFirestore} from 'firebase-admin/firestore';
import {defaultTeams} from '../functions/lib/directory.js';
import {publicRoster} from '../src/public-roster.js';
import {publicTeam} from '../src/privacy-mask.js';

const projectId='permit-daesan-461e8';
const db=getFirestore(initializeApp({projectId}));
const migration=db.doc('settings/publicPrivacyMigration');
if((await migration.get()).exists){
  console.log('Masked public data already migrated');
  process.exit(0);
}
const meta=db.doc('settings/contactDirectory');
await db.runTransaction(async tx=>{
  const directory=await tx.get(meta);
  const privateTeams=await tx.get(db.collection('contactTeams'));
  const publicTeams=await tx.get(db.collection('publicContactTeams'));
  const teams=directory.exists?privateTeams.docs.map(doc=>({id:doc.id,...doc.data()})):defaultTeams;
  for(const previous of publicTeams.docs)if(!teams.some(team=>team.id===previous.id))tx.delete(previous.ref);
  for(const team of teams){
    if(!directory.exists){const {id,...record}=team;tx.set(db.doc('contactTeams/'+id),record);}
    const {id,...masked}=publicTeam(team);
    tx.set(db.doc('publicContactTeams/'+id),masked);
  }
  tx.set(meta,{version:(directory.data()?.version??0)+1,modified_at:FieldValue.serverTimestamp()});
});
let migrated=0;
for await(const original of db.collection('requests').select().stream()){
  const updated=await db.runTransaction(async tx=>{
    const latest=await tx.get(original.ref);
    if(!latest.exists)return false;
    tx.set(db.doc('publicRequests/'+original.id),publicRoster(latest.data()));
    return true;
  });
  if(updated)migrated++;
}
await migration.set({completed_at:FieldValue.serverTimestamp()});
console.log('Masked public request records:',migrated);
