const labels={codex:'Codex',hermes:'Hermes Agent',opencode:'OpenCode',claude:'Claude'};
export function setupMonitor({api,icon,notify,focus}){
  const $=id=>document.getElementById(id);let visible=false,busy=false;
  const text=(tag,value)=>{const node=document.createElement(tag);node.textContent=value;return node;};
  async function refresh(){
    if(!visible||document.hidden||busy)return;busy=true;
    try{
      const result=await api.agentUsage();if(!visible)return;
      $('monitor-status').textContent=`${result.sessions.filter(s=>!s.endedAt).length} em execução · ${result.sessions.length} nesta abertura`;
      const fragment=document.createDocumentFragment();
      const count=value=>value==null?'—':value.toLocaleString('pt-BR');
      for(const group of result.groups){
        const card=document.createElement('section');card.className='monitor-card';
        card.append(text('h2',labels[group.agent]||'Agente'),text('p',group.cwd),text('p','Sessões deste projeto iniciadas desde '+new Date(group.since).toLocaleTimeString('pt-BR')));
        const values=[['Tokens de entrada',count(group.usage?.input)],['Tokens de saída',count(group.usage?.output)],['Leitura de cache',count(group.usage?.cached)]];
        const metrics=document.createElement('dl');for(const [name,value]of values)metrics.append(text('dt',name),text('dd',value));card.append(metrics);
        if(!group.usage)card.append(text('p','Aguardando consumo registrado pelo agente.'));
        for(const limit of group.limits){
          const row=document.createElement('div');row.className='monitor-limit';
          row.append(text('p',`${limit.name}${limit.minutes?' · '+(limit.minutes>=60?(limit.minutes/60)+'h':limit.minutes+'min'):''} · ${limit.usedPercent.toFixed(0)}% usado`));
          const meter=document.createElement('progress');meter.max=100;meter.value=limit.usedPercent;meter.setAttribute('aria-label',limit.name+' usado');row.append(meter);
          if(limit.resetsAt)row.append(text('p','Renova em '+new Date(limit.resetsAt*1000).toLocaleString('pt-BR')));
          card.append(row);
        }
        if(!group.limits.length)card.append(text('p','Limites da conta não disponibilizados nesta telemetria.'));
        if(group.observedAt)card.append(text('p','Último registro: '+new Date(group.observedAt).toLocaleString('pt-BR')));
        if(group.note)card.append(text('p',group.note));
        for(const item of result.sessions.filter(s=>s.agent===group.agent&&s.cwd===group.cwd)){
          const seconds=Math.max(0,Math.floor(((item.endedAt||result.updatedAt)-item.startedAt)/1000));
          card.append(text('p',`${item.endedAt?'Encerrado':'Em execução'} · ${Math.floor(seconds/60)}min ${seconds%60}s · PID ${item.pid}`));
          if(!item.endedAt){const button=text('button','Ir ao terminal');button.className='button subtle';button.onclick=()=>Promise.resolve(focus(item.id)).catch(e=>notify(e.message));card.append(button);}
        }
        fragment.append(card);
      }
      if(!result.sessions.length)fragment.append(text('p','Inicie um agente pelo seletor de novo terminal.'));
      $('monitor-list').replaceChildren(fragment);
    }catch(e){if(visible)$('monitor-status').textContent=e.message;}finally{busy=false;}
  }
  window.addEventListener('mcode-sidebar',event=>{visible=event.detail?.name==='monitor';if(visible)refresh();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  setInterval(refresh,3000);
}
