const { app, BrowserWindow, ipcMain, dialog, shell: desktopShell } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { existsSync } = require('node:fs');
const { randomUUID } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const pty = require('node-pty');
const files = require('./files.cjs');
const { cleanWorkspace, savedWorkspaces } = require('./settings.cjs');
const run = promisify(execFile);
const sessions = new Map();
const allowedRoots = new Set();
let saving = Promise.resolve();
let win;
let root = null;
let dirty = false;
let quitting = false;
const smoke = process.argv.includes('--smoke-test');
if (smoke) app.setPath('userData', path.join(process.cwd(), 'test-results/profile'));
const entry = path.join(__dirname, '../dist/index.html');
const configPath = () => path.join(app.getPath('userData'), 'workspace.json');
const shells = process.platform === 'win32' ? [
  { id: 'powershell', label: 'PowerShell', command: path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'), args: ['-NoLogo'] },
  { id: 'cmd', label: 'Prompt de Comando', command: path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/cmd.exe'), args: [] },
] : [{ id: 'sh', label: 'Shell', command: process.env.SHELL || '/bin/bash', args: [] }];
if (process.platform === 'win32') {
  const pwsh = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'PowerShell/7/pwsh.exe');
  if (existsSync(pwsh)) shells.unshift({ id: 'pwsh', label: 'PowerShell 7', command: pwsh, args: ['-NoLogo'] });
}

function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error('Origem recusada.');
    return fn(...args);
  });
}
function authorizedRoot(candidate = root) { if (!candidate || !allowedRoots.has(candidate)) throw new Error('Esta pasta não está aberta em uma aba.'); return candidate; }
function stopAll() { for (const session of sessions.values()) session.kill(); sessions.clear(); }
function session(id) { const value = sessions.get(id); if (!value) throw new Error('Este terminal já foi encerrado.'); return value; }
async function readConfig() {
  try { return JSON.parse(await fs.readFile(configPath(), 'utf8')); }
  catch { return {}; }
}

