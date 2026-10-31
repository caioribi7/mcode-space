const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const logCache=new Map();
const number=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
const samePath=(a,b)=>typeof a==='string'&&path.resolve(a).replaceAll('\\','/').toLowerCase()===path.resolve(b).replaceAll('\\','/').toLowerCase();
function limits(value){
 return ['primary','secondary'].flatMap(key=>{const window=value?.[key],used=number(window?.used_percent);return used===null?[]:[{name:key==='primary'?'Janela principal':'Janela secundária',usedPercent:Math.min(100,used),minutes:number(window.window_minutes),resetsAt:number(window.resets_at)}];});
}
function codexUsage(lines){
 let usage=null,quota=[],at=null;
 for(const line of lines){let item;try{item=JSON.parse(line);}catch{continue;}
  if(item.type!=='event_msg'||item.payload?.type!=='token_count')continue;
  const value=item.payload.info?.total_token_usage;
  if(value)usage={input:number(value.input_tokens),output:number(value.output_tokens),cached:number(value.cached_input_tokens)};
  if(item.payload.rate_limits)quota=limits(item.payload.rate_limits);
  at=item.timestamp;
 }
 return {usage,limits:quota,observedAt:at};
}
function claudeUsage(lines){
 const messages=new Map();let at=null;
 for(const line of lines){let item;try{item=JSON.parse(line);}catch{continue;}
  const message=item.type==='assistant'?item.message:null;
  if(message?.id&&message.usage){const u=message.usage;messages.set(message.id,{input:number(u.input_tokens),output:number(u.output_tokens),cached:number(u.cache_read_input_tokens)});at=item.timestamp;}
 }
 return {usage:sumUsage([...messages.values()]),limits:[],observedAt:at};
}
function sumUsage(rows){if(!rows.length)return null;return {input:rows.reduce((n,r)=>n+(r.input||0),0),output:rows.reduce((n,r)=>n+(r.output||0),0),cached:rows.reduce((n,r)=>n+(r.cached||0),0)};}
async function readLogs(agent,cwd,since,home){
 const base=agent==='codex'?path.join(process.env.CODEX_HOME||path.join(home,'.codex'),'sessions'):path.join(process.env.CLAUDE_CONFIG_DIR||path.join(home,'.claude'),'projects',cwd.replace(/[^a-zA-Z0-9]/g,'-'));
 const dirs=[];
 if(agent==='codex'){
  const date=new Date(since);date.setUTCHours(0,0,0,0);
  for(;date.getTime()<=Date.now()&&dirs.length<32;date.setUTCDate(date.getUTCDate()+1))dirs.push(path.join(base,String(date.getUTCFullYear()),String(date.getUTCMonth()+1).padStart(2,'0'),String(date.getUTCDate()).padStart(2,'0')));
 }else dirs.push(base);
 let results=[],truncated=Date.now()-since>31*86400000;
 for(const dir of dirs){
  let entries;try{entries=await fs.readdir(dir,{withFileTypes:true});}catch(e){if(e.code==='ENOENT')continue;throw e;}
  const logs=entries.filter(e=>e.isFile()&&e.name.endsWith('.jsonl'));if(logs.length>256)truncated=true;
  for(const entry of logs.slice(-256)){
   const file=path.join(dir,entry.name),stat=await fs.stat(file);if(stat.mtimeMs<since)continue;
   const cached=logCache.get(file);
   if(cached&&cached.size===stat.size&&cached.mtime===stat.mtimeMs){if(samePath(cached.cwd,cwd)&&cached.date>=since)results.push(cached.result);continue;}
   const handle=await fs.open(file,'r');
   try{
    const head=Buffer.alloc(Math.min(stat.size,65536));await handle.read(head,0,head.length,0);
    const lines=head.toString('utf8').split('\n');let metadata;
    for(const line of lines){try{const item=JSON.parse(line);if(agent==='codex'&&item.type==='session_meta'){metadata={cwd:item.payload.cwd,date:item.payload.timestamp||item.timestamp};break;}if(agent==='claude'&&item.cwd){metadata={cwd:item.cwd,date:item.timestamp};break;}}catch{}}
    if(!metadata||!samePath(metadata.cwd,cwd)||!Number.isFinite(Date.parse(metadata.date))||Date.parse(metadata.date)<since)continue;
    // Codex stores cumulative counters; Claude requires its complete message ledger.
    const cap=agent==='codex'?4*1024*1024:32*1024*1024;
    if(agent==='claude'&&stat.size>cap){truncated=true;continue;}
    const offset=Math.max(0,stat.size-cap),buffer=Buffer.alloc(stat.size-offset);await handle.read(buffer,0,buffer.length,offset);
    const content=buffer.toString('utf8').split('\n');if(offset)content.shift();
    const result=agent==='codex'?codexUsage(content):claudeUsage(content);results.push(result);
    logCache.set(file,{size:stat.size,mtime:stat.mtimeMs,cwd:metadata.cwd,date:Date.parse(metadata.date),result});
    if(logCache.size>256)logCache.delete(logCache.keys().next().value);
   }finally{await handle.close();}
  }
 }
 const latest=results.filter(r=>r.observedAt).sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt))[0];
 return {usage:sumUsage(results.filter(r=>r.usage).map(r=>r.usage)),limits:latest?.limits||[],observedAt:latest?.observedAt||null,note:truncated?'O histórico excedeu o limite de leitura; contagem parcial.':null};
}
function readDatabase(agent,cwd,since,home){
 const {DatabaseSync}=require('node:sqlite');
 const file=agent==='hermes'?path.join(process.env.HERMES_HOME||(process.platform==='win32'?path.join(process.env.LOCALAPPDATA||home,'hermes'):path.join(home,'.hermes')),'state.db'):path.join(process.env.XDG_DATA_HOME||path.join(home,'.local/share'),'opencode/opencode.db');
 const db=new DatabaseSync(file,{readOnly:true});
 try{
  db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=1000');
  const sql=agent==='hermes'?'SELECT cwd, input_tokens AS input, output_tokens AS output, cache_read_tokens AS cached FROM sessions WHERE source = ? AND started_at >= ?':'SELECT directory AS cwd, tokens_input AS input, tokens_output AS output, tokens_cache_read AS cached FROM session WHERE time_created >= ?';
  const rows=agent==='hermes'?db.prepare(sql).all('cli',since/1000):db.prepare(sql).all(since);
  return {usage:sumUsage(rows.filter(r=>samePath(r.cwd,cwd)).map(r=>({input:number(r.input),output:number(r.output),cached:number(r.cached)}))),limits:[],observedAt:null,note:null};
 }finally{db.close();}
}
async function collectUsage(agent,cwd,since){
 try{return ['codex','claude'].includes(agent)?await readLogs(agent,cwd,since,os.homedir()):readDatabase(agent,cwd,since,os.homedir());}
 catch{return {usage:null,limits:[],note:'Telemetria indisponível: o CLI ainda não criou o histórico, ou esta versão usa outro formato.'};}
}
module.exports={collectUsage,codexUsage,claudeUsage,limits,readDatabase,readLogs};
