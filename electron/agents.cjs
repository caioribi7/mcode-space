const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const AGENTS = [{id:'codex',label:'Codex'},{id:'hermes',label:'Hermes Agent'},{id:'opencode',label:'OpenCode'},{id:'claude',label:'Claude'}];

function resolveAgent(id, env=process.env, platform=process.platform, excludedRoots=[]) {
  if (!AGENTS.some(a=>a.id===id)) throw new Error('Agente desconhecido.');
  const dirs = (env.PATH || env.Path || '').split(platform==='win32'?';':':').map(s=>s.replace(/^"|"$/g,''));
  if(platform==='win32') dirs.push(path.join(env.APPDATA||os.homedir(),'npm'),path.join(env.LOCALAPPDATA||os.homedir(),'hermes/bin'),path.join(os.homedir(),'.local/bin'));
  for(const dir of dirs){
    if(!path.isAbsolute(dir))continue;
    for(const ext of platform==='win32'?['.exe','.cmd','.bat']:['']){
      const candidate=path.join(dir,id+ext);
      try{if(!fs.statSync(candidate).isFile())continue;}catch{continue;}
      const real=fs.realpathSync(candidate);
      if(excludedRoots.some(root=>{const relative=path.relative(root,real);return !relative||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));}))continue;
      if(platform==='win32'&&ext!=='.exe'){
        if(/[&|<>^%!"\r\n]/.test(candidate))continue;
        // node-pty must receive cmd's raw command line; argv escaping breaks shim quotes.
        return {command:path.join(env.SystemRoot||'C:\\Windows','System32/cmd.exe'),args:`/d /s /c ""${candidate}""`};
      }
      return {command:candidate,args:[]};
    }
  }
  return null;
}

const {collectUsage}=require('./agent-usage.cjs');
function createMonitor({collect=collectUsage,now=Date.now}={}){
  const records=new Map(),groups=new Map();let pending=null,lastRead=0,cached={sessions:[],groups:[]};
  return {
    start(id,agent,pid,cwd,startedAt=now()){
      const key=agent+'|'+cwd.toLowerCase();
      if(!groups.has(key))groups.set(key,{agent,cwd,since:startedAt});
      records.set(id,{id,agent,pid,cwd,startedAt,endedAt:null,exitCode:null});
      while(records.size>100){const ended=[...records.values()].find(r=>r.endedAt!==null);if(!ended)break;records.delete(ended.id);}
      lastRead=0;
    },
    end(id,exitCode=null){const record=records.get(id);if(record&&record.endedAt===null){record.endedAt=now();record.exitCode=exitCode;}lastRead=0;},
    async read(){
      if(pending)return pending;if(lastRead&&now()-lastRead<2000)return cached;
      pending=(async()=>{
        const metrics=await Promise.all([...groups.values()].map(async group=>({...group,...await collect(group.agent,group.cwd,group.since)})));
        const timestamp=now();cached={sessions:[...records.values()].map(r=>({...r})),groups:metrics,updatedAt:timestamp};lastRead=timestamp;return cached;
      })().finally(()=>{pending=null;});return pending;
    }
  };
}
module.exports={AGENTS,resolveAgent,createMonitor};
