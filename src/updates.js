export function setupUpdates({api,notify}){
 const $=id=>document.getElementById(id);let state=null;
 function render(value){state=value;const status={idle:'Confira se há uma nova versão.',checking:'Procurando atualização…',current:'Você está na versão mais recente.',available:'Versão '+value.version+' disponível.',downloading:'Baixando: '+Math.floor(value.percent)+'%',ready:'Atualização pronta para instalar.',error:'Não foi possível atualizar. Tente verificar novamente.',manual:'Instale o MCode Space pelo instalador para receber atualizações pelo aplicativo.'};$('updates-status').textContent=status[value.status];$('updates-version').textContent='Versão atual: '+value.current;
 $('updates-check').disabled=['manual','checking','downloading','ready'].includes(value.status);$('updates-download').hidden=value.status!=='available';$('updates-install').hidden=value.status!=='ready';$('updates-progress').hidden=value.status!=='downloading';$('updates-progress').value=value.percent;$('open-updates').textContent=['available','ready'].includes(value.status)?'Atualizar para '+value.version:'Atualizações';}
 $('open-updates').onclick=async()=>{try{render(await api.updateState());$('updates-dialog').showModal();}catch(e){notify(e.message);}};
 const action=fn=>async()=>{try{await fn();}catch(e){notify(e.message);}};
 $('updates-check').onclick=action(()=>api.updateCheck());$('updates-download').onclick=action(()=>api.updateDownload());$('updates-install').onclick=action(()=>api.updateInstall());$('updates-close').onclick=()=>$('updates-dialog').close();
 api.onUpdate(render);api.updateState().then(render).catch(()=>{});
}
