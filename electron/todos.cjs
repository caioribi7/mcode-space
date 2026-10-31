function input(v){
 if(!v||typeof v.title!=='string'||!v.title.trim()||v.title.trim().length>160)throw Error('Informe um título com até 160 caracteres.');
 if(typeof v.notes!=='string'||v.notes.length>2000)throw Error('As notas devem ter até 2.000 caracteres.');
 if(!['low','normal','high'].includes(v.priority)||typeof v.done!=='boolean')throw Error('Prioridade ou situação inválida.');
 const due=v.due_on||null;if(due&&(typeof due!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(due)||!Number.isFinite(Date.parse(due))||new Date(due+'T00:00:00Z').toISOString().slice(0,10)!==due))throw Error('Prazo inválido.');
 return {title:v.title.trim(),notes:v.notes.trim(),priority:v.priority,due_on:due,done:v.done};
}
function version(id,stamp){if(typeof id!=='string'||!/^[-a-f0-9]{36}$/.test(id)||typeof stamp!=='string'||stamp.length>50)throw Error('Tarefa inválida.');}
function createTodos({account}){
 let queue=Promise.resolve();const serialize=fn=>{const next=queue.catch(()=>{}).then(fn);queue=next;return next;};
 async function context(){const user=await account.user();return {c:await account.getClient(),user};}
 async function list(){const {c}=await context(),rows=[];for(let start=0;;start+=500){const {data,error}=await c.from('mcode_todos').select('*').order('created_at',{ascending:false}).order('id').range(start,start+499);account.check(error);rows.push(...data);if(data.length<500)return {rows,synced:Date.now()};}}
 return {list,
 save:(value)=>serialize(async()=>{const fields=input(value),{c,user}=await context();let result;
 if(value.id){version(value.id,value.updated_at);result=await c.from('mcode_todos').update(fields).eq('id',value.id).eq('updated_at',value.updated_at).select('id');}
 else result=await c.from('mcode_todos').insert({...fields,created_by:user.id}).select('id');
 account.check(result.error);if(result.data.length!==1)throw Error('Esta tarefa mudou em outra conta. Atualize antes de salvar.');return list();}),
 remove:(id,stamp)=>serialize(async()=>{version(id,stamp);const {c}=await context();const {data,error}=await c.from('mcode_todos').delete().eq('id',id).eq('updated_at',stamp).select('id');account.check(error);if(data.length!==1)throw Error('Esta tarefa mudou em outra conta. Atualize antes de excluir.');return list();})};
}
module.exports={createTodos,input,version};
