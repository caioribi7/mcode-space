const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {codexUsage,claudeUsage,readDatabase,readLogs}=require('../electron/agent-usage.cjs');
test('Codex reads cumulative counters and real quota windows without summing repeated snapshots',()=>{
 const event=(input,percent)=>JSON.stringify({type:'event_msg',timestamp:'2026-10-31T10:00:00Z',payload:{type:'token_count',info:{total_token_usage:{input_tokens:input,output_tokens:4,cached_input_tokens:8}},rate_limits:{primary:{used_percent:percent,window_minutes:300,resets_at:12345}}}});
 const result=codexUsage(['invalid',event(10,12),event(20,15),JSON.stringify({type:'response_item',payload:{secret:'never exposed'}})]);
 assert.deepEqual(result.usage,{input:20,output:4,cached:8});assert.equal(result.limits[0].usedPercent,15);assert.equal(result.limits[0].resetsAt,12345);assert.equal(JSON.stringify(result).includes('secret'),false);
 assert.equal(codexUsage([]).usage,null);assert.deepEqual(codexUsage([]).limits,[]);
});
test('Claude counts assistant message usage once across streaming duplicates and ignores user content',()=>{
 const event=(id,output)=>JSON.stringify({type:'assistant',message:{id,content:'private',usage:{input_tokens:12,output_tokens:output,cache_read_input_tokens:2}}});
 assert.deepEqual(claudeUsage([event('a',1),event('a',3),event('b',5)]).usage,{input:24,output:8,cached:4});
});
test('read-only databases filter project, source and launch time without returning message data',async()=>{
 const {DatabaseSync}=require('node:sqlite');const home=await fs.mkdtemp(path.join(os.tmpdir(),'mcode-usage-db-'));
 const prior={HERMES_HOME:process.env.HERMES_HOME,XDG_DATA_HOME:process.env.XDG_DATA_HOME};
 try{
  process.env.HERMES_HOME=path.join(home,'hermes');process.env.XDG_DATA_HOME=path.join(home,'data');
  await fs.mkdir(process.env.HERMES_HOME);await fs.mkdir(path.join(process.env.XDG_DATA_HOME,'opencode'),{recursive:true});
  const hermes=new DatabaseSync(path.join(process.env.HERMES_HOME,'state.db'));
  hermes.exec('CREATE TABLE sessions(cwd TEXT,source TEXT,started_at REAL,input_tokens INTEGER,output_tokens INTEGER,cache_read_tokens INTEGER);');
  const insert=hermes.prepare('INSERT INTO sessions VALUES(?,?,?,?,?,?)');insert.run(home,'cli',100,12,4,2);insert.run(home,'telegram',100,99,99,0);insert.run(home,'cli',1,99,99,0);insert.run(home+'other','cli',100,99,99,0);hermes.close();
  assert.deepEqual(readDatabase('hermes',home,50000,home).usage,{input:12,output:4,cached:2});
  const oc=new DatabaseSync(path.join(process.env.XDG_DATA_HOME,'opencode/opencode.db'));oc.exec('CREATE TABLE session(directory TEXT,time_created INTEGER,tokens_input INTEGER,tokens_output INTEGER,tokens_cache_read INTEGER);');oc.prepare('INSERT INTO session VALUES(?,?,?,?,?)').run(home,100000,20,6,5);oc.close();
  assert.deepEqual(readDatabase('opencode',home,50000,home).usage,{input:20,output:6,cached:5});
 }finally{for(const [key,value]of Object.entries(prior))if(value===undefined)delete process.env[key];else process.env[key]=value;await fs.rm(home,{recursive:true,force:true});}
});
test('Codex log discovery excludes older and unrelated projects and survives an incomplete last line',async()=>{
 const home=await fs.mkdtemp(path.join(os.tmpdir(),'mcode-usage-log-')),prior=process.env.CODEX_HOME;
 try{
  process.env.CODEX_HOME=home;const now=new Date(),dir=path.join(home,'sessions',String(now.getUTCFullYear()),String(now.getUTCMonth()+1).padStart(2,'0'),String(now.getUTCDate()).padStart(2,'0'));await fs.mkdir(dir,{recursive:true});
  const meta=cwd=>JSON.stringify({type:'session_meta',timestamp:now.toISOString(),payload:{cwd}});
  const event=JSON.stringify({type:'event_msg',timestamp:now.toISOString(),payload:{type:'token_count',info:{total_token_usage:{input_tokens:50,output_tokens:7,cached_input_tokens:20}}}});
  await fs.writeFile(path.join(dir,'one.jsonl'),meta(home)+'\n'+event+'\n{"incomplete":');await fs.writeFile(path.join(dir,'other.jsonl'),meta(home+'other')+'\n'+event);
  assert.deepEqual((await readLogs('codex',home,now.getTime()-1000,home)).usage,{input:50,output:7,cached:20});
 }finally{if(prior===undefined)delete process.env.CODEX_HOME;else process.env.CODEX_HOME=prior;await fs.rm(home,{recursive:true,force:true});}
});
