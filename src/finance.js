const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v)||0);
const dateText=v=>typeof v==='number'?new Date(Date.UTC(1899,11,30)+v*86400000).toLocaleDateString('pt-BR',{timeZone:'UTC'}):'Sem vencimento';
const valid=r=>['Liquidado','Em aberto','Vencido','Sem vencimento'].includes(r[8]);
export function setupFinance({api,icon,fitAll,notify}){
 const $=id=>document.getElementById(id);let visible=false,tab='summary',data=null,loading=false,submitting=false,accountVersion=0;
 const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const run=fn=>async()=>{try{await fn();}catch(e){$('finance-status').textContent=e.message;notify(e.message);}};
 const month=()=>{const [y,m]=$('finance-month').value.split('-').map(Number);return [Math.round((Date.UTC(y,m-1,1)-Date.UTC(1899,11,30))/86400000),Math.round((Date.UTC(y,m,1)-Date.UTC(1899,11,30))/86400000)];};
 $('finance-month').value=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).format(new Date());
 function render(){
  const host=$('finance-content');host.replaceChildren();$('finance-new').disabled=!data;$('finance-setup').hidden=Boolean(data);
  $('finance-new').lastChild.textContent={summary:'Novo lançamento',ledger:'Novo lançamento',fixed:'Novo gasto fixo',clients:'Novo cliente'}[tab];
  if(!data)return;const [start,end]=month(),inMonth=v=>typeof v==='number'&&v>=start&&v<end;
  if(tab==='summary'){
   const rows=data.ledger.filter(valid),received=rows.filter(r=>r[0]==='Entrada'&&r[8]==='Liquidado'&&inMonth(r[6])).reduce((n,r)=>n+r[7],0),paid=rows.filter(r=>r[0]==='Saída'&&r[8]==='Liquidado'&&inMonth(r[6])).reduce((n,r)=>n+r[7],0);
   const total=node('div',undefined,'finance-total');total.append(node('span','Resultado do mês'),node('strong',money(received-paid)));host.append(total);
   const list=node('dl',undefined,'finance-metrics');for(const [label,value]of [['Entradas recebidas',received],['Despesas pagas',paid],['A receber',rows.filter(r=>r[0]==='Entrada'&&!r[6]&&inMonth(r[5])).reduce((n,r)=>n+r[7],0)],['A pagar',rows.filter(r=>r[0]==='Saída'&&!r[6]&&inMonth(r[5])).reduce((n,r)=>n+r[7],0)],['Fixos por mês',data.fixed.reduce((n,r)=>n+(Number(r[7])||0),0)]])list.append(node('dt',label),node('dd',money(value)));host.append(list);
   const review=data.ledger.filter(r=>r.some(Boolean)&&!valid(r)).length;if(review)host.append(node('p',`${review} lançamento(s) precisam de revisão.`,'finance-warning'));
  }
  const kind=tab==='summary'?'ledger':tab;let rows=data[kind].map((r,index)=>({r,index})).filter(({r})=>r[0]);
  if(kind==='ledger')rows=rows.filter(({r})=>inMonth(r[6]||r[5])||!r[5]&&!r[6]).reverse();
  if(tab==='summary')rows=rows.filter(({r})=>!r[6]).slice(0,5);
  host.append(node('h2',tab==='summary'?'Próximos compromissos':{ledger:'Movimentos do mês',fixed:'Gastos recorrentes',clients:'Clientes da equipe'}[tab]));
  if(!rows.length)host.append(node('p','Nenhum registro neste período. Use o botão abaixo para começar.','finance-empty'));
  for(const {r,index} of rows){const item=node('div',undefined,'finance-item');item.append(node('strong',kind==='clients'?r[1]:kind==='fixed'?r[0]:r[3]));
   item.append(node('span',kind==='ledger'?`${r[0]} · ${dateText(r[5])} · ${r[8]||'Revisar'}`:kind==='fixed'?`${r[4]} · dia ${r[5]} · ${r[6]==='Sim'?'Ativo':'Inativo'}`:`${r[0]} · ${r[5]||'Sem serviço'}`));
   item.append(node('b',money(kind==='clients'?r[9]:kind==='fixed'?r[3]:r[7])));
   if(kind==='clients')item.append(node('small','A receber'));
   if(kind==='ledger'&&!r[6]&&valid(r)){const b=node('button',r[0]==='Entrada'?'Marcar recebido':'Marcar pago','button subtle');b.onclick=run(async()=>{if(!confirm(`Confirmar ${r[0]==='Entrada'?'recebimento':'pagamento'} de ${money(r[7])} hoje?`))return;b.disabled=true;const version=accountVersion;try{const next=await api.financeSettle(r[12],r[13]);if(version===accountVersion){data=next;render();}}finally{b.disabled=false;}});item.append(b);}host.append(item);
  }
 }
 async function refresh(){if(loading)return;const version=accountVersion;loading=true;$('finance-sync').disabled=true;try{const status=await api.financeStatus();if(version!==accountVersion)return;if(!status.connected){data=null;render();$('finance-status').textContent='Entre na sua conta para sincronizar.';return;}$('finance-status').textContent='Sincronizando…';const next=await api.financeRead();if(version!==accountVersion)return;data=next;render();$('finance-status').textContent='Sincronizado às '+new Date(data.synced).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});}catch(e){$('finance-status').textContent=e.message;}finally{loading=false;$('finance-sync').disabled=false;if(version!==accountVersion&&visible)refresh();}}
 function form(){const kind=tab==='summary'?'ledger':tab,host=$('finance-fields');host.replaceChildren();$('finance-form').dataset.kind=kind;$('finance-form-error').textContent='';
  const field=(name,label,type='text',options=null,required=false)=>{const l=node('label',label);const input=node(options?'select':'input');input.name=name;if(options)for(const value of options){const o=node('option',value);o.value=value;input.append(o);}else {input.type=type;if(type==='number'){input.min=name==='day'?'1':'0.01';input.step=name==='day'?'1':'0.01';if(name==='day')input.max='31';}else if(type==='text')input.maxLength=500;}input.required=required;l.append(input);host.append(l);return input;};
  if(kind==='ledger'){const type=field('type','Movimentação','text',['Entrada','Saída']),group=field('group','Grupo','text',['Outra entrada','Receita cliente','Aporte']);type.onchange=()=>{group.replaceChildren();for(const v of type.value==='Entrada'?['Outra entrada','Receita cliente','Aporte']:['Despesa variável','Gasto fixo','Impostos','Investimento','Retirada']){const o=node('option',v);o.value=v;group.append(o);}};field('description','Descrição','text',null,true);field('amount','Valor (R$)','number',null,true);field('due','Vencimento','date');field('paid','Data do pagamento ou recebimento','date');field('client','Cliente','text',['',...data.clients.filter(r=>r[0]).map(r=>r[0])]);field('category','Categoria');}
  else if(kind==='fixed'){field('description','Nome da despesa','text',null,true);field('amount','Valor por cobrança (R$)','number',null,true);field('period','Repetir','text',['Mensal','Trimestral','Semestral','Anual']);field('day','Dia do vencimento','number',null,true);field('category','Categoria');field('supplier','Fornecedor');}
  else {field('id','ID do cliente','text',null,true);field('name','Nome ou empresa','text',null,true);field('email','Email','email');field('contact','Contato');field('phone','Telefone');field('service','Serviço');field('amount','Valor do contrato (R$)','number');}
  $('finance-form').hidden=false;$('finance-new').hidden=true;host.querySelector('input,select')?.focus();
 }
 window.addEventListener('mcode-sidebar',e=>{visible=e.detail.name==='finance';if(visible)refresh();});$('finance-month').onchange=()=>{if($('finance-month').value)render();};
 for(const b of document.querySelectorAll('[data-finance]'))b.onclick=()=>{tab=b.dataset.finance;for(const n of document.querySelectorAll('[data-finance]'))n.setAttribute('aria-pressed',String(n===b));render();};
 $('finance-connect').onclick=()=>document.getElementById('open-account').click();
 window.addEventListener('mcode-account',()=>{accountVersion++;data=null;$('finance-form').reset();$('finance-form').hidden=true;$('finance-new').hidden=false;render();if(visible)refresh();});
 $('finance-sync').onclick=refresh;$('finance-new').onclick=form;
 $('finance-cancel').onclick=()=>{$('finance-form').hidden=true;$('finance-new').hidden=false;};
 $('finance-form').onsubmit=async e=>{e.preventDefault();if(submitting)return;submitting=true;$('finance-save').disabled=true;const values=Object.fromEntries(new FormData(e.target));for(const k of ['amount','day'])if(k in values)values[k]=values[k]?Number(values[k]):0;const version=accountVersion;try{const next=await api.financeAdd(e.target.dataset.kind,values);if(version!==accountVersion)return;data=next;$('finance-form').hidden=true;$('finance-new').hidden=false;render();$('finance-status').textContent='Salvo no caixa compartilhado.';}catch(error){$('finance-form-error').textContent=error.message;}finally{submitting=false;$('finance-save').disabled=false;}};
 setInterval(()=>{if(visible&&!document.hidden&&$('finance-form').hidden)refresh();},5000);
}
