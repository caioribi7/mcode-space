'use strict';
// Worktree isolado na branch "autowork". Os agentes trabalham somente aqui; a pasta aberta e a main não são alteradas.
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

const BRANCH = 'autowork';
const TASK_FILE = 'AUTOWORK_TASK.md';
const FORBIDDEN = /(^|\/)\.git(\/|$)|(^|\/)\.env($|\.)|\.(pem|key|pfx|p12|keystore)$|(^|\/)id_(rsa|ed25519|ecdsa)|(^|\/)(credentials|secrets?)\.(json|ya?ml|txt)$/i;

function forbiddenPaths(paths) { return paths.filter(p => FORBIDDEN.test(p.replace(/\\/g, '/'))); }

function createSandbox({ procs, root, baseDir, git = 'git', npm = null, env = process.env }) {
  let top = null, dir = null, workdir = null;
  const gitEnv = { ...env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' };
  async function g(args, cwd = dir, timeoutMs = 120e3) {
    const result = await procs.run({ command: git, args, cwd, env: gitEnv, timeoutMs });
    if (result.code !== 0) throw new Error('git ' + args[0] + ': ' + (result.stderr || result.stdout).trim().slice(0, 300));
    return result.stdout;
  }
  async function worktrees() {
    const out = await g(['worktree', 'list', '--porcelain'], top);
    return out.split(/\r?\n\r?\n/).map(block => ({ path: /^worktree (.+)$/m.exec(block)?.[1], branch: /^branch refs\/heads\/(.+)$/m.exec(block)?.[1] })).filter(w => w.path);
  }
  const same = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

  async function prepare() {
    top = path.resolve((await g(['rev-parse', '--show-toplevel'], root)).trim());
    const relative = path.relative(top, root);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('A pasta precisa estar dentro do repositório.');
    dir = path.join(baseDir, path.basename(top).replace(/[^\w.-]/g, '_') + '-' + createHash('sha1').update(top.toLowerCase()).digest('hex').slice(0, 8));
    const list = await worktrees();
    const used = list.find(w => w.branch === BRANCH);
    if (used && !same(used.path, dir)) throw new Error(`A branch ${BRANCH} já está aberta em ${used.path}. Troque de branch lá antes de iniciar.`);
    if (!used) {
      await g(['worktree', 'prune'], top);
      await fs.rm(dir, { recursive: true, force: true });
      await fs.mkdir(path.dirname(dir), { recursive: true });
      const exists = (await procs.run({ command: git, args: ['rev-parse', '--verify', '--quiet', 'refs/heads/' + BRANCH], cwd: top, env: gitEnv })).code === 0;
      await g(exists ? ['worktree', 'add', dir, BRANCH] : ['worktree', 'add', '-b', BRANCH, dir, 'HEAD'], top, 300e3);
    }
    workdir = path.join(dir, relative);
    await reset();
    await installDeps();
    return { top, dir, workdir, branch: BRANCH };
  }
  async function packageJson() { try { return JSON.parse(await fs.readFile(path.join(workdir, 'package.json'), 'utf8')); } catch { return null; } }
  async function npmRun(args, timeoutMs) {
    if (!npm) return { code: 1, stdout: '', stderr: 'npm não encontrado no PATH.' };
    return procs.run({ ...npm(args), cwd: workdir, env: { ...gitEnv, CI: '1', npm_config_audit: 'false', npm_config_fund: 'false' }, timeoutMs });
  }
  async function installDeps() {
    const pkg = await packageJson();
    if (!pkg) return;
    let lock; try { lock = await fs.readFile(path.join(workdir, 'package-lock.json'), 'utf8'); } catch { return; }
    const stamp = createHash('sha1').update(lock).digest('hex'), marker = path.join(workdir, 'node_modules', '.autowork-lock');
    if (await fs.readFile(marker, 'utf8').catch(() => '') === stamp) return;
    // Dependências do lockfile; scripts de instalação ficam desligados.
    const result = await npmRun(['ci', '--ignore-scripts'], 15 * 60e3);
    if (result.code !== 0) throw new Error('npm ci falhou no worktree: ' + result.stderr.trim().slice(-300));
    await fs.writeFile(marker, stamp).catch(() => {});
  }
  async function reset() { await g(['reset', '--hard', 'HEAD']); await g(['clean', '-fd']); }
  async function head() { return (await g(['rev-parse', 'HEAD'])).trim(); }
  // Um agente não pode commitar nem trocar de branch: devolve qualquer commit dele ao índice.
  async function ensureHead(expected) {
    const branch = (await g(['symbolic-ref', '--short', '-q', 'HEAD']).catch(() => '')).trim();
    if (branch !== BRANCH) await g(['checkout', '-f', BRANCH]);
    if ((await head()) !== expected) await g(['reset', '--soft', expected]);
  }
  async function changes() {
    const out = await g(['status', '--porcelain=v1', '-uall', '-z']);
    const items = out.split('\0').filter(Boolean), paths = [];
    for (let i = 0; i < items.length; i++) { const entry = items[i]; paths.push(entry.slice(3)); if (/^[RC]/.test(entry)) i++; }
    return paths.filter(p => path.posix.basename(p) !== TASK_FILE);
  }
  // Arquivos em edição agora, os mais recentes primeiro, com o diff atual (somente leitura do worktree).
  async function liveFiles(limit = 4, maxChars = 6000) {
    const out = await g(['status', '--porcelain=v1', '-uall', '-z']);
    const items = out.split('\0').filter(Boolean), entries = [];
    for (let i = 0; i < items.length; i++) { const e = items[i]; entries.push({ code: e.slice(0, 2), path: e.slice(3) }); if (/^[RC]/.test(e)) i++; }
    const files = entries.filter(e => path.posix.basename(e.path) !== TASK_FILE && !FORBIDDEN.test(e.path));
    if (!files.length) return [];
    await Promise.all(files.map(async f => { f.mtime = (await fs.stat(path.join(dir, f.path)).catch(() => null))?.mtimeMs || 0; }));
    files.sort((a, b) => b.mtime - a.mtime);
    return Promise.all(files.slice(0, limit).map(async f => {
      let diff;
      if (f.code === '??') {
        const content = await fs.readFile(path.join(dir, f.path), 'utf8').catch(() => '');
        diff = /\0/.test(content.slice(0, 2000)) ? '(arquivo binário)' : content.replace(/\r?\n$/, '').split(/\r?\n/).map(l => '+' + l).join('\n');
      } else diff = await g(['diff', '--no-color', '-U2', 'HEAD', '--', f.path]).catch(() => '');
      const lines = diff.split('\n');
      const added = lines.filter(l => l.startsWith('+') && !l.startsWith('+++')).length, removed = lines.filter(l => l.startsWith('-') && !l.startsWith('---')).length;
      const body = lines.filter(l => !/^(diff --git|index |--- |\+\+\+ )/.test(l)).join('\n');
      return { path: f.path, status: f.code === '??' ? 'novo' : f.code.includes('D') ? 'removido' : 'editado', added, removed, mtime: f.mtime, diff: body.length > maxChars ? '…\n' + body.slice(-maxChars) : body };
    }));
  }
  async function writeTask(text) { await fs.writeFile(path.join(workdir, TASK_FILE), text); }
  async function clearTask() { await fs.rm(path.join(workdir, TASK_FILE), { force: true }); }
  async function test() {
    const pkg = await packageJson();
    if (!pkg?.scripts?.test) return { ran: false, ok: true, output: 'Sem script de teste.' };
    await installDeps();
    const result = await npmRun(['test'], 20 * 60e3);
    return { ran: true, ok: result.code === 0 && !result.timedOut, output: (result.stdout + '\n' + result.stderr).trim().slice(-3000) };
  }
  async function stage() { await clearTask(); await g(['add', '-A', '--', '.']); }
  async function diff(limit = 60000) {
    await stage();
    const [stat, short, full] = await Promise.all([g(['diff', '--cached', '--stat']), g(['diff', '--cached', '--shortstat']), g(['diff', '--cached'])]);
    const n = name => Number(new RegExp('(\\d+) ' + name).exec(short)?.[1] || 0);
    return { stat: stat.trim(), files: n('files? changed'), added: n('insertions?'), removed: n('deletions?'), text: full.length > limit ? full.slice(0, limit) + '\n[diff truncado]' : full };
  }
  async function commit(message) {
    await stage();
    await g(['commit', '-q', '-m', message, '-m', 'Gerado pelo modo auto-work do MCode Space.']);
    return (await g(['rev-parse', '--short', 'HEAD'])).trim();
  }
  async function context() {
    const [files, log] = await Promise.all([g(['ls-files']), g(['log', '--oneline', '-15']).catch(() => '')]);
    const read = async name => { try { return (await fs.readFile(path.join(workdir, name), 'utf8')).slice(0, 5000); } catch { return ''; } };
    const list = files.split(/\r?\n/).filter(Boolean);
    return { files: list.slice(0, 400).join('\n') + (list.length > 400 ? `\n… +${list.length - 400} arquivos` : ''), log: log.trim(), agents: await read('AGENTS.md') || await read('CLAUDE.md'), product: await read('PRODUCT.md') || await read('README.md') };
  }
  return { prepare, reset, head, ensureHead, changes, liveFiles, writeTask, clearTask, test, diff, commit, context, get workdir() { return workdir; }, get dir() { return dir; } };
}

module.exports = { createSandbox, forbiddenPaths, BRANCH, TASK_FILE };
