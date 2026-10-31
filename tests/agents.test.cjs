const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {resolveAgent,createMonitor}=require('../electron/agents.cjs');
test('agent resolver accepts only fixed agents and absolute installed executable paths',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mcode-agents-'));
 try{
  await fs.writeFile(path.join(dir,'codex.cmd'),'');
  const result=resolveAgent('codex',{PATH:dir,APPDATA:dir,LOCALAPPDATA:dir,SystemRoot:'C:\\Windows'},'win32');
  assert.match(result.command,/cmd\.exe$/);assert.equal(result.args,`/d /s /c ""${path.join(dir,'codex.cmd')}""`);
  assert.equal(resolveAgent('codex',{PATH:dir,APPDATA:dir,LOCALAPPDATA:dir},'win32',[dir]),null);
  assert.throws(()=>resolveAgent('codex & other'),/desconhecido/);
  await fs.mkdir(path.join(dir,'bad&path'));await fs.writeFile(path.join(dir,'bad&path','claude.cmd'),'');
  assert.equal(resolveAgent('claude',{PATH:path.join(dir,'bad&path'),APPDATA:dir,LOCALAPPDATA:dir},'win32'),null);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('monitor coalesces polling, groups tokens once per project and keeps ended sessions',async()=>{
 let at=1000,calls=0;const monitor=createMonitor({now:()=>at,collect:async()=>{calls++;return {usage:{input:12,output:3,cached:0},limits:[]};}});
 monitor.start('a','codex',42,'project');monitor.start('b','codex',43,'project');
 const [a,b]=await Promise.all([monitor.read(),monitor.read()]);assert.equal(calls,1);assert.deepEqual(a,b);assert.equal(a.groups.length,1);assert.equal(a.sessions.length,2);
 at+=3000;monitor.end('a',0);const result=await monitor.read();assert.equal(result.sessions[0].endedAt,4000);assert.equal(result.groups[0].since,1000);
});
