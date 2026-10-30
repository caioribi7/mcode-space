const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { existsSync } = require('node:fs');
const { fileURLToPath } = require('node:url');
const { randomUUID } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const pty = require('node-pty');
const files = require('./files.cjs');
const run = promisify(execFile);
const sessions = new Map();
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
function needRoot() { if (!root) throw new Error('Abra uma pasta primeiro.'); return root; }
function stopAll() { for (const session of sessions.values()) session.kill(); sessions.clear(); }
function session(id) { const value = sessions.get(id); if (!value) throw new Error('Este terminal já foi encerrado.'); return value; }
async function readConfig() {
  try { return JSON.parse(await fs.readFile(configPath(), 'utf8')); }
  catch { return {}; }
}

handle('workspace:initial', async () => {
  const saved = smoke ? {} : await readConfig();
  if (typeof saved.root === 'string') {
    try { root = await fs.realpath(saved.root); if (!(await fs.stat(root)).isDirectory()) root = null; }
    catch { root = null; }
  }
  return { root, saved, windowsPty: process.platform === 'win32' ? { backend: 'conpty', buildNumber: Number(require('node:os').release().split('.')[2]) } : null, shells: shells.map(({ id, label }) => ({ id, label })) };
});
handle('workspace:open', async () => {
  const answer = await dialog.showOpenDialog(win, { title: 'Abrir pasta no MCode Space', properties: ['openDirectory'], defaultPath: root || app.getPath('home') });
  if (answer.canceled) return null;
  const next = await fs.realpath(answer.filePaths[0]);
  if ((sessions.size || dirty) && (await dialog.showMessageBox(win, {
    type: 'question', message: 'Trocar a pasta de trabalho?', detail: 'Os terminais atuais serão encerrados. Salve seus arquivos antes de continuar.', buttons: ['Cancelar', 'Trocar pasta'], defaultId: 0, cancelId: 0,
  })).response !== 1) return null;
  stopAll(); root = next; dirty = false;
  return root;
});
handle('workspace:save', async settings => {
  if (!root || smoke) return;
  const tabs = Array.isArray(settings?.tabs) ? settings.tabs.slice(0, 12).map(t => ({
    name: String(t.name || 'Terminal').slice(0, 60), shell: shells.some(s => s.id === t.shell) ? t.shell : shells[0].id,
    cwd: typeof t.cwd === 'string' ? t.cwd : '.', color: ['green', 'blue', 'amber', 'pink'].includes(t.color) ? t.color : 'green',
  })) : [];
  const data = { root, tabs, layout: ['tabs', 'columns', 'grid'].includes(settings?.layout) ? settings.layout : 'tabs', sidebar: Math.max(190, Math.min(480, Number(settings?.sidebar) || 260)) };
  await fs.mkdir(path.dirname(configPath()), { recursive: true });
  const temporary = configPath() + '.tmp';
  await fs.writeFile(temporary, JSON.stringify(data, null, 2));
  await fs.rename(temporary, configPath());
});
handle('workspace:dirty', value => { dirty = value === true; });
handle('files:list', candidate => files.list(needRoot(), candidate));
handle('files:read', candidate => files.read(needRoot(), candidate));
handle('files:save', value => files.save(needRoot(), value));
handle('files:confirm-discard', async name => (await dialog.showMessageBox(win, { type: 'question', message: `Descartar alterações em ${String(name).slice(0, 180)}?`, buttons: ['Continuar editando', 'Descartar'], cancelId: 0, defaultId: 0 })).response === 1);
handle('terminal:create', async options => {
  if (sessions.size >= 12) throw new Error('O limite é de 12 terminais. Encerre um para abrir outro.');
  const chosen = shells.find(s => s.id === options?.shell) || shells[0];
  const cwd = await files.inside(needRoot(), options?.cwd || '.');
  if (!(await fs.stat(cwd)).isDirectory()) throw new Error('Escolha uma pasta para iniciar o terminal.');
  const id = randomUUID();
  const terminal = pty.spawn(chosen.command, chosen.args, { name: 'xterm-256color', cols: 100, rows: 28, cwd, env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' }, useConpty: true, useConptyDll: true });
  sessions.set(id, terminal);
  terminal.onData(data => { if (!win.isDestroyed()) win.webContents.send('terminal:data', { id, data }); });
  terminal.onExit(({ exitCode }) => { sessions.delete(id); if (!win.isDestroyed()) win.webContents.send('terminal:exit', { id, exitCode }); });
  return { id, shell: chosen.id, label: chosen.label, cwd: options?.cwd || '.' };
});
handle('terminal:write', (id, data) => { if (typeof data !== 'string' || data.length > 1024 * 1024) throw new Error('Entrada inválida.'); session(id).write(data); });
handle('terminal:resize', (id, cols, rows) => { if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 2 || rows < 1 || cols > 500 || rows > 250) return; sessions.get(id)?.resize(cols, rows); });
handle('terminal:close', id => { sessions.get(id)?.kill(); sessions.delete(id); });
handle('git:status', async () => {
  if (!root) return null;
  try {
    const options = { cwd: root, windowsHide: true, timeout: 4000, maxBuffer: 1024 * 1024 };
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
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, spellcheck: false, offscreen: smoke },
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
