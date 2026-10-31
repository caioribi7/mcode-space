const {test}=require('node:test');const assert=require('node:assert/strict');
const {row,date,createFinance}=require('../electron/finance.cjs');
test('finance validates amounts and dates for Supabase',()=>{
 assert.equal(date('2026-10-30'),46325);assert.throws(()=>date('2026-02-30'));
 const v={type:'Entrada',group:'Outra entrada',description:'Serviço',amount:123.456,due:'2026-10-30'};
 assert.deepEqual(row('ledger',v),['Entrada','Outra entrada','','Serviço','',46325,'',123.46]);
 for(const amount of [-1,NaN,Infinity,'100'])assert.throws(()=>row('ledger',{...v,amount}));assert.throws(()=>row('toString',v));
});
test('finance shares authenticated queries and uses stable IDs with version checks',async()=>{
 const calls=[],fixture={mcode_transactions:[{id:'00000000-0000-0000-0000-000000000001',type:'Entrada',group_name:'Outra entrada',description:'Receita',category:'',amount:'150.50',due_on:'2026-10-30',paid_on:null,updated_at:'2026-10-30T10:00:00Z'}],mcode_fixed_expenses:[],mcode_clients:[]};
 const c={from(table){const q={select(){return q;},eq(...args){calls.push([table,'eq',...args]);return q;},is(...args){calls.push([table,'is',...args]);return q;},order(){return q;},range(){return Promise.resolve({data:fixture[table],error:null});},insert(value){calls.push([table,'insert',value]);return Promise.resolve({error:null});},update(value){calls.push([table,'update',value]);return q;},then(resolve){return Promise.resolve({data:[],error:null}).then(resolve);}};return q;}};
 const service=createFinance({account:{user:async()=>({id:'owner'}),getClient:async()=>c,check:e=>{if(e)throw e;}}});
 const result=await service.snapshot();assert.equal(result.ledger[0][7],150.5);assert.equal(result.ledger[0][12],fixture.mcode_transactions[0].id);assert.equal(calls.some(r=>r[2]==='owner_id'),false);
 await service.add('ledger',{type:'Saída',group:'Despesa variável',description:'Custo',amount:10});assert.equal(calls.find(r=>r[1]==='insert')[2].owner_id,'owner');
 await assert.rejects(service.settle(fixture.mcode_transactions[0].id,'2026-10-30T10:00:00Z'),/mudou/);assert.ok(calls.some(r=>r[2]==='updated_at'));
});
