import test from 'node:test';
import assert from 'node:assert/strict';
import {assignmentRequest, buildManagerTaskPayload, validateEvidenceFile, validateAssignmentSchedule} from '../src/utils/managerAssignments.ts';

test('bulk maps supervisors and preserves numeric target as text',()=>{
 const data=buildManagerTaskPayload({title:'Arahan',target:'0020',note:'',startDate:'2026-11-27',endDate:'2026-11-28',startTime:'08:00',dueTime:'17:00',repeatDays:[5,6],supervisorIds:['001','002']},true);
 assert.equal(data.target,'0020'); assert.deepEqual(data.supervisor_ids,['001','002']); assert.equal(data.task_context,'manager_supervisor'); assert.equal('crew_ids' in data,false);
});
test('individual uses one recipient and a same-day deadline',()=>{
 const data=buildManagerTaskPayload({title:'Arahan',target:'Hasil',note:'',startDate:'2026-11-27',endDate:'2026-11-28',startTime:'08:00',dueTime:'17:00',repeatDays:[],supervisorIds:['001']},false);
 assert.equal(data.supervisor_id,'001'); assert.equal(data.due_at,'2026-11-27 17:00:00');
});
test('file validation accepts one photo or XLSX and rejects executable/oversized file',()=>{
 assert.equal(validateEvidenceFile({name:'a.xlsx',size:1024}),null);
 assert.equal(validateEvidenceFile({name:'a.png',size:1024}),null);
 assert.ok(validateEvidenceFile({name:'a.exe',size:1024})); assert.ok(validateEvidenceFile({name:'a.xlsx',size:11*1024*1024}));
});
test('schedule includes today and six days ahead only',()=>{
 const now=new Date('2026-11-27T07:00:00');
 assert.equal(validateAssignmentSchedule('2026-12-03','2026-12-03','08:00','17:00',now),null);
 assert.ok(validateAssignmentSchedule('2026-12-04','2026-12-04','08:00','17:00',now));
 assert.ok(validateAssignmentSchedule('2026-11-27','2026-11-27','18:00','17:00',now));
});

test('invalid upload response gives a recovery message without exposing raw PHP output',async t=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=> 'qa-only'}});
 t.after(()=>{if(original)Object.defineProperty(globalThis,'localStorage',original);else delete globalThis.localStorage;});
 t.mock.method(globalThis,'fetch',async()=>new Response('<br>PHP Notice: temporary directory<br>{"id":1}',{status:200}));
 await assert.rejects(assignmentRequest('/api/manager/tasks/1/evidence'),error=>{
  assert.match(error.message,/Muat ulang daftar tugas/);assert.doesNotMatch(error.message,/PHP Notice|JSON.parse|Unexpected/);return true;
 });
});

test('assignment request retains structured server validation errors',async t=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=> 'qa-only'}});
 t.after(()=>{if(original)Object.defineProperty(globalThis,'localStorage',original);else delete globalThis.localStorage;});
 t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({errors:{after:['Tenggat tugas sudah lewat.']}}),{status:422}));
 await assert.rejects(assignmentRequest('/api/manager/tasks/1/evidence'),/Tenggat tugas sudah lewat/);
});


test('evidence HTTP errors preserve crew diagnostics instead of claiming a network failure', async t => {
 const original=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=> 'qa-only'}});
 t.after(()=>{if(original)Object.defineProperty(globalThis,'localStorage',original);else delete globalThis.localStorage;});
 t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({message:'Tenggat lewat.',error_code:'EVIDENCE_DEADLINE',reference_id:'qa-ref',server_time:'2026-11-27T12:00:00Z'}),{status:422}));
 await assert.rejects(assignmentRequest('/api/manager/tasks/1/evidence',{method:'POST',body:new FormData()}),error=>{
  assert.equal(error.name,'EvidenceUploadRequestError');assert.equal(error.status,422);assert.equal(error.payload.reference_id,'qa-ref');return true;
 });
});
