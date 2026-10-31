export function setupSidebars({icon,fitAll}){
 const $=id=>document.getElementById(id),panels={explorer:'sidebar',finance:'finance-sidebar',todo:'todo-sidebar',monitor:'monitor-sidebar',contracts:'contracts-sidebar'};let active='explorer';
 function select(name){if(!panels[name])return;active=name;for(const [key,id]of Object.entries(panels))$(id).hidden=key!==name;
 document.body.classList.toggle('finance-active',name==='finance');document.body.classList.toggle('todo-active',name==='todo');document.body.classList.remove('sidebar-hidden');
 for(const key of ['finance','todo','monitor','contracts']){const b=$('toggle-'+key);b.setAttribute('aria-expanded',String(name===key));b.classList.toggle('selected',name===key);}
 $('show-explorer').setAttribute('aria-expanded',String(name==='explorer'));$('show-explorer').classList.toggle('selected',name==='explorer');
 $('toggle-explorer').innerHTML=icon('sidebarClose');$('toggle-explorer').setAttribute('aria-expanded','true');$('toggle-explorer').setAttribute('aria-label','Recolher lateral');
 window.dispatchEvent(new CustomEvent('mcode-sidebar',{detail:{name}}));fitAll();
 }
 window.addEventListener('mcode-agent-started',()=>{$('toggle-monitor').hidden=false;select('monitor');});
 $('toggle-monitor').onclick=()=>select(active==='monitor'?'explorer':'monitor');$('close-monitor').onclick=()=>select('explorer');
 $('toggle-contracts').onclick=()=>select(active==='contracts'?'explorer':'contracts');$('close-contracts').onclick=()=>select('explorer');
 $('show-explorer').onclick=()=>select('explorer');
 $('toggle-finance').onclick=()=>select(active==='finance'?'explorer':'finance');$('toggle-todo').onclick=()=>select(active==='todo'?'explorer':'todo');
 $('close-finance').onclick=()=>select('explorer');$('close-todo').onclick=()=>select('explorer');select('explorer');
}
