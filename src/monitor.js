const labels={codex:'Codex',hermes:'Hermes Agent',opencode:'OpenCode',claude:'Claude'};
export function setupMonitor({api}){
 const $=id=>document.getElementById(id);let visible=false,busy=false;
 const text=(tag,value)=>{const node=document.createElement(tag);node.textContent=value;return node;};
 async function refresh(){if(!visible||document.hidden||busy)return;busy=true;
 try{const result=await api.agentUsage();if(!visible)return;const fragment=document.createDocumentFragment();
 for(const group of result.groups){const card=document.createElement('section');card.className='monitor-card';card.append(text('h2',labels[group.agent]||'Agente'));
 if(result.groups.length>1)card.append(text('p',group.cwd));
 for(const limit of group.limits.slice(0,2)){const row=document.createElement('div');row.className='monitor-limit';const name=limit.minutes===10080?'Semanal':limit.minutes===1440?'Diário':limit.minutes?`${limit.minutes/60} horas`:limit.name;row.append(text('p',`${name} · ${limit.usedPercent.toFixed(0)}%`));const meter=document.createElement('progress');meter.max=100;meter.value=limit.usedPercent;meter.setAttribute('aria-label',name+' usado');row.append(meter);card.append(row);}
 if(!group.limits.length)card.append(text('p','Limites não disponibilizados pelo agente.'));fragment.append(card);}
 if(!result.groups.length)fragment.append(text('p','Inicie um agente para ver os limites.'));$('monitor-list').replaceChildren(fragment);
 }catch(e){$('monitor-list').textContent=e.message;}finally{busy=false;}}
 window.addEventListener('mcode-sidebar',event=>{visible=event.detail?.name==='monitor';if(visible)refresh();});document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});setInterval(refresh,3000);
}
