function date(value){if(!value)return '';if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value)throw Error('Data inválida.');return Math.round((Date.parse(value+'T00:00:00Z')-Date.UTC(1899,11,30))/86400000);}
function text(v,required=false){if(typeof v!=='string'||v.length>500||required&&!v.trim())throw Error('Preencha os campos obrigatórios.');return v.trim();}
function money(v){if(typeof v!=='number'||!Number.isFinite(v)||v<=0||v>1e12)throw Error('Informe um valor maior que zero.');return Math.round((v+Number.EPSILON)*100)/100;}
function row(kind,v){
 if(!['ledger','fixed','clients'].includes(kind)||!v)throw Error('Cadastro inválido.');
 if(kind==='ledger'){if(!['Entrada','Saída'].includes(v.type)||!['Receita cliente','Outra entrada','Aporte','Gasto fixo','Despesa variável','Impostos','Investimento','Retirada'].includes(v.group))throw Error('Tipo ou grupo inválido.');return [v.type,v.group,text(v.category||''),text(v.description,true),text(v.client||''),date(v.due),date(v.paid),money(v.amount)];}
 if(kind==='fixed'){if(!['Mensal','Trimestral','Semestral','Anual'].includes(v.period)||!Number.isInteger(v.day)||v.day<1||v.day>31)throw Error('Periodicidade ou dia inválido.');return [text(v.description,true),text(v.category||''),text(v.supplier||''),money(v.amount),v.period,v.day,'Sim'];}
 return [text(v.id,true),text(v.name,true),text(v.contact||''),text(v.email||''),text(v.phone||''),text(v.service||''),'Ativo',v.amount?money(v.amount):''];
}

function createFinance({account}){
 const tables={ledger:'mcode_transactions',fixed:'mcode_fixed_expenses',clients:'mcode_clients'};let queue=Promise.resolve();
 const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date());
 async function context(){const u=await account.user();return {c:await account.getClient(),u};}
 async function all(c,table){const rows=[];for(let start=0;;start+=500){const {data,error}=await c.from(table).select('*').order('created_at').order('id').range(start,start+499);account.check(error);rows.push(...data);if(data.length<500)return rows;}}
 async function snapshot(){const {c,u}=await context(),[ledger,fixed,clients]=await Promise.all(Object.values(tables).map(t=>all(c,t)));
 const l=ledger.map(r=>[r.type,r.group_name,r.category,r.description,r.client_code||'',date(r.due_on),date(r.paid_on),Number(r.amount),r.paid_on?'Liquidado':!r.due_on?'Sem vencimento':r.due_on<today()?'Vencido':'Em aberto','','','',r.id,r.updated_at]);
 const f=fixed.map(r=>[r.description,r.category,r.supplier,Number(r.amount),r.period,r.due_day,r.active?'Sim':'Não',r.active?Number(r.amount)/({Mensal:1,Trimestral:3,Semestral:6,Anual:12}[r.period]):0,'OK']);
 const customers=clients.map(r=>{const linked=l.filter(t=>t[4]===r.code&&t[1]==='Receita cliente');const sum=fn=>linked.filter(fn).reduce((n,v)=>n+v[7],0);return [r.code,r.name,r.contact,r.email,r.phone,r.service,'Ativo',r.contract?Number(r.contract):'',sum(t=>t[6]),sum(t=>!t[6]),sum(t=>t[8]==='Vencido'),'OK'];});
 return {ledger:l,fixed:f,clients:customers,synced:Date.now()};}
 const serialize=fn=>{const work=queue.catch(()=>{}).then(fn);queue=work;return work;};
 return {status:async()=>({connected:await account.isSignedIn()}),snapshot,
 add:(kind,v)=>serialize(async()=>{const values=row(kind,v),{c,u}=await context();let entry;
 if(kind==='ledger')entry={owner_id:u.id,type:values[0],group_name:values[1],category:values[2],description:values[3],client_code:values[4]?values[4].toLowerCase():null,due_on:v.due||null,paid_on:v.paid||null,amount:values[7]};
 else if(kind==='fixed')entry={owner_id:u.id,description:values[0],category:values[1],supplier:values[2],amount:values[3],period:values[4],due_day:values[5],active:true};
 else entry={owner_id:u.id,code:values[0].toLowerCase(),name:values[1],contact:values[2],email:values[3],phone:values[4],service:values[5],contract:values[7]||null};
 const {error}=await c.from(tables[kind]).insert(entry);account.check(error);return snapshot();}),
 settle:(id,stamp)=>serialize(async()=>{if(typeof id!=='string'||!/^[-a-f0-9]{36}$/.test(id)||typeof stamp!=='string'||stamp.length>50)throw Error('Lançamento inválido.');const {c,u}=await context();const {data,error}=await c.from(tables.ledger).update({paid_on:today()}).eq('id',id).eq('updated_at',stamp).is('paid_on',null).select('id');account.check(error);if(data.length!==1)throw Error('O lançamento mudou. Atualize os dados e tente novamente.');return snapshot();})};
}
module.exports={createFinance,row,date};
