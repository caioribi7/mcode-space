const test=require('node:test'),assert=require('node:assert/strict');const {input,createTodos}=require('../electron/todos.cjs');
test('todo input validates dates, priority, title and ignores author input',()=>{
 assert.deepEqual(input({title:' Task ',notes:' Notes ',priority:'high',due_on:'2026-10-30',done:false,created_by:'forged'}),{title:'Task',notes:'Notes',priority:'high',due_on:'2026-10-30',done:false});
 for(const patch of [{title:''},{notes:'x'.repeat(2001)},{priority:'invalid'},{due_on:'2026-02-30'},{done:'true'}])assert.throws(()=>input({title:'Task',notes:'',priority:'normal',done:false,...patch}));
});
test('todos queries are shared, inserts record the actual author, updates check versions',async()=>{
 const calls=[],id='00000000-0000-0000-0000-000000000001';let conflict=false;
 const client={from(table){assert.equal(table,'mcode_todos');const q={select(){return q;},order(){return q;},range(){return Promise.resolve({data:[],error:null});},eq(...v){calls.push(['eq',...v]);return q;},insert(v){calls.push(['insert',v]);return q;},update(v){calls.push(['update',v]);return q;},delete(){calls.push(['delete']);return q;},then(resolve){return Promise.resolve({data:conflict?[]:[{id}],error:null}).then(resolve);}};return q;}};
 const service=createTodos({account:{user:async()=>({id:'real-author'}),getClient:async()=>client,check:e=>{if(e)throw e;}}});
 await service.save({title:'Task',notes:'',priority:'normal',done:false,created_by:'forged'});assert.equal(calls.find(v=>v[0]==='insert')[1].created_by,'real-author');assert.equal(calls.some(v=>v[1]==='created_by'),false);
 conflict=true;await assert.rejects(service.save({id,updated_at:'2026-10-30T12:00:00Z',title:'Edit',notes:'',priority:'normal',done:true}),/mudou/);assert.ok(calls.some(v=>v[1]==='updated_at'));
 await assert.rejects(service.remove(id,'2026-10-30T12:00:00Z'),/mudou/);
});
