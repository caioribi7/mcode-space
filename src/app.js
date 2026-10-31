import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import './styles.css';
import './identity.css';
import './workspace.css';
import { renderBrandAscii } from './brand-ascii';
import { icon } from './icons';
import { renderMarkdown } from './markdown';
import { setupAccount } from './account';
import { setupTodos } from './todos';
import { setupUpdates } from './updates';
import { setupContracts } from './contracts';
import { setupMonitor } from './monitor';
import { setupSidebars } from './sidebars';
import { setupFinance } from './finance';
import { MOSAICS, terminalLayout } from './layouts.mjs';

const api = window.space;
const $ = id => document.getElementById(id);
const colors = { green:'#a3ff12', blue:'#86baff', amber:'#efc67b', pink:'#eca2ca' };
const workspaces = [];
let environment = {shells:[],windowsPty:undefined};
function emptyWorkspace(root=null,saved={}) { return {root,terminals:[],active:null,layout:['tabs','columns','grid'].includes(saved.layout)?saved.layout:'tabs',mosaic:MOSAICS[saved.mosaic]?saved.mosaic:'balanced',files:[],file:null,expanded:new Set(),tree:new Map(),sidebar:Math.max(190,Math.min(480,Number(saved.sidebar)||260)),filter:'',git:null,lastGit:0,...environment}; }
let state = emptyWorkspace();
const allTerminals = () => workspaces.flatMap(w=>w.terminals);
let toastTimer, saveTimer, renaming = null;
let draggedEntry = null, movingFile = false;
let moveFeedbackTimer = null;
let refreshing = false, folderMenuEntry = null;
let restoring = false;
const pendingOutput = new Map();
const pendingExits = new Map();
const basename = value => value.split(/[\\/]/).filter(Boolean).at(-1) || value;
function notify(message) { $('toast').textContent = String(message).replace(/^Error invoking remote method '[^']+': Error: /, ''); $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 6500); }
function action(fn) { return (...args) => { try { return Promise.resolve(fn(...args)).catch(error => notify(error.message)); } catch(error) { notify(error.message); } }; }
function button(label, glyph, fn) { const b = document.createElement('button'); b.className='icon-button'; b.title=label; b.setAttribute('aria-label',label); b.innerHTML=icon(glyph); b.onclick=action(fn); return b; }
function persist() { if(restoring)return;clearTimeout(saveTimer); saveTimer=setTimeout(() => api.saveWorkspace({activeRoot:state.root,workspaces:workspaces.map(w=>({root:w.root,tabs:w.terminals.map(({name,shell,cwd,color,glyph})=>({name,shell,cwd,color,glyph})),layout:w.layout,mosaic:w.mosaic,sidebar:w.sidebar}))}).catch(e=>notify(e.message)),180); }
function updateDirty() { api.setDirty(workspaces.some(w=>w.files.some(f=>f.text!==f.saved))).catch(e=>notify(e.message));renderWorkspaceTabs(); }
function fitAll() { requestAnimationFrame(() => { for (const item of state.terminals) { if (!item.panel.hidden && item.host.clientWidth>0) { try { item.fit.fit(); if (!item.ended) api.resize(item.id, Math.min(500,item.term.cols), Math.min(250,item.term.rows)).catch(()=>{}); } catch {} } } }); }
const resizeObserver=new ResizeObserver(fitAll);
resizeObserver.observe($('terminal-panels'));

async function loadDirectory(candidate='.',workspace=state) { const entries=await api.list(candidate,workspace.root); workspace.tree.set(candidate,entries); return entries; }
async function refreshTree(workspace=state,automatic=false) {
  if (!workspace.root || (automatic && (refreshing||draggedEntry||movingFile||!$('folder-menu').hidden))) return;
  refreshing=true;
  const version=(workspace.refreshVersion||0)+1;workspace.refreshVersion=version;
  try {
    let changed=false;
    await Promise.all(['.',...workspace.expanded].map(async key=>{
      try {const entries=await api.list(key,workspace.root);if(workspace.refreshVersion===version&&JSON.stringify(entries)!==JSON.stringify(workspace.tree.get(key))){workspace.tree.set(key,entries);changed=true;}}
      catch(error){if(key!=='.'){workspace.expanded.delete(key);workspace.tree.delete(key);changed=true;}else if(!automatic)throw error;}
    }));
    if(workspace===state && workspace.refreshVersion===version && (!automatic||changed))renderTree();
    if(!automatic||Date.now()-workspace.lastGit>5000)await updateGit(workspace);
  } finally {refreshing=false;}
}
setInterval(()=>{if(!document.hidden)refreshTree(state,true).catch(()=>{});},750);
function clearFileDrag() {
  draggedEntry=null;
  document.body.classList.remove('dragging-file');
  document.querySelectorAll('.tree-source,.tree-drop-target,.tree-drop-blocked').forEach(row=>row.classList.remove('tree-source','tree-drop-target','tree-drop-blocked'));
  if(!movingFile&&!moveFeedbackTimer)$('move-feedback').hidden=true;
}
function moveProblem(entry,directory) {
  if(movingFile)return 'Aguarde a movimentação atual.';
  if(entry.symlink)return 'Links não podem ser movidos.';
  const source=entry.path.toLowerCase(),target=directory.toLowerCase();
  if((source.includes('/')?source.slice(0,source.lastIndexOf('/')):'.')===target)return 'O item já está nesta pasta.';
  if(entry.directory&&(target===source||target.startsWith(source+'/')))return 'Uma pasta não pode ir para dentro dela mesma.';
  return '';
}
function fileDropTarget(element,directory) {
  element.ondragover=event=>{
    if(!draggedEntry||!event.dataTransfer.types.includes('application/mcode-file'))return;
    event.preventDefault();event.stopPropagation();
    const problem=moveProblem(draggedEntry,directory);
    event.dataTransfer.dropEffect=problem?'none':'move';
    document.querySelectorAll('.tree-drop-target,.tree-drop-blocked').forEach(row=>row.classList.remove('tree-drop-target','tree-drop-blocked'));
    element.classList.add(problem?'tree-drop-blocked':'tree-drop-target');
    $('move-feedback').hidden=false;
    $('move-feedback').textContent=problem||`Mover “${draggedEntry.name}” para ${directory==='.'?basename(state.root):directory}`;
  };
  element.ondragleave=event=>{if(!element.contains(event.relatedTarget))element.classList.remove('tree-drop-target','tree-drop-blocked');};
  element.ondrop=action(async event=>{
    if(!event.dataTransfer.types.includes('application/mcode-file'))return;
    event.preventDefault();event.stopPropagation();
    const entry=readDrop(event);clearFileDrag();
    if(!entry)return;
    const problem=moveProblem(entry,directory);if(problem){notify(problem);return;}
    movingFile=true;
    clearTimeout(moveFeedbackTimer);moveFeedbackTimer=null;
    $('move-feedback').hidden=false;$('move-feedback').textContent=`Movendo “${entry.name}”…`;
    try {
      const moved=await api.move(entry.path,directory,state.root);
      const remap=value=>{const normalized=value.replaceAll('\\','/');return normalized===moved.from||normalized.startsWith(moved.from+'/')?moved.to+normalized.slice(moved.from.length):value;};
      for(const file of state.files)file.path=remap(file.path);
      for(const terminal of state.terminals){terminal.cwd=remap(terminal.cwd);terminal.locationNode.textContent=terminal.cwd==='.'?basename(state.root):terminal.cwd;}
      state.expanded=new Set([...state.expanded].map(remap));
      if(directory!=='.')state.expanded.add(directory);
      state.tree.clear();
      await refreshTree();renderEditor();persist();
      $('toast').hidden=true;
      $('move-feedback').textContent=`“${entry.name}” movido para ${directory==='.'?basename(state.root):directory}.`;
      moveFeedbackTimer=setTimeout(()=>{$('move-feedback').hidden=true;moveFeedbackTimer=null;},2800);
    } finally {movingFile=false;if(!moveFeedbackTimer)$('move-feedback').hidden=true;}
  });
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
      row.draggable=true; row.ondragstart=e=>{clearTimeout(moveFeedbackTimer);moveFeedbackTimer=null;draggedEntry=entry;e.dataTransfer.setData('application/mcode-file',JSON.stringify(entry));e.dataTransfer.effectAllowed='copyMove';row.classList.add('tree-source');document.body.classList.add('dragging-file');$('move-feedback').hidden=false;$('move-feedback').textContent=`Arraste “${entry.name}” para uma pasta para mover.`;};
      row.ondragend=clearFileDrag;
      if(entry.directory)fileDropTarget(row,entry.path);
      row.onclick=action(async()=>{ if(entry.directory){ if(state.expanded.has(entry.path))state.expanded.delete(entry.path);else{await loadDirectory(entry.path);state.expanded.add(entry.path);}renderTree(); }else await openFile(entry.path); });
      row.oncontextmenu=e=>{e.preventDefault();if(entry.directory)showFolderMenu(entry,e);};
      $('tree').append(row); if(entry.directory&&state.expanded.has(entry.path))draw(entry.path,depth+1);
    }
  }
  draw('.',0);
  if(!$('tree').children.length){const p=document.createElement('p');p.className='tree-message';p.textContent=state.root?'Nenhum arquivo visível.':'Abra uma pasta para explorar seus arquivos.';$('tree').append(p);}
}
function renderWorkspaceTabs(){
  $('workspace-tabs').replaceChildren();
  for(const workspace of workspaces){
    const tab=document.createElement('div');tab.className='workspace-tab'+(workspace===state?' active':'');tab.title=workspace.root;
    const activate=document.createElement('button');activate.innerHTML=icon('folder');activate.setAttribute('aria-current',workspace===state?'page':'false');
    const name=document.createElement('span');name.textContent=basename(workspace.root)+(workspace.files.some(f=>f.text!==f.saved)?' •':'');activate.append(name);activate.onclick=action(()=>activateWorkspace(workspace));
    tab.append(activate,button(`Fechar pasta ${basename(workspace.root)}`,'close',()=>closeWorkspace(workspace)));$('workspace-tabs').append(tab);
  }
  const add=button('Abrir pasta em nova aba','folderPlus',openFolder);add.id='new-workspace';$('workspace-tabs').append(add);
}
async function activateWorkspace(workspace){
  if(movingFile)throw new Error('Aguarde a movimentação terminar antes de trocar a pasta.');
  if(state.file)state.file.scroll=$('code').scrollTop;state.filter=$('file-filter').value;
  await api.selectWorkspace(workspace.root);state=workspace;
  $('file-filter').value=state.filter;document.documentElement.style.setProperty('--sidebar',`${state.sidebar}px`);
  $('terminal-panels').replaceChildren(...state.terminals.map(t=>t.panel));
  applyRoot();renderWorkspaceTabs();renderTree();renderEditor();renderTerminals();renderGit();await refreshTree();persist();
}
async function addWorkspace(root){
  let workspace=workspaces.find(w=>w.root===root);
  if(!workspace){workspace=emptyWorkspace(root);workspaces.push(workspace);}
  await activateWorkspace(workspace);if(!workspace.terminals.length)await newTerminal();persist();
}
async function openFolder() {
  if(movingFile)throw new Error('Aguarde a movimentação terminar.');
  const root=await api.openFolder();if(root)await addWorkspace(root);
}
async function closeWorkspace(workspace){
  if(movingFile)throw new Error('Aguarde a movimentação terminar.');
  if(!await api.closeWorkspace(workspace.root,workspace.files.some(f=>f.text!==f.saved)))return;
  for(const item of workspace.terminals){item.term.dispose();item.panel.remove();}
  workspaces.splice(workspaces.indexOf(workspace),1);
  if(state===workspace){if(workspaces.length)await activateWorkspace(workspaces.at(-1));else{state=emptyWorkspace();$('terminal-panels').replaceChildren();applyRoot();renderWorkspaceTabs();renderTree();renderEditor();renderTerminals();renderGit();}}
  else renderWorkspaceTabs();updateDirty();persist();
}
function showFolderMenu(entry,event){folderMenuEntry=entry;const menu=$('folder-menu');menu.hidden=false;const box=event.currentTarget.getBoundingClientRect();menu.style.left=`${Math.max(8,Math.min(event.clientX||box.left,innerWidth-240))}px`;menu.style.top=`${Math.max(8,Math.min(event.clientY||box.bottom,innerHeight-100))}px`;$('folder-new-tab').focus();}
$('folder-new-tab').onclick=action(async()=>{const entry=folderMenuEntry;$('folder-menu').hidden=true;const root=await api.openChildFolder(entry.path,state.root);await addWorkspace(root);});
$('folder-new-terminal').onclick=action(async()=>{const entry=folderMenuEntry;$('folder-menu').hidden=true;await newTerminal({cwd:entry.path});});
document.addEventListener('pointerdown',event=>{if(!$('folder-menu').contains(event.target))$('folder-menu').hidden=true;});
document.addEventListener('keydown',event=>{if(event.key==='Escape')$('folder-menu').hidden=true;});
function applyRoot(){ $('workspace-name').textContent=state.root||'Seu espaço de trabalho';$('workspace-name').title=state.root||'';$('tree-root').replaceChildren();if(state.root){$('tree-root').innerHTML=icon('folder');const label=document.createElement('span');label.textContent=basename(state.root);$('tree-root').append(label);$('tree-root').title='Solte aqui para mover para a raiz da pasta';fileDropTarget($('tree-root'),'.');}$('connection').textContent=state.root?'Pasta local':'Pronto para começar';$('new-terminal').disabled=!state.root;$('shell-type').disabled=!state.root; }

