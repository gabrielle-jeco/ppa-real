import test from 'node:test';
import assert from 'node:assert/strict';
import {getMobileEvidenceAccess} from '../src/utils/mobileTaskEvidence.ts';
const now=new Date('2026-11-27T12:00:00');
const base={start_at:'2026-11-27T08:00:00',due_at:'2026-11-27T17:00:00',status:'pending',evidences:[],review_summary:{can_upload_after:true}};
const access=(task,options={})=>getMobileEvidenceAccess(task,{now,resultOnly:true,...options});
test('result-only task accepts after evidence and never asks for before',()=>{
 const state=access(base);assert.equal(state.canUploadBefore,false);assert.equal(state.canUploadAfter,true);assert.equal(state.isReadOnly,false);
});
test('future, approved and historical task are readonly despite permissive summary',()=>{
 for(const task of [{...base,start_at:'2026-11-27T13:00:00'},{...base,status:'approved'},{...base,_selected_date:'2026-11-26'}])assert.equal(access(task).isReadOnly,true);
});
test('expired initial task, pending proof, and exhausted attempts obey server upload lock',()=>{
 for(const task of [{...base,due_at:'2026-11-27T10:00:00'},{...base,evidences:[{type:'after',review_status:'pending'}]},{...base,status:'rejected',evidences:Array(3).fill({type:'after',review_status:'rejected'})}])assert.equal(access({...task,review_summary:{can_upload_after:false}}).isReadOnly,true);
});
test('authorized rejected revision stays writable after original deadline',()=>{
 const state=access({...base,due_at:'2026-11-27T10:00:00',status:'rejected',evidences:[{type:'after',review_status:'rejected'}]});assert.equal(state.canUploadAfter,true);assert.equal(state.isReadOnly,false);
});
test('crew retains before/after access and explicit readOnly restriction',()=>{
 assert.equal(access(base,{resultOnly:false}).canUploadBefore,true);
 assert.equal(access({...base,evidences:[{type:'before'}]},{resultOnly:false}).canUploadBefore,false);
 assert.equal(access(base,{readOnly:true}).isReadOnly,true);
});
test('fallback without server summary blocks past due and three after evidences',()=>{
 assert.equal(access({...base,review_summary:undefined,due_at:'2026-11-27T10:00:00'}).canUploadAfter,false);
 assert.equal(access({...base,review_summary:undefined,evidences:Array(3).fill({type:'after'})}).canUploadAfter,false);
});
