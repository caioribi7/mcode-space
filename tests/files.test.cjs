const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { inside, list, read, save, move, readImage } = require('../electron/files.cjs');

async function fixture(t) {
  const base = await fs.realpath(os.tmpdir());
  const root = await fs.mkdtemp(path.join(base, 'mcode-space-test-'));
  t.after(async () => { assert.equal(path.dirname(root),base); assert.ok(path.basename(root).startsWith('mcode-space-test-')); await fs.rm(root,{recursive:true,force:true}); });
  await fs.mkdir(path.join(root,'src'));
  await fs.mkdir(path.join(root,'.git'));
  await fs.writeFile(path.join(root,'hello.txt'),'Olá MCode\r\n');
  return root;
}
test('explorer sorts directories first and protects Git metadata',async t=>{
  const root=await fixture(t);
  const entries=await list(root);
  assert.deepEqual(entries.map(e=>e.name),['src','hello.txt']);
  await assert.rejects(inside(root,'..'),/fora da pasta/);
  await assert.rejects(list(root,'.git'),/protegidos/);
});
test('editing keeps UTF-8, line endings and rejects external modifications',async t=>{
  const root=await fixture(t);
  const file=await read(root,'hello.txt');
  assert.equal(file.text,'Olá MCode\r\n');
  const result=await save(root,{...file,text:'Novo conteúdo\r\n'});
  assert.notEqual(result.revision,file.revision);
  assert.equal(await fs.readFile(path.join(root,'hello.txt'),'utf8'),'Novo conteúdo\r\n');
  await assert.rejects(save(root,{...file,text:'stale'}),/mudou fora/);
});
test('rejects binary, oversized files and invalid input',async t=>{
  const root=await fixture(t);
  await fs.writeFile(path.join(root,'binary'),Buffer.from([0,1,2]));
  await assert.rejects(read(root,'binary'),/binário/);
  await fs.writeFile(path.join(root,'large'),'x'.repeat(2*1024*1024+1));
  await assert.rejects(read(root,'large'),/2 MB/);
  await assert.rejects(save(root,{path:'hello.txt',text:null,revision:'x'}),/inválido/);
});
test('preserves UTF-8 BOM',async t=>{
  const root=await fixture(t);
  await fs.writeFile(path.join(root,'bom.txt'),'\uFEFFtexto');
  const file=await read(root,'bom.txt');
  assert.equal(file.bom,true);
  await save(root,{...file,text:'editado'});
  assert.equal(await fs.readFile(path.join(root,'bom.txt'),'utf8'),'\uFEFFeditado');
});
test('realpath rejects directory links pointing outside the workspace',async t=>{
  const root=await fixture(t);
  await fs.symlink(path.dirname(root),path.join(root,'outside'),process.platform==='win32'?'junction':'dir');
  await assert.rejects(list(root,'outside'),/fora da pasta/);
});

test('moving a file preserves content and revision so its open editor can save',async t=>{
  const root=await fixture(t);
  const original=await read(root,'hello.txt');
  const moved=await move(root,'hello.txt','src');
  assert.deepEqual(moved,{from:'hello.txt',to:'src/hello.txt',directory:false});
  await assert.rejects(fs.stat(path.join(root,'hello.txt')),{code:'ENOENT'});
  assert.equal((await read(root,moved.to)).revision,original.revision);
  await save(root,{...original,path:moved.to,text:'Editado após mover'});
  assert.equal((await read(root,moved.to)).text,'Editado após mover');
});
test('moving refuses collisions, links, Git metadata and workspace escape without deleting source',async t=>{
  const root=await fixture(t);
  await fs.writeFile(path.join(root,'src','hello.txt'),'Destino intacto');
  await assert.rejects(move(root,'hello.txt','src'),/Já existe/);
  assert.equal((await read(root,'src/hello.txt')).text,'Destino intacto');
  assert.equal((await read(root,'hello.txt')).text,'Olá MCode\r\n');
  await assert.rejects(move(root,'hello.txt','..'),/fora da pasta/);
  await assert.rejects(move(root,'hello.txt','.git'),/protegidos/);
  await assert.rejects(move(root,'.','src'),/trabalho não pode/);
  await fs.symlink(path.join(root,'src'),path.join(root,'link'),process.platform==='win32'?'junction':'dir');
  await assert.rejects(move(root,'link','.'),/Links/);
});
test('folders move with contents but reject descendants and nested repositories',async t=>{
  const root=await fixture(t);
  await fs.mkdir(path.join(root,'src','nested'));
  await fs.writeFile(path.join(root,'src','nested','app.js'),'code');
  await assert.rejects(move(root,'src','src/nested'),/dentro dela mesma/);
  await fs.mkdir(path.join(root,'target'));
  const result=await move(root,'src','target');
  assert.equal(result.to,'target/src');
  assert.equal((await read(root,'target/src/nested/app.js')).text,'code');
  await fs.mkdir(path.join(root,'target','src','nested','.git'));
  await assert.rejects(move(root,'target/src','.'),/repositório Git/);
});
test('Markdown images are scoped to the workspace and exclude active SVG/HTML',async t=>{
  const root=await fixture(t);
  await fs.writeFile(path.join(root,'pixel.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/b8AAAAASUVORK5CYII=','base64'));
  assert.match(await readImage(root,'pixel.png'),/^data:image\/png;base64,/);
  await assert.rejects(readImage(root,'hello.txt'),/imagens locais/);
  await fs.writeFile(path.join(root,'active.svg'),'<svg onload="alert(1)"/>');
  await assert.rejects(readImage(root,'active.svg'),/imagens locais/);
});