async function openFile(candidate,workspace=state) {
  let file=workspace.files.find(f=>f.path===candidate);
  if(!file){const data=await api.read(candidate,workspace.root);const eol=data.text.includes('\r\n')?'\r\n':'\n';const text=data.text.replace(/\r\n/g,'\n');file={...data,text,saved:text,eol,scroll:0,preview:false};workspace.files.push(file);}
  if(workspace===state && state.file)state.file.scroll=$('code').scrollTop;
  workspace.file=file;if(workspace===state){renderEditor();renderTree();fitAll();}
}
function renderEditor() {
  document.body.classList.toggle('editor-focused', Boolean(state.file?.fullEditor));
  const file=state.file;$('editor').hidden=!file;$('editor-resize').hidden=!file;
  $('file-tabs').replaceChildren();
  for(const item of state.files){
    const tab=document.createElement('div');tab.className='file-tab'+(file===item?' active':'');
    const activate=document.createElement('button');activate.role='tab';activate.setAttribute('aria-selected',String(file===item));activate.title=item.path;activate.textContent=basename(item.path)+(item.text!==item.saved?' •':'');activate.onclick=()=>{if(state.file)state.file.scroll=$('code').scrollTop;state.file=item;renderEditor();renderTree();};
    tab.append(activate,button(`Fechar ${basename(item.path)}`,'close',()=>closeFile(item)));$('file-tabs').append(tab);
  }
  if(file){$('code').value=file.text;$('code').scrollTop=file.scroll||0;$('editor-path').textContent=file.path;updateLines();$('file-state').textContent=file.text!==file.saved?'Alterações não salvas':'UTF-8';$('status-file').textContent=basename(file.path);}
  else $('status-file').textContent='MCode Space';
  renderMarkdownMode();
  $('editor-fullscreen').setAttribute('aria-pressed',String(Boolean(file?.fullEditor)));
  $('editor-focus-label').textContent=file?.fullEditor?'Voltar aos terminais':'Expandir editor';
  $('editor-fullscreen').firstElementChild.innerHTML=icon(file?.fullEditor?'minimize':'maximize');
  fitAll();
}
function renderMarkdownMode(){
  const file=state.file,isMarkdown=Boolean(file&&/\.(md|markdown)$/i.test(file.path));
  const preview=isMarkdown&&file.preview;
  $('markdown-modes').hidden=!isMarkdown;
  document.querySelector('.code-area').hidden=preview;$('markdown-content').hidden=!preview;
  $('markdown-edit').classList.toggle('selected',!preview);$('markdown-edit').setAttribute('aria-pressed',String(!preview));
  $('markdown-preview').classList.toggle('selected',Boolean(preview));$('markdown-preview').setAttribute('aria-pressed',String(Boolean(preview)));
  if(preview){
    $('markdown-content').innerHTML=renderMarkdown(file.text);
    const workspace=state;
    for(const placeholder of $('markdown-content').querySelectorAll('[data-markdown-image]')){
      Promise.resolve().then(async()=>{
        const href=decodeURIComponent(placeholder.dataset.markdownImage),url=new URL(href,`https://workspace.invalid/${file.path}`);
        if(url.origin!=='https://workspace.invalid')throw new Error('Imagem externa');
        const source=await api.readImage(decodeURIComponent(url.pathname.slice(1)),workspace.root);
        if(!placeholder.isConnected)return;
        const image=document.createElement('img');image.src=source;image.alt=placeholder.textContent;image.className='markdown-image';placeholder.replaceWith(image);
      }).catch(()=>{if(placeholder.isConnected)placeholder.textContent=`[Imagem indisponível: ${placeholder.textContent}]`;});
    }
  }
}
$('markdown-edit').onclick=()=>{if(state.file){state.file.preview=false;renderMarkdownMode();$('code').focus();}};
$('markdown-preview').onclick=()=>{if(state.file){state.file.preview=true;renderMarkdownMode();$('markdown-content').focus();}};
$('markdown-content').onclick=action(async event=>{
  const link=event.target.closest('a');if(!link)return;event.preventDefault();const href=link.getAttribute('href');if(!href)return;
  if(/^https?:\/\//i.test(href)){await api.openLink(href);return;}
  if(href.startsWith('#')){const target=$('markdown-content').querySelector(`[id="${CSS.escape(decodeURIComponent(href.slice(1)))}"]`);target?.scrollIntoView();return;}
  const url=new URL(href,`https://workspace.invalid/${state.file.path}`);
  if(url.origin==='https://workspace.invalid')await openFile(decodeURIComponent(url.pathname.slice(1)));
});
function updateLines(){const count=$('code').value.split('\n').length;$('line-numbers').textContent=Array.from({length:count},(_,i)=>i+1).join('\n');$('line-numbers').scrollTop=$('code').scrollTop;}
async function saveFile(){const workspace=state,file=workspace.file;if(!file||file.text===file.saved)return;const text=file.text;const result=await api.save({path:file.path,text:file.eol==='\r\n'?text.replace(/\n/g,'\r\n'):text,revision:file.revision,bom:file.bom},workspace.root);file.revision=result.revision;file.saved=text;if(workspace===state)renderEditor();updateDirty();notify('Arquivo salvo.');await updateGit(workspace);}
async function closeFile(file){if(file.text!==file.saved&&!await api.confirmDiscard(basename(file.path)))return;state.files=state.files.filter(f=>f!==file);if(state.file===file)state.file=state.files.at(-1)||null;renderEditor();renderTree();updateDirty();fitAll();}
$('code').addEventListener('input',()=>{if(!state.file)return;state.file.text=$('code').value;state.file.scroll=$('code').scrollTop;updateLines();$('file-state').textContent=state.file.text!==state.file.saved?'Alterações não salvas':'UTF-8';const active=$('file-tabs').querySelector('[aria-selected=true]');if(active)active.textContent=basename(state.file.path)+(state.file.text!==state.file.saved?' •':'');updateDirty();});
$('code').addEventListener('scroll',()=>{$('line-numbers').scrollTop=$('code').scrollTop;});
$('code').addEventListener('keydown',event=>{if(event.key==='Tab'){event.preventDefault();const field=event.target,start=field.selectionStart;field.setRangeText('  ',start,field.selectionEnd,'end');field.dispatchEvent(new Event('input'));}});

api.onData(({id,data})=>{const item=allTerminals().find(t=>t.id===id);if(item)item.term.write(data);else{const old=pendingOutput.get(id)||'';pendingOutput.set(id,(old+data).slice(-256000));}});
function terminalExited(id,exitCode){const item=allTerminals().find(t=>t.id===id);if(!item){pendingExits.set(id,exitCode);return;}item.ended=true;item.term.writeln(`\r\n\x1b[90mProcesso encerrado (${exitCode}). Abra um novo terminal para continuar.\x1b[0m`);item.panel.classList.add('ended');renderTabs();}
api.onExit(({id,exitCode})=>terminalExited(id,exitCode));
async function newTerminal(options={}) {
  if(!state.root)return openFolder();
  const workspace=state;
  const created=await api.createTerminal({shell:options.shell||(restoring?environment.shells[0].id:$('shell-type').value),cwd:options.cwd||'.',root:workspace.root});
  const term=new Terminal({windowsPty:state.windowsPty,fontFamily:'Geist, Consolas, monospace',fontSize:12,lineHeight:1.3,cursorBlink:true,cursorStyle:'bar',scrollback:5000,allowProposedApi:false,theme:{background:'#0b100d',foreground:'#dce7df',cursor:'#a3ff12',selectionBackground:'#a3ff1240',black:'#18221b',red:'#f28b82',green:'#a3ff12',yellow:'#efc67b',blue:'#86baff',magenta:'#eca2ca',cyan:'#80cbc4',white:'#f1f5ef',brightBlack:'#9eafa3'}});
  const fit=new FitAddon();term.loadAddon(fit);
  const item={...created,name:options.name||`${created.label} ${state.terminals.length+1}`,color:colors[options.color]?options.color:'green',glyph:['terminal','code','branch','folder','server','database','rocket'].includes(options.glyph)?options.glyph:'terminal',term,fit,ended:false};
  const panel=document.createElement('div');panel.className='terminal-panel';panel.setAttribute('role','tabpanel');panel.style.setProperty('--tab-color',colors[item.color]);
  const head=document.createElement('div');head.className='panel-header';
  const location=document.createElement('span');location.className='panel-path';location.textContent=item.cwd==='.'?basename(state.root):item.cwd;location.title='Pasta inicial: '+item.cwd;item.locationNode=location;
  head.innerHTML=icon('folder');head.append(location);panel.append(head);panel.setAttribute('aria-label',item.name);
  const host=document.createElement('div');host.className='terminal-host';panel.append(host);item.host=host;item.panel=panel;
  panel.addEventListener('pointerdown',()=>activateTerminal(item,false));
  panel.addEventListener('focusin',()=>{if(state.active!==item.id)activateTerminal(item,false);});
  panel.ondragover=e=>{if(e.dataTransfer.types.includes('application/mcode-file')){e.preventDefault();panel.classList.add('drop-target');}};
  panel.ondragleave=()=>panel.classList.remove('drop-target');
  panel.ondrop=action(async e=>{e.preventDefault();panel.classList.remove('drop-target');const entry=readDrop(e);if(!entry)return;if(entry.directory)await newTerminal({cwd:entry.path});else await openFile(entry.path);});
  $('terminal-panels').append(panel);term.open(host);term.onData(data=>{if(!item.ended)api.write(item.id,data).catch(e=>notify(e.message));});
  term.attachCustomKeyEventHandler(event=>!(event.ctrlKey&&['o','b','s'].includes(event.key.toLowerCase()))&&!(event.ctrlKey&&event.shiftKey&&['T','W','G','ArrowLeft','ArrowRight'].includes(event.key)));
  workspace.terminals.push(item);workspace.active=item.id;if(created.agent)window.dispatchEvent(new CustomEvent('mcode-agent-started'));if(pendingOutput.has(item.id)){term.write(pendingOutput.get(item.id));pendingOutput.delete(item.id);}
  if(pendingExits.has(item.id)){terminalExited(item.id,pendingExits.get(item.id));pendingExits.delete(item.id);}
  if(workspace===state){renderTerminals();setTimeout(()=>term.focus(),0);}else panel.remove();persist();return item;
}
function renderPanelHeader(item){
  const head=item.panel.querySelector('.panel-header');head.replaceChildren();
  const glyph=document.createElement('span');glyph.className='terminal-glyph';glyph.innerHTML=icon(item.glyph);glyph.style.color=colors[item.color];
  const name=document.createElement('span');name.className='panel-name';name.textContent=item.name+(item.ended?' (encerrado)':'');name.title=item.name;
  name.ondblclick=()=>renameTerminal(item);
  const controls=document.createElement('div');controls.className='panel-controls';
  controls.append(button(`Editar ${item.name}`,'edit',()=>renameTerminal(item)),button(`Mover ${item.name} para esquerda`,'left',()=>moveTerminal(item,-1)),button(`Mover ${item.name} para direita`,'right',()=>moveTerminal(item,1)),button(`Fechar ${item.name}`,'close',()=>closeTerminal(item)));
  head.append(glyph,name,item.locationNode,controls);
}
function renderTabs(){
  $('terminal-tabs').replaceChildren();$('terminal-tabs').hidden=state.layout!=='tabs';
  for(const item of state.terminals){
    const tab=document.createElement('div');tab.className='terminal-tab'+(item.id===state.active?' active':'');tab.style.setProperty('--tab-color',colors[item.color]);tab.draggable=true;tab.dataset.id=item.id;
    const dot=document.createElement('span');dot.className='terminal-glyph';dot.innerHTML=icon(item.glyph);dot.style.color=item.ended?'#9eafa3':colors[item.color];
    renderPanelHeader(item);
    const activate=document.createElement('button');activate.setAttribute('role','tab');activate.setAttribute('aria-selected',String(item.id===state.active));activate.textContent=item.name+(item.ended?' (encerrado)':'');activate.title='Clique duplo ou F2 para renomear';activate.onclick=()=>activateTerminal(item);activate.ondblclick=()=>renameTerminal(item);activate.onkeydown=e=>{if(e.key==='F2'){e.preventDefault();renameTerminal(item);}};
    tab.oncontextmenu=e=>{e.preventDefault();renameTerminal(item);};
    tab.append(dot,activate,button(`Renomear ${item.name}`,'edit',()=>renameTerminal(item)),button(`Mover ${item.name} para esquerda`,'left',()=>moveTerminal(item,-1)),button(`Mover ${item.name} para direita`,'right',()=>moveTerminal(item,1)),button(`Fechar ${item.name}`,'close',()=>closeTerminal(item)));
    tab.ondragstart=e=>{e.dataTransfer.setData('application/mcode-terminal',item.id);e.dataTransfer.effectAllowed='move';};
    tab.ondragover=e=>{if(e.dataTransfer.types.includes('application/mcode-terminal')){e.preventDefault();tab.classList.add('drag-over');}};tab.ondragleave=()=>tab.classList.remove('drag-over');
    tab.ondrop=e=>{e.preventDefault();const source=state.terminals.find(t=>t.id===e.dataTransfer.getData('application/mcode-terminal'));if(!source||source===item)return;const target=state.terminals.indexOf(item);state.terminals.splice(state.terminals.indexOf(source),1);state.terminals.splice(target,0,source);renderTerminals();persist();};
    $('terminal-tabs').append(tab);
  }
  $('terminal-count').textContent=state.terminals.length;
}
function activateTerminal(item,focus=true){state.active=item.id;for(const tab of $('terminal-tabs').children){const active=tab.dataset.id===item.id;tab.classList.toggle('active',active);tab.querySelector('[role=tab]').setAttribute('aria-selected',String(active));}for(const terminal of state.terminals){terminal.panel.hidden=state.layout==='tabs'&&terminal.id!==item.id;terminal.panel.classList.toggle('focused',terminal.id===item.id);}fitAll();if(focus)item.term.focus();}
function renderTerminals(){
  renderTabs();$('terminal-panels').dataset.layout=state.layout;$('terminal-panels').style.setProperty('--columns',Math.min(3,state.terminals.length)||1);
  for(const item of state.terminals){item.panel.hidden=state.layout==='tabs'&&item.id!==state.active;item.panel.classList.toggle('focused',item.id===state.active);$('terminal-panels').append(item.panel);}
  $('mosaic-layout').hidden=state.layout!=='grid';$('mosaic-layout').value=state.mosaic;
  const layout=state.layout==='grid'?terminalLayout(state.mosaic,state.terminals.length):null;
  $('terminal-panels').style.gridTemplateColumns=layout?.columns||'';$('terminal-panels').style.gridTemplateRows=layout?.rows||'';
  state.terminals.forEach((item,index)=>{item.panel.style.gridColumn=layout?.placements[index]?.column||'';item.panel.style.gridRow=layout?.placements[index]?.row||'';});
  $('welcome').hidden=state.terminals.length>0;
  if(!state.terminals.length){$('welcome').querySelector('h2').innerHTML=state.root?'Seu próximo<br>comando.':'Seu código.<br>Seu espaço.';$('welcome').querySelector('p').innerHTML=state.root?'Abra um terminal para trabalhar nesta pasta.':'Arquivos de um lado. Seus terminais do outro.<br>Abra uma pasta e comece a construir.';$('welcome-open').innerHTML=(state.root?'Novo terminal':'Escolher pasta')+icon('arrowUpRight');}
  for(const b of document.querySelectorAll('[data-layout]'))if(b.tagName==='BUTTON'){b.classList.toggle('selected',b.dataset.layout===state.layout);b.setAttribute('aria-pressed',String(b.dataset.layout===state.layout));}
  $('status-layout').textContent=state.layout==='grid'?`Mosaico: ${MOSAICS[state.mosaic]}`:{tabs:'Abas',columns:'Lado a lado'}[state.layout];fitAll();
}
function moveTerminal(item,delta){const index=state.terminals.indexOf(item),next=index+delta;if(next<0||next>=state.terminals.length)return;[state.terminals[index],state.terminals[next]]=[state.terminals[next],state.terminals[index]];renderTerminals();persist();}
async function closeTerminal(item){
  // Closing a shell terminates its running jobs; require an explicit confirmation.
  if(!item.ended&&!window.confirm(`Encerrar ${item.name} e seus processos?`))return;
  await api.closeTerminal(item.id);item.term.dispose();item.panel.remove();state.terminals=state.terminals.filter(t=>t!==item);if(state.active===item.id)state.active=state.terminals.at(-1)?.id||null;renderTerminals();persist();
}
function renameTerminal(item){renaming=item;$('terminal-name').value=item.name;$('terminal-color').value=item.color;$('terminal-icon-choice').value=item.glyph;if(!$('rename-dialog').open)$('rename-dialog').showModal();$('terminal-name').focus();$('terminal-name').select();}
$('rename-form').addEventListener('submit',event=>{event.preventDefault();if(!renaming)return;renaming.name=$('terminal-name').value.trim()||renaming.name;renaming.color=$('terminal-color').value;renaming.glyph=$('terminal-icon-choice').value;renaming.panel.setAttribute('aria-label',renaming.name);renaming.panel.style.setProperty('--tab-color',colors[renaming.color]);renderTabs();persist();$('rename-dialog').close('save');renaming=null;});
$('cancel-rename').onclick=()=>$('rename-dialog').close('cancel');
$('rename-dialog').addEventListener('close',()=>{renaming=null;});
function readDrop(event){try{return JSON.parse(event.dataTransfer.getData('application/mcode-file'));}catch{return null;}}
$('editor').ondragover=e=>{if(e.dataTransfer.types.includes('application/mcode-file')){e.preventDefault();$('editor').classList.add('drop-target');}};
$('editor').ondragleave=()=>$('editor').classList.remove('drop-target');
$('editor').ondrop=action(async e=>{e.preventDefault();$('editor').classList.remove('drop-target');const entry=readDrop(e);if(entry&&!entry.directory)await openFile(entry.path);});
$('welcome').ondragover=e=>{if(e.dataTransfer.types.includes('application/mcode-file'))e.preventDefault();};
$('welcome').ondrop=action(async e=>{e.preventDefault();const entry=readDrop(e);if(entry?.directory)await newTerminal({cwd:entry.path});else if(entry)await openFile(entry.path);});
function renderGit(){const info=state.git;$('git-status').replaceChildren();if(info){$('git-status').innerHTML=icon('branch');const text=document.createElement('span');text.textContent=`${info.branch} · ${info.changes?info.changes+' alterações':'limpo'}`;$('git-status').append(text);}}
async function updateGit(workspace=state){if(!workspace.root)return;workspace.git=await api.gitStatus(workspace.root);workspace.lastGit=Date.now();if(workspace===state)renderGit();}

function setupResize(id,fn){const handle=$(id);handle.addEventListener('pointerdown',e=>{handle.setPointerCapture(e.pointerId);document.body.classList.add('is-resizing');const move=event=>fn(event);const stop=()=>{handle.removeEventListener('pointermove',move);document.body.classList.remove('is-resizing');persist();fitAll();};handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',stop,{once:true});});}
setupResize('sidebar-resize',e=>{state.sidebar=Math.max(190,Math.min(480,e.clientX));document.documentElement.style.setProperty('--sidebar',`${state.sidebar}px`);});
setupResize('editor-resize',e=>{const area=document.querySelector('.workbench').getBoundingClientRect();const height=Math.max(160,Math.min(area.height-230,e.clientY-area.top));document.documentElement.style.setProperty('--editor-height',`${height}px`);});
$('sidebar-resize').onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();state.sidebar=Math.max(190,Math.min(480,state.sidebar+(e.key==='ArrowLeft'?-16:16)));document.documentElement.style.setProperty('--sidebar',`${state.sidebar}px`);persist();fitAll();}};
$('editor-resize').onkeydown=e=>{if(['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const h=$('editor').clientHeight+(e.key==='ArrowUp'?-20:20);const max=document.querySelector('.workbench').clientHeight-230;document.documentElement.style.setProperty('--editor-height',`${Math.max(160,Math.min(max,h))}px`);fitAll();}};
$('collapse-tree').innerHTML=icon('collapse');$('terminal-icon').innerHTML=icon('terminal');$('hide-editor').innerHTML=icon('up');
$('markdown-edit').innerHTML=icon('code');$('markdown-preview').innerHTML=icon('eye');
for(const node of document.querySelectorAll('[data-icon]'))node.innerHTML=icon(node.dataset.icon);
function toggleExplorer(){const hidden=document.body.classList.toggle('sidebar-hidden');$('toggle-explorer').innerHTML=icon(hidden?'sidebarOpen':'sidebarClose');$('toggle-explorer').setAttribute('aria-expanded',String(!hidden));$('toggle-explorer').setAttribute('aria-label',hidden?'Mostrar lateral':'Recolher lateral');$('toggle-explorer').title=(hidden?'Mostrar':'Recolher')+' lateral (Ctrl B)';fitAll();}
$('toggle-explorer').innerHTML=icon('sidebarClose');$('collapse-explorer').innerHTML=icon('sidebarClose');$('toggle-explorer').onclick=toggleExplorer;$('collapse-explorer').onclick=toggleExplorer;
$('expand-explorer').onclick=toggleExplorer;
$('editor-fullscreen').onclick=()=>{if(state.file){state.file.fullEditor=!state.file.fullEditor;renderEditor();}};
setupAccount({api,icon,notify});
setupFinance({api,icon,fitAll,notify});
setupTodos({api,icon,notify});
setupSidebars({icon,fitAll});
setupContracts({api,notify});
setupUpdates({api,notify});
setupMonitor({api,icon,notify,focus:async id=>{const workspace=workspaces.find(w=>w.terminals.some(t=>t.id===id));if(!workspace)return notify('Este terminal já foi fechado.');await activateWorkspace(workspace);if(workspace.file?.fullEditor){workspace.file.fullEditor=false;renderEditor();}activateTerminal(workspace.terminals.find(t=>t.id===id));}});
for(const [value,label] of Object.entries(MOSAICS)){const option=document.createElement('option');option.value=value;option.textContent=label;$('mosaic-layout').append(option);}
$('mosaic-layout').onchange=()=>{state.mosaic=$('mosaic-layout').value;renderTerminals();persist();};
for(const b of document.querySelectorAll('button[data-layout]')){b.innerHTML=icon(b.dataset.layout);b.onclick=()=>{state.layout=b.dataset.layout;renderTerminals();persist();};}
$('open-folder').onclick=action(openFolder);$('welcome-open').onclick=action(()=>state.root?newTerminal():openFolder());$('new-terminal').onclick=action(()=>newTerminal());$('collapse-tree').onclick=()=>{state.expanded.clear();renderTree();};$('file-filter').oninput=()=>{state.filter=$('file-filter').value;renderTree();};$('save-file').onclick=action(saveFile);$('hide-editor').onclick=()=>{$('editor').hidden=true;$('editor-resize').hidden=true;fitAll();};$('git-status').onclick=action(()=>updateGit());
document.addEventListener('keydown',action(async e=>{
  if(!e.ctrlKey)return;const key=e.key.toLowerCase();
  if(key==='o'){e.preventDefault();await openFolder();}
  else if(key==='s'){e.preventDefault();await saveFile();}
  else if(key==='b'){e.preventDefault();toggleExplorer();}
  else if(e.shiftKey&&key==='t'){e.preventDefault();await newTerminal();}
  else if(e.shiftKey&&key==='g'){e.preventDefault();state.layout=state.layout==='grid'?'tabs':'grid';renderTerminals();persist();}
  else if(e.shiftKey&&key==='w'){e.preventDefault();const item=state.terminals.find(t=>t.id===state.active);if(item)await closeTerminal(item);}
  else if(e.shiftKey&&['arrowleft','arrowright'].includes(key)){e.preventDefault();const item=state.terminals.find(t=>t.id===state.active);if(item)moveTerminal(item,key==='arrowleft'?-1:1);}
}));
window.addEventListener('focus',()=>{if(state.root)updateGit().catch(()=>{});});
window.addEventListener('dragover',event=>event.preventDefault());window.addEventListener('drop',event=>event.preventDefault());

async function init(){
  if(!api){notify('Abra este aplicativo pelo Electron: execute npm start.');return;}
  const initial=await api.initial();environment={shells:initial.shells,windowsPty:initial.windowsPty||undefined};state=emptyWorkspace();restoring=true;
  for(const shell of environment.shells){const option=document.createElement('option');option.value=shell.id;option.textContent=shell.label;$('shell-type').append(option);}
  const agentGroup=document.createElement('optgroup');agentGroup.label='Agentes de IA';for(const agent of initial.agents||[]){const option=document.createElement('option');option.value='agent:'+agent.id;option.textContent=agent.label+(agent.available?'':' · não instalado');option.disabled=!agent.available;agentGroup.append(option);}$('shell-type').append(agentGroup);
  for(const saved of initial.workspaces||[]){const workspace=emptyWorkspace(saved.root,saved);workspaces.push(workspace);await activateWorkspace(workspace);for(const tab of saved.tabs){try{await newTerminal(tab);}catch(e){notify('Não foi possível restaurar um terminal: '+e.message);}}if(!workspace.terminals.length){try{await newTerminal();}catch(e){notify(e.message);}}}
  const active=workspaces.find(w=>w.root===initial.root)||workspaces[0];if(active)await activateWorkspace(active);
  applyRoot();renderWorkspaceTabs();renderTree();renderEditor();renderTerminals();restoring=false;persist();
}
renderBrandAscii($('brand-ascii')).catch(()=>{});
init().catch(e=>notify(e.message));
