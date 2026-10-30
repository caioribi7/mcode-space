import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import './styles.css';

const api = window.space;
const $ = id => document.getElementById(id);
const shapes = {
  terminal:'<path d="m5 6 5 6-5 6m8 0h6"/>', folder:'<path d="M3 7V5h6l2 2h10v12H3z"/>', file:'<path d="M5 3h9l5 5v13H5zM14 3v6h5"/>', chevron:'<path d="m9 5 7 7-7 7"/>', close:'<path d="m6 6 12 12M18 6 6 18"/>', refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 6a8 8 0 0 1 13 2M5 16a8 8 0 0 0 13 2"/>', collapse:'<path d="M4 7h16M4 12h16M4 17h16"/>', tabs:'<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9h18m-12-5v5"/>', columns:'<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M12 4v16"/>', grid:'<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M12 4v16M3 12h18"/>', edit:'<path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14z"/>', branch:'<circle cx="6" cy="5" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="6" cy="19" r="2"/><path d="M6 7v10m0-4c0-5 12 0 12-5"/>', up:'<path d="m5 14 7-7 7 7"/>', left:'<path d="m14 5-7 7 7 7"/>', right:'<path d="m10 5 7 7-7 7"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${shapes[name] || shapes.file}</svg>`;
const colors = { green:'#a3ff12', blue:'#86baff', amber:'#efc67b', pink:'#eca2ca' };
const state = { root:null, shells:[], terminals:[], active:null, layout:'tabs', files:[], file:null, expanded:new Set(), tree:new Map(), sidebar:260, windowsPty:undefined };
let toastTimer, saveTimer, renaming = null;
const pendingOutput = new Map();
const basename = value => value.split(/[\\/]/).filter(Boolean).at(-1) || value;
function notify(message) { $('toast').textContent = String(message).replace(/^Error invoking remote method '[^']+': Error: /, ''); $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 6500); }
function action(fn) { return (...args) => { try { return Promise.resolve(fn(...args)).catch(error => notify(error.message)); } catch(error) { notify(error.message); } }; }
function button(label, glyph, fn) { const b = document.createElement('button'); b.className='icon-button'; b.title=label; b.setAttribute('aria-label',label); b.innerHTML=icon(glyph); b.onclick=action(fn); return b; }
function persist() { clearTimeout(saveTimer); saveTimer=setTimeout(() => api.saveWorkspace({ tabs:state.terminals.map(({name,shell,cwd,color})=>({name,shell,cwd,color})), layout:state.layout, sidebar:state.sidebar }).catch(e=>notify(e.message)),180); }
function updateDirty() { api.setDirty(state.files.some(f=>f.text!==f.saved)).catch(e=>notify(e.message)); }
function fitAll() { requestAnimationFrame(() => { for (const item of state.terminals) { if (!item.panel.hidden && item.host.clientWidth>0) { try { item.fit.fit(); if (!item.ended) api.resize(item.id, Math.min(500,item.term.cols), Math.min(250,item.term.rows)).catch(()=>{}); } catch {} } } }); }
const resizeObserver=new ResizeObserver(fitAll);
resizeObserver.observe($('terminal-panels'));

async function loadDirectory(candidate='.') { const entries=await api.list(candidate); state.tree.set(candidate,entries); return entries; }
async function refreshTree() {
  if (!state.root) return;
  const keys=['.',...state.expanded];
  for (const key of keys) { try { await loadDirectory(key); } catch(e) { state.expanded.delete(key); if(key==='.')throw e; } }
  renderTree(); await updateGit();
}
function renderTree() {
  $('tree').replaceChildren();
  const filter=$('file-filter').value.toLowerCase();
  function draw(parent,depth) {
    for (const entry of state.tree.get(parent)||[]) {
      if (filter && !entry.directory && !entry.name.toLowerCase().includes(filter)) continue;
      const row=document.createElement('button'); row.className='tree-row'; row.style.paddingLeft=`${10+depth*15}px`; row.title=entry.path;
      if(state.file?.path===entry.path)row.classList.add('file-active');
      if(entry.directory){ row.innerHTML=icon('chevron')+icon('folder'); row.firstChild.classList.add('chevron'); row.firstChild.classList.toggle('expanded',state.expanded.has(entry.path)); row.setAttribute('aria-expanded',String(state.expanded.has(entry.path))); }
      else row.innerHTML=icon('file');
      const label=document.createElement('span'); label.className='tree-name'; label.textContent=entry.name+(entry.symlink?' (link)':''); row.append(label);
      row.draggable=true; row.ondragstart=e=>{e.dataTransfer.setData('application/mcode-file',JSON.stringify(entry));e.dataTransfer.effectAllowed='copy';};
      row.onclick=action(async()=>{ if(entry.directory){ if(state.expanded.has(entry.path))state.expanded.delete(entry.path);else{await loadDirectory(entry.path);state.expanded.add(entry.path);}renderTree(); }else await openFile(entry.path); });
      row.oncontextmenu=e=>{e.preventDefault();if(entry.directory)newTerminal({cwd:entry.path}).catch(err=>notify(err.message));};
      $('tree').append(row); if(entry.directory&&state.expanded.has(entry.path))draw(entry.path,depth+1);
    }
  }
  draw('.',0);
  if(!$('tree').children.length){const p=document.createElement('p');p.className='tree-message';p.textContent=state.root?'Nenhum arquivo visível.':'Abra uma pasta para explorar seus arquivos.';$('tree').append(p);}
}
async function openFolder() {
  const root=await api.openFolder(); if(!root)return;
  for(const item of state.terminals){item.term.dispose();item.panel.remove();}
  state.terminals=[];state.files=[];state.file=null;state.active=null;state.root=root;state.expanded.clear();state.tree.clear();
  $('editor').hidden=true;$('editor-resize').hidden=true;
  applyRoot();await refreshTree();await newTerminal();persist();
}
function applyRoot(){ $('workspace-name').textContent=state.root||'Seu espaço de trabalho';$('workspace-name').title=state.root||'';$('tree-root').textContent=state.root?basename(state.root):'';$('connection').textContent=state.root?'Pasta local':'Pronto para começar';$('new-terminal').disabled=!state.root;$('shell-type').disabled=!state.root; }

async function openFile(candidate) {
  let file=state.files.find(f=>f.path===candidate);
  if(!file){const data=await api.read(candidate);const eol=data.text.includes('\r\n')?'\r\n':'\n';const text=data.text.replace(/\r\n/g,'\n');file={...data,text,saved:text,eol,scroll:0};state.files.push(file);}
  if(state.file)state.file.scroll=$('code').scrollTop;
  state.file=file;renderEditor();renderTree();fitAll();
}
function renderEditor() {
  const file=state.file;$('editor').hidden=!file;$('editor-resize').hidden=!file;
  $('file-tabs').replaceChildren();
  for(const item of state.files){
    const tab=document.createElement('div');tab.className='file-tab'+(file===item?' active':'');
    const activate=document.createElement('button');activate.role='tab';activate.setAttribute('aria-selected',String(file===item));activate.title=item.path;activate.textContent=basename(item.path)+(item.text!==item.saved?' •':'');activate.onclick=()=>{if(state.file)state.file.scroll=$('code').scrollTop;state.file=item;renderEditor();renderTree();};
    tab.append(activate,button(`Fechar ${basename(item.path)}`,'close',()=>closeFile(item)));$('file-tabs').append(tab);
  }
  if(file){$('code').value=file.text;$('code').scrollTop=file.scroll||0;$('editor-path').textContent=file.path;updateLines();$('file-state').textContent=file.text!==file.saved?'Alterações não salvas':'UTF-8';$('status-file').textContent=basename(file.path);}
  else $('status-file').textContent='MCode Space';
}
function updateLines(){const count=$('code').value.split('\n').length;$('line-numbers').textContent=Array.from({length:count},(_,i)=>i+1).join('\n');$('line-numbers').scrollTop=$('code').scrollTop;}
async function saveFile(){const file=state.file;if(!file||file.text===file.saved)return;const text=file.text;const result=await api.save({path:file.path,text:file.eol==='\r\n'?text.replace(/\n/g,'\r\n'):text,revision:file.revision,bom:file.bom});file.revision=result.revision;file.saved=text;renderEditor();updateDirty();notify('Arquivo salvo.');await updateGit();}
async function closeFile(file){if(file.text!==file.saved&&!await api.confirmDiscard(basename(file.path)))return;state.files=state.files.filter(f=>f!==file);if(state.file===file)state.file=state.files.at(-1)||null;renderEditor();renderTree();updateDirty();fitAll();}
$('code').addEventListener('input',()=>{if(!state.file)return;state.file.text=$('code').value;state.file.scroll=$('code').scrollTop;updateLines();$('file-state').textContent=state.file.text!==state.file.saved?'Alterações não salvas':'UTF-8';const active=$('file-tabs').querySelector('[aria-selected=true]');if(active)active.textContent=basename(state.file.path)+(state.file.text!==state.file.saved?' •':'');updateDirty();});
$('code').addEventListener('scroll',()=>{$('line-numbers').scrollTop=$('code').scrollTop;});
$('code').addEventListener('keydown',event=>{if(event.key==='Tab'){event.preventDefault();const field=event.target,start=field.selectionStart;field.setRangeText('  ',start,field.selectionEnd,'end');field.dispatchEvent(new Event('input'));}});

api.onData(({id,data})=>{const item=state.terminals.find(t=>t.id===id);if(item)item.term.write(data);else{const old=pendingOutput.get(id)||'';pendingOutput.set(id,(old+data).slice(-256000));}});
api.onExit(({id,exitCode})=>{const item=state.terminals.find(t=>t.id===id);if(!item)return;item.ended=true;item.term.writeln(`\r\n\x1b[90mProcesso encerrado (${exitCode}). Abra um novo terminal para continuar.\x1b[0m`);item.panel.classList.add('ended');renderTabs();});
async function newTerminal(options={}) {
  if(!state.root)return openFolder();
  const created=await api.createTerminal({shell:options.shell||$('shell-type').value,cwd:options.cwd||'.'});
  const term=new Terminal({windowsPty:state.windowsPty,fontFamily:'Geist, Consolas, monospace',fontSize:12,lineHeight:1.3,cursorBlink:true,cursorStyle:'bar',scrollback:5000,allowProposedApi:false,theme:{background:'#0b100d',foreground:'#dce7df',cursor:'#a3ff12',selectionBackground:'#a3ff1240',black:'#18221b',red:'#f28b82',green:'#a3ff12',yellow:'#efc67b',blue:'#86baff',magenta:'#eca2ca',cyan:'#80cbc4',white:'#f1f5ef',brightBlack:'#9eafa3'}});
  const fit=new FitAddon();term.loadAddon(fit);
  const item={...created,name:options.name||`${created.label} ${state.terminals.length+1}`,color:colors[options.color]?options.color:'green',term,fit,ended:false};
  const panel=document.createElement('div');panel.className='terminal-panel';panel.setAttribute('role','tabpanel');panel.style.setProperty('--tab-color',colors[item.color]);
  const head=document.createElement('div');head.className='panel-header';
  const dot=document.createElement('span');dot.className='tab-dot';const name=document.createElement('span');name.textContent=item.name;item.nameNode=name;
  const location=document.createElement('span');location.className='panel-path';location.textContent=item.cwd==='.'?basename(state.root):item.cwd;location.title='Pasta inicial: '+item.cwd;
  head.append(dot,name,location,button('Renomear terminal','edit',()=>renameTerminal(item)));panel.append(head);
  const host=document.createElement('div');host.className='terminal-host';panel.append(host);item.host=host;item.panel=panel;
  panel.addEventListener('pointerdown',()=>{state.active=item.id;renderTabs();for(const t of state.terminals)t.panel.classList.toggle('focused',t===item);});
  panel.ondragover=e=>{if(e.dataTransfer.types.includes('application/mcode-file')){e.preventDefault();panel.classList.add('drop-target');}};
  panel.ondragleave=()=>panel.classList.remove('drop-target');
  panel.ondrop=action(async e=>{e.preventDefault();panel.classList.remove('drop-target');const entry=readDrop(e);if(!entry)return;if(entry.directory)await newTerminal({cwd:entry.path});else await openFile(entry.path);});
  $('terminal-panels').append(panel);term.open(host);term.onData(data=>{if(!item.ended)api.write(item.id,data).catch(e=>notify(e.message));});
  term.attachCustomKeyEventHandler(event=>!(event.ctrlKey&&['o','b','s'].includes(event.key.toLowerCase()))&&!(event.ctrlKey&&event.shiftKey&&['T','W','G','ArrowLeft','ArrowRight'].includes(event.key)));
  state.terminals.push(item);state.active=item.id;if(pendingOutput.has(item.id)){term.write(pendingOutput.get(item.id));pendingOutput.delete(item.id);}
  renderTerminals();persist();setTimeout(()=>term.focus(),0);return item;
}
function renderTabs(){
  $('terminal-tabs').replaceChildren();
  for(const item of state.terminals){
    const tab=document.createElement('div');tab.className='terminal-tab'+(item.id===state.active?' active':'');tab.style.setProperty('--tab-color',colors[item.color]);tab.draggable=true;tab.dataset.id=item.id;
    const dot=document.createElement('span');dot.className='tab-dot';if(item.ended)dot.style.background='#9eafa3';
    const activate=document.createElement('button');activate.setAttribute('role','tab');activate.setAttribute('aria-selected',String(item.id===state.active));activate.textContent=item.name+(item.ended?' (encerrado)':'');activate.title='Clique duplo para renomear';activate.onclick=()=>activateTerminal(item);activate.ondblclick=()=>renameTerminal(item);
    tab.append(dot,activate,button(`Mover ${item.name} para esquerda`,'left',()=>moveTerminal(item,-1)),button(`Mover ${item.name} para direita`,'right',()=>moveTerminal(item,1)),button(`Fechar ${item.name}`,'close',()=>closeTerminal(item)));
    tab.ondragstart=e=>{e.dataTransfer.setData('application/mcode-terminal',item.id);e.dataTransfer.effectAllowed='move';};
    tab.ondragover=e=>{if(e.dataTransfer.types.includes('application/mcode-terminal')){e.preventDefault();tab.classList.add('drag-over');}};tab.ondragleave=()=>tab.classList.remove('drag-over');
    tab.ondrop=e=>{e.preventDefault();const source=state.terminals.find(t=>t.id===e.dataTransfer.getData('application/mcode-terminal'));if(!source||source===item)return;const target=state.terminals.indexOf(item);state.terminals.splice(state.terminals.indexOf(source),1);state.terminals.splice(target,0,source);renderTerminals();persist();};
    $('terminal-tabs').append(tab);
  }
  $('terminal-count').textContent=state.terminals.length;
}
function activateTerminal(item){state.active=item.id;renderTerminals();item.term.focus();}
function renderTerminals(){
  renderTabs();$('terminal-panels').dataset.layout=state.layout;$('terminal-panels').style.setProperty('--columns',Math.min(3,state.terminals.length)||1);
  for(const item of state.terminals){item.panel.hidden=state.layout==='tabs'&&item.id!==state.active;item.panel.classList.toggle('focused',item.id===state.active);$('terminal-panels').append(item.panel);}
  $('welcome').hidden=state.terminals.length>0;
  if(!state.terminals.length&&state.root){$('welcome').querySelector('h2').textContent='Espaço para o próximo comando.';$('welcome').querySelector('p').textContent='Abra um terminal para trabalhar nesta pasta.';$('welcome-open').textContent='Novo terminal';}
  for(const b of document.querySelectorAll('[data-layout]'))if(b.tagName==='BUTTON'){b.classList.toggle('selected',b.dataset.layout===state.layout);b.setAttribute('aria-pressed',String(b.dataset.layout===state.layout));}
  $('status-layout').textContent={tabs:'Abas',columns:'Lado a lado',grid:'Grade'}[state.layout];fitAll();
}
function moveTerminal(item,delta){const index=state.terminals.indexOf(item),next=index+delta;if(next<0||next>=state.terminals.length)return;[state.terminals[index],state.terminals[next]]=[state.terminals[next],state.terminals[index]];renderTerminals();persist();}
async function closeTerminal(item){
  // Closing a shell terminates its running jobs; require an explicit confirmation.
  if(!item.ended&&!window.confirm(`Encerrar ${item.name} e seus processos?`))return;
  await api.closeTerminal(item.id);item.term.dispose();item.panel.remove();state.terminals=state.terminals.filter(t=>t!==item);if(state.active===item.id)state.active=state.terminals.at(-1)?.id||null;renderTerminals();persist();
}
function renameTerminal(item){renaming=item;$('terminal-name').value=item.name;$('terminal-color').value=item.color;$('rename-dialog').showModal();$('terminal-name').focus();$('terminal-name').select();}
$('rename-dialog').addEventListener('close',()=>{if($('rename-dialog').returnValue!=='save'||!renaming)return;renaming.name=$('terminal-name').value.trim()||renaming.name;renaming.color=$('terminal-color').value;renaming.nameNode.textContent=renaming.name;renaming.panel.style.setProperty('--tab-color',colors[renaming.color]);renderTabs();persist();renaming=null;});
function readDrop(event){try{return JSON.parse(event.dataTransfer.getData('application/mcode-file'));}catch{return null;}}
$('editor').ondragover=e=>{if(e.dataTransfer.types.includes('application/mcode-file')){e.preventDefault();$('editor').classList.add('drop-target');}};
$('editor').ondragleave=()=>$('editor').classList.remove('drop-target');
$('editor').ondrop=action(async e=>{e.preventDefault();$('editor').classList.remove('drop-target');const entry=readDrop(e);if(entry&&!entry.directory)await openFile(entry.path);});
$('welcome').ondragover=e=>{if(e.dataTransfer.types.includes('application/mcode-file'))e.preventDefault();};
$('welcome').ondrop=action(async e=>{e.preventDefault();const entry=readDrop(e);if(entry?.directory)await newTerminal({cwd:entry.path});else if(entry)await openFile(entry.path);});
async function updateGit(){const info=await api.gitStatus();$('git-status').replaceChildren();if(info){$('git-status').innerHTML=icon('branch');const text=document.createElement('span');text.textContent=`${info.branch} · ${info.changes?info.changes+' alterações':'limpo'}`;$('git-status').append(text);}}

function setupResize(id,fn){const handle=$(id);handle.addEventListener('pointerdown',e=>{handle.setPointerCapture(e.pointerId);document.body.classList.add('is-resizing');const move=event=>fn(event);const stop=()=>{handle.removeEventListener('pointermove',move);document.body.classList.remove('is-resizing');persist();fitAll();};handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',stop,{once:true});});}
setupResize('sidebar-resize',e=>{state.sidebar=Math.max(190,Math.min(480,e.clientX));document.documentElement.style.setProperty('--sidebar',`${state.sidebar}px`);});
setupResize('editor-resize',e=>{const area=document.querySelector('.workbench').getBoundingClientRect();const height=Math.max(160,Math.min(area.height-230,e.clientY-area.top));document.documentElement.style.setProperty('--editor-height',`${height}px`);});
$('sidebar-resize').onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();state.sidebar=Math.max(190,Math.min(480,state.sidebar+(e.key==='ArrowLeft'?-16:16)));document.documentElement.style.setProperty('--sidebar',`${state.sidebar}px`);persist();fitAll();}};
$('editor-resize').onkeydown=e=>{if(['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const h=$('editor').clientHeight+(e.key==='ArrowUp'?-20:20);const max=document.querySelector('.workbench').clientHeight-230;document.documentElement.style.setProperty('--editor-height',`${Math.max(160,Math.min(max,h))}px`);fitAll();}};
$('refresh').innerHTML=icon('refresh');$('collapse-tree').innerHTML=icon('collapse');$('terminal-icon').innerHTML=icon('terminal');$('hide-editor').innerHTML=icon('up');
for(const b of document.querySelectorAll('button[data-layout]')){b.innerHTML=icon(b.dataset.layout);b.onclick=()=>{state.layout=b.dataset.layout;renderTerminals();persist();};}
$('open-folder').onclick=action(openFolder);$('welcome-open').onclick=action(()=>state.root?newTerminal():openFolder());$('new-terminal').onclick=action(()=>newTerminal());$('refresh').onclick=action(refreshTree);$('collapse-tree').onclick=()=>{state.expanded.clear();renderTree();};$('file-filter').oninput=renderTree;$('save-file').onclick=action(saveFile);$('hide-editor').onclick=()=>{$('editor').hidden=true;$('editor-resize').hidden=true;fitAll();};$('git-status').onclick=action(updateGit);
document.addEventListener('keydown',action(async e=>{
  if(!e.ctrlKey)return;const key=e.key.toLowerCase();
  if(key==='o'){e.preventDefault();await openFolder();}
  else if(key==='s'){e.preventDefault();await saveFile();}
  else if(key==='b'){e.preventDefault();document.body.classList.toggle('sidebar-hidden');fitAll();}
  else if(e.shiftKey&&key==='t'){e.preventDefault();await newTerminal();}
  else if(e.shiftKey&&key==='g'){e.preventDefault();state.layout=state.layout==='grid'?'tabs':'grid';renderTerminals();persist();}
  else if(e.shiftKey&&key==='w'){e.preventDefault();const item=state.terminals.find(t=>t.id===state.active);if(item)await closeTerminal(item);}
  else if(e.shiftKey&&['arrowleft','arrowright'].includes(key)){e.preventDefault();const item=state.terminals.find(t=>t.id===state.active);if(item)moveTerminal(item,key==='arrowleft'?-1:1);}
}));
window.addEventListener('focus',()=>{if(state.root)updateGit().catch(()=>{});});
window.addEventListener('dragover',event=>event.preventDefault());window.addEventListener('drop',event=>event.preventDefault());

async function init(){
  if(!api){notify('Abra este aplicativo pelo Electron: execute npm start.');return;}
  const initial=await api.initial();state.root=initial.root;state.shells=initial.shells;state.windowsPty=initial.windowsPty||undefined;state.layout=['tabs','columns','grid'].includes(initial.saved.layout)?initial.saved.layout:'tabs';state.sidebar=Math.max(190,Math.min(480,Number(initial.saved.sidebar)||260));document.documentElement.style.setProperty('--sidebar',`${state.sidebar}px`);
  for(const shell of state.shells){const option=document.createElement('option');option.value=shell.id;option.textContent=shell.label;$('shell-type').append(option);}
  applyRoot();renderTree();
  if(state.root){await refreshTree();const saved=Array.isArray(initial.saved.tabs)?initial.saved.tabs.slice(0,12):[];for(const tab of saved){try{await newTerminal(tab);}catch(e){notify('Não foi possível restaurar um terminal: '+e.message);}}if(!state.terminals.length)await newTerminal();}
  renderTerminals();
}
init().catch(e=>notify(e.message));
