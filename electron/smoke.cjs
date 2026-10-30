const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');

module.exports = async ({ app, win, setRoot, sessions }) => {
  const base = await fs.realpath(os.tmpdir());
  const root = await fs.mkdtemp(path.join(base,'mcode-space-smoke-'));
  const output = path.join(process.cwd(),'test-results');
  let result = 1;
  const js = code => win.webContents.executeJavaScript(code,true);
  const wait = async (code,timeout=20000) => {
    const start=Date.now();
    while(Date.now()-start<timeout){if(await js(code))return;await new Promise(resolve=>setTimeout(resolve,100));}
    throw new Error('Smoke timeout: '+code);
  };
  try {
    await fs.mkdir(path.join(root,'src'));
    await fs.writeFile(path.join(root,'README.md'),'# MCode Space\n\nSeu código, seus terminais.\n');
    await fs.writeFile(path.join(root,'src','app.js'),'const space = "MCode";\nconsole.log(space);\n');
    await fs.writeFile(path.join(root,'package.json'),'{"name":"mcode-space"}\n');
    setRoot(root);
    await win.loadFile(path.join(__dirname,'../dist/index.html'));
    await wait('document.querySelectorAll(".terminal-tab").length === 1');
    await js('window.__output="";window.space.onData(({data})=>window.__output+=data);true');
    const id=await js('document.querySelector(".terminal-tab").dataset.id');
    await js(`window.space.write(${JSON.stringify(id)}, "Write-Output ('MCODE_' + (6*7))\\r")`);
    await wait('window.__output.includes("MCODE_42")');
    await js('[...document.querySelectorAll(".tree-row")].find(e=>e.title==="README.md").click()');
    await wait('document.querySelector("#code").value.includes("Seu código")');
    await js('document.querySelector("#code").value+="\\nEdição verificada.\\n";document.querySelector("#code").dispatchEvent(new Event("input"));document.querySelector("#save-file").click()');
    await wait('document.querySelector("#file-state").textContent==="UTF-8"');
    assert.match(await fs.readFile(path.join(root,'README.md'),'utf8'),/Edição verificada/);
    await js('document.querySelector("#new-terminal").click()');
    await wait('document.querySelectorAll(".terminal-tab").length===2');
    await js('document.querySelector("button[data-layout=grid]").click()');
    await wait('document.querySelectorAll(".terminal-panel:not([hidden])").length===2');
    await js('document.querySelector(".panel-header .icon-button").click()');
    await wait('document.querySelector("#rename-dialog").open');
    await js('document.querySelector("#terminal-name").value="Backend";document.querySelector("#terminal-color").value="blue";document.querySelector("#rename-dialog button[value=save]").click()');
    await wait('document.querySelector(".terminal-tab").textContent.includes("Backend")');
    await js('document.querySelector(".terminal-tab button[aria-label*=direita]").click()');
    assert.match(await js('document.querySelectorAll(".terminal-tab")[1].textContent'),/Backend/);
    const files=await js('window.space.list(".")');assert.ok(files.some(f=>f.name==='src'));
    const escape=await js('window.space.list("..").then(()=>false,()=>true)');assert.equal(escape,true);
    await fs.mkdir(output,{recursive:true});
    await new Promise(resolve=>setTimeout(resolve,700));
    await fs.writeFile(path.join(output,'desktop.png'),(await win.webContents.capturePage()).toPNG());
    win.setSize(1000,720);
    await new Promise(resolve=>setTimeout(resolve,500));
    await js('Promise.all([...document.querySelectorAll(".terminal-tab")].map(t=>window.space.write(t.dataset.id,"Write-Output \'Pronto para trabalhar\'")))');
    await new Promise(resolve=>setTimeout(resolve,400));
    await fs.writeFile(path.join(output,'compact.png'),(await win.webContents.capturePage()).toPNG());
    const terminalFits=await js('[...document.querySelectorAll(".terminal-host")].every(h=>{const screen=h.querySelector(".xterm-screen");return screen.getBoundingClientRect().right<=h.getBoundingClientRect().right&&screen.getBoundingClientRect().bottom<=h.getBoundingClientRect().bottom;})');
    assert.equal(terminalFits,true,'Terminal canvas must fit inside the panel after resizing');
    const overflow=await js('document.documentElement.scrollWidth>window.innerWidth');assert.equal(overflow,false);
    await js('Promise.all([...document.querySelectorAll(".terminal-tab")].map(t=>window.space.closeTerminal(t.dataset.id)))');
    await new Promise(resolve=>setTimeout(resolve,700));
    console.log('SMOKE OK: shell real, explorador, edição, salvamento, dois terminais, grade, renomeação, reordenação, limite de pasta e captura visual.');
    result = 0;
  } catch(error) { console.error(error); }
  finally {
    for (const terminal of sessions.values()) terminal.kill();
    sessions.clear();
    await new Promise(resolve=>setTimeout(resolve,200));
    if(path.dirname(root)===base&&path.basename(root).startsWith('mcode-space-smoke-'))await fs.rm(root,{recursive:true,force:true}).catch(()=>{});
    app.exit(result);
  }
};