handle('workspace:initial', async () => {
  const saved = smoke ? {} : await readConfig();
  const workspaces = [];
  const seen = new Set();
  for (const workspace of savedWorkspaces(saved)) {
    try {
      const directory = await fs.realpath(workspace.root);
      if ((await fs.stat(directory)).isDirectory() && !seen.has(directory)) {
        seen.add(directory);allowedRoots.add(directory); workspaces.push(cleanWorkspace({ ...workspace, root: directory }, shells.map(s => s.id)));
      }
    } catch {}
  }
  if (smoke && root) { allowedRoots.add(root); workspaces.push(cleanWorkspace({root},shells.map(s=>s.id))); }
  root = workspaces.find(w => w.root === saved.activeRoot)?.root || workspaces[0]?.root || null;
  return { root, workspaces, saved, windowsPty: process.platform === 'win32' ? { backend: 'conpty', buildNumber: Number(require('node:os').release().split('.')[2]) } : null, shells: shells.map(({ id, label }) => ({ id, label })) };
});
handle('workspace:open', async () => {
  const answer = await dialog.showOpenDialog(win, { title: 'Abrir pasta no MCode Space', properties: ['openDirectory'], defaultPath: root || app.getPath('home') });
  if (answer.canceled) return null;
  const next = await fs.realpath(answer.filePaths[0]);
  if (!allowedRoots.has(next) && allowedRoots.size >= 8) throw new Error('O limite é de oito abas de pastas. Feche uma antes de abrir outra.');
  allowedRoots.add(next); root = next;
  return root;
});
handle('workspace:open-child', async (candidate, workspaceRoot) => {
  const next = await files.inside(authorizedRoot(workspaceRoot), candidate);
  if (!(await fs.stat(next)).isDirectory()) throw new Error('Selecione uma pasta.');
  if (!allowedRoots.has(next) && allowedRoots.size >= 8) throw new Error('O limite é de oito abas de pastas.');
  allowedRoots.add(next); root = next; return root;
});
handle('workspace:select', candidate => { root = authorizedRoot(candidate); return root; });
handle('workspace:close', async (candidate, hasDirty) => {
  authorizedRoot(candidate);
  const terminals = [...sessions.entries()].filter(([,terminal]) => terminal.workspaceRoot === candidate);
  if ((terminals.length || hasDirty) && (await dialog.showMessageBox(win, { type: 'question', message: 'Fechar esta aba de pasta?', detail: hasDirty ? 'As alterações não salvas serão descartadas e seus terminais serão encerrados.' : 'Os terminais desta pasta serão encerrados.', buttons: ['Cancelar','Fechar aba'], defaultId: 0, cancelId: 0 })).response !== 1) return false;
  for (const [id,terminal] of terminals) { terminal.kill(); sessions.delete(id); }
  allowedRoots.delete(candidate); if(root === candidate) root = [...allowedRoots][0] || null;
  return true;
});
handle('workspace:save', async settings => {
  if (smoke) return;
  const workspaces = (Array.isArray(settings?.workspaces) ? settings.workspaces : []).filter(w=>allowedRoots.has(w.root)).slice(0,8).map(w=>cleanWorkspace(w,shells.map(s=>s.id)));
  const data = { activeRoot: allowedRoots.has(settings?.activeRoot) ? settings.activeRoot : root, workspaces };
  saving = saving.catch(()=>{}).then(async () => {
    await fs.mkdir(path.dirname(configPath()), { recursive: true });
    const temporary = configPath() + '.tmp';
    await fs.writeFile(temporary, JSON.stringify(data, null, 2));
    await fs.rename(temporary, configPath());
  });
  return saving;
});
handle('workspace:dirty', value => { dirty = value === true; });
handle('files:list', (candidate, workspaceRoot) => files.list(authorizedRoot(workspaceRoot), candidate));
handle('files:read', (candidate, workspaceRoot) => files.read(authorizedRoot(workspaceRoot), candidate));
handle('files:save', (value, workspaceRoot) => files.save(authorizedRoot(workspaceRoot), value));
handle('files:move', async (candidate, directory, workspaceRoot) => {
  const base=authorizedRoot(workspaceRoot),source=await files.inside(base,candidate);
  for(const opened of allowedRoots){const relative=path.relative(source,opened);if(opened!==base&&(relative===''||(!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith(`..${path.sep}`))))throw new Error('Feche a aba dessa pasta antes de movê-la.');}
  return files.move(base,candidate,directory);
});
handle('files:image', (candidate, workspaceRoot) => files.readImage(authorizedRoot(workspaceRoot), candidate));
handle('markdown:open-link', async value => {
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Somente links HTTP e HTTPS podem ser abertos no navegador.');
  await desktopShell.openExternal(url.href);
});
handle('files:confirm-discard', async name => (await dialog.showMessageBox(win, { type: 'question', message: `Descartar alterações em ${String(name).slice(0, 180)}?`, buttons: ['Continuar editando', 'Descartar'], cancelId: 0, defaultId: 0 })).response === 1);
handle('terminal:create', async options => {
  if (sessions.size >= 12) throw new Error('O limite é de 12 terminais. Encerre um para abrir outro.');
  const chosen = shells.find(s => s.id === options?.shell) || shells[0];
  const workspaceRoot = authorizedRoot(options?.root);
  const cwd = await files.inside(workspaceRoot, options?.cwd || '.');
  if (!(await fs.stat(cwd)).isDirectory()) throw new Error('Escolha uma pasta para iniciar o terminal.');
  const id = randomUUID();
  const terminal = pty.spawn(chosen.command, chosen.args, { name: 'xterm-256color', cols: 100, rows: 28, cwd, env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' }, useConpty: true, useConptyDll: true });
  sessions.set(id, terminal);
  terminal.workspaceRoot = workspaceRoot;
  terminal.onData(data => { if (!win.isDestroyed()) win.webContents.send('terminal:data', { id, data }); });
  terminal.onExit(({ exitCode }) => { sessions.delete(id); if (!win.isDestroyed()) win.webContents.send('terminal:exit', { id, exitCode }); });
  return { id, shell: chosen.id, label: chosen.label, cwd: options?.cwd || '.' };
});
handle('terminal:write', (id, data) => { if (typeof data !== 'string' || data.length > 1024 * 1024) throw new Error('Entrada inválida.'); session(id).write(data); });
handle('terminal:resize', (id, cols, rows) => { if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 2 || rows < 1 || cols > 500 || rows > 250) return; sessions.get(id)?.resize(cols, rows); });
handle('terminal:close', id => { sessions.get(id)?.kill(); sessions.delete(id); });
handle('git:status', async candidate => {
  if (!candidate && !root) return null;
  const workspaceRoot = authorizedRoot(candidate);
  try {
    const options = { cwd: workspaceRoot, windowsHide: true, timeout: 4000, maxBuffer: 1024 * 1024 };
    const [{ stdout: branch }, { stdout: status }] = await Promise.all([
      run('git', ['symbolic-ref', '--short', '-q', 'HEAD'], options).catch(() => ({ stdout: 'HEAD destacado' })),
      run('git', ['status', '--porcelain=v1', '-uall'], options),
    ]);
    return { branch: branch.trim(), changes: status.split('\n').filter(Boolean).length };
  } catch { return null; }
});

app.whenReady().then(async () => {
  win = new BrowserWindow({ width: 1480, height: 940, minWidth: 900, minHeight: 620, title: 'MCode Space', backgroundColor: '#0B100D', show: !smoke,
    icon: path.join(__dirname, '../dist/assets/icon.ico'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, spellcheck: false },
  });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  win.on('close', event => {
    if (quitting || smoke) return;
    if (dirty || sessions.size) {
      event.preventDefault();
      dialog.showMessageBox(win, { type: 'question', message: 'Fechar o MCode Space?', detail: dirty ? 'Há arquivos com alterações não salvas. Os processos dos terminais também serão encerrados.' : 'Os processos dos terminais serão encerrados. A organização será restaurada na próxima abertura.', buttons: ['Cancelar', 'Fechar'], defaultId: 0, cancelId: 0 }).then(answer => { if (answer.response === 1) { quitting = true; stopAll(); win.close(); } });
    }
  });
  win.on('closed', stopAll);
  await win.loadFile(entry);
  if (smoke) require('./smoke.cjs')({ app, win, pty, shells, files, sessions, setRoot: value => { root = value; } });
});
app.on('window-all-closed', () => app.quit());
