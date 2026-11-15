'use strict';
// Serviço do auto-work no processo principal: configuração criptografada, Telegram, cadeia de provedores e orquestrador.
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomInt } = require('node:crypto');
const runners = require('./runners.cjs');
const { createTelegram, TOKEN } = require('./telegram.cjs');
const { createSandbox, TASK_FILE } = require('./sandbox.cjs');
const { createOrchestrator } = require('./orchestrator.cjs');

const NVIDIA_KEY = /^nvapi-[A-Za-z0-9_-]{20,200}$/;
const CLAUDE_MODEL = /^[a-z0-9.\-\[\]]{0,60}$/i;
const LIMIT_PAUSE = 30 * 60e3;
const OPENCODE_MESSAGE = 'Read the file .autowork-task.md in this folder and do exactly what it asks. Reply with a one-line summary.';
const HELP = `Comandos do auto-work:
/iniciar — começa; você escolhe entre 5 tarefas
/iniciar sozinho — começa e decide sozinho
/sozinho · /manual — troca o modo
/ideia texto — sugere uma tarefa
/status — situação atual
/pular — descarta a tarefa atual
/parar — encerra após a etapa atual
/abortar — encerra agora e descarta o que não foi commitado`;

function createStore({ file, safeStorage }) {
  let data = null, queue = Promise.resolve();
  async function load() {
    if (data) return data;
    try { data = JSON.parse(safeStorage.decryptString(await fs.readFile(file))); } catch { data = {}; }
    return data;
  }
  function save(patch) {
    queue = queue.catch(() => {}).then(async () => {
      await load();
      if (!safeStorage.isEncryptionAvailable()) throw new Error('Armazenamento seguro indisponível no Windows.');
      data = { ...data, ...patch };
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file + '.tmp', safeStorage.encryptString(JSON.stringify(data)));
      await fs.rename(file + '.tmp', file);
      return data;
    });
    return queue;
  }
  return { load, save };
}

function which(name, excludedRoots, env = process.env) {
  const fsSync = require('node:fs');
  const dirs = (env.PATH || env.Path || '').split(path.delimiter).map(s => s.replace(/^"|"$/g, ''));
  for (const dir of dirs) {
    if (!path.isAbsolute(dir)) continue;
    for (const ext of process.platform === 'win32' ? ['.cmd', '.exe'] : ['']) {
      const candidate = path.join(dir, name + ext);
      try { if (!fsSync.statSync(candidate).isFile()) continue; } catch { continue; }
      const real = fsSync.realpathSync(candidate);
      if (excludedRoots.some(root => { const r = path.relative(root, real); return !r || (!r.startsWith('..') && !path.isAbsolute(r)); })) continue;
      if (process.platform === 'win32' && ext === '.cmd') {
        if (/[&|<>^%!"\r\n]/.test(candidate)) continue;
        return { command: path.join(env.SystemRoot || 'C:\\Windows', 'System32/cmd.exe'), args: '', target: candidate };
      }
      return { command: candidate, args: [], target: candidate };
    }
  }
  return null;
}

function createAutowork({ userData, safeStorage, resolveAgent, allowedRoots, send: sendToRenderer, onRunning = () => {}, fetchImpl = fetch, procs = runners.createProcesses() }) {
  const dir = path.join(userData, 'autowork');
  const store = createStore({ file: path.join(dir, 'settings.bin'), safeStorage });
  const configPath = path.join(dir, 'opencode.json');
  let pairing = null, bot = null, claudeLimitedUntil = 0, providers = { nvidiaModel: null, freeModel: null }, prefsCache = {};
  const excluded = () => [...allowedRoots()];
  const agent = id => resolveAgent(id);

  const telegram = createTelegram({ fetchImpl, getToken: () => prefsCache.telegramToken, onCommand: command => handle(command).catch(() => {}) });
  async function reply(text, buttons) { if (prefsCache.chatId && telegram.running) await telegram.send(prefsCache.chatId, text, buttons); }

  // Pensar (planejar, detalhar, revisar): Claude pelo plano → API NVIDIA → OpenCode grátis (agente plan, somente leitura).
  async function think(kind, prompt, { cwd }) {
    const attempts = []; let notice = null;
    if (agent('claude') && Date.now() >= claudeLimitedUntil) {
      const result = await runners.runClaude({ procs, resolved: agent('claude'), cwd, prompt, tools: ['Read', 'Grep', 'Glob'], model: prefsCache.claudeModel || '' }).catch(e => ({ ok: false, error: e.message, usage: {} }));
      attempts.push({ ...result, by: 'claude' });
      if (result.ok || result.aborted) return { ...result, by: 'claude', attempts };
      if (result.limited) { claudeLimitedUntil = Date.now() + LIMIT_PAUSE; notice = 'Claude atingiu o limite do plano; usando NVIDIA/OpenCode por 30 min.'; reply('⚠️ ' + notice).catch(() => {}); }
    }
    if (prefsCache.nvidiaKey && providers.nvidiaModel) {
      const result = await runners.nvidiaChat({ key: prefsCache.nvidiaKey, model: providers.nvidiaModel, prompt, system: 'Você é um engenheiro de software sênior. Siga o formato pedido à risca.', fetchImpl }).catch(e => ({ ok: false, error: e.message, usage: {} }));
      attempts.push({ ...result, by: 'nvidia' });
      if (result.ok) return { ...result, by: 'nvidia', attempts, notice };
    }
    if (agent('opencode') && providers.freeModel) {
      await fs.writeFile(path.join(cwd, TASK_FILE), prompt + '\n\nNão altere nenhum arquivo.');
      const result = await runners.runOpencode({ procs, resolved: agent('opencode'), cwd, model: providers.freeModel, agent: 'plan', message: OPENCODE_MESSAGE, configPath }).catch(e => ({ ok: false, error: e.message, usage: {} }));
      await fs.rm(path.join(cwd, TASK_FILE), { force: true });
      attempts.push({ ...result, by: 'opencode' });
      if (result.ok) return { ...result, by: 'opencode', attempts, notice };
    }
    const last = attempts.at(-1);
    return { ok: false, error: last?.error || 'Nenhum provedor disponível para orquestrar.', attempts, notice, by: last?.by };
  }

  // Implementar: OpenCode com modelo NVIDIA → OpenCode grátis → Claude (reserva). A 2ª tentativa começa no próximo executor.
  function workers() {
    const list = [];
    if (agent('opencode') && prefsCache.nvidiaKey && providers.nvidiaModel) list.push({ by: 'opencode', label: 'OpenCode + NVIDIA', run: cwd => runners.runOpencode({ procs, resolved: agent('opencode'), cwd, model: 'nvidia/' + providers.nvidiaModel, message: OPENCODE_MESSAGE, configPath, nvidiaKey: prefsCache.nvidiaKey }) });
    if (agent('opencode') && providers.freeModel) list.push({ by: 'opencode', label: 'OpenCode grátis', run: cwd => runners.runOpencode({ procs, resolved: agent('opencode'), cwd, model: providers.freeModel, message: OPENCODE_MESSAGE, configPath }) });
    if (agent('claude') && Date.now() >= claudeLimitedUntil) list.push({ by: 'claude', label: 'Claude', run: async cwd => runners.runClaude({ procs, resolved: agent('claude'), cwd, prompt: await fs.readFile(path.join(cwd, TASK_FILE), 'utf8'), model: prefsCache.claudeModel || '', tools: ['Read', 'Edit', 'Write', 'Grep', 'Glob', 'Bash(npm test)', 'Bash(npm run test*)', 'Bash(git status*)', 'Bash(git diff*)'] }) });
    return list;
  }
  async function implement(attempt, { cwd }) {
    const list = workers(), attempts = [];
    if (!list.length) return { ok: false, error: 'Nenhum executor disponível.', attempts };
    const start = Math.min(attempt - 1, list.length - 1);
    for (const worker of [...list.slice(start), ...list.slice(0, start)]) {
      const result = await worker.run(cwd).catch(e => ({ ok: false, error: e.message, usage: {} }));
      attempts.push({ ...result, by: worker.by });
      if (result.ok || result.aborted) return { ...result, by: worker.by, attempts };
      if (worker.by === 'claude' && result.limited) claudeLimitedUntil = Date.now() + LIMIT_PAUSE;
    }
    const last = attempts.at(-1);
    return { ok: false, error: last.error, by: last.by, attempts };
  }

    const orchestrator = createOrchestrator({
    think, implement,
    createSandbox: root => createSandbox({ procs, root, baseDir: path.join(dir, 'worktrees'), npm: (npm => npm ? args => runners.commandFor(npm, args) : null)(which('npm', excluded())) }),
    send: (text, buttons) => reply(text, buttons),
    abortProcesses: () => procs.abortAll(),
    onState: () => { onRunning(orchestrator.running); emitState(); },
  });

  async function prepareProviders() {
    const notes = [];
    providers = { nvidiaModel: null, freeModel: null };
    if (prefsCache.nvidiaKey) {
      try { providers.nvidiaModel = runners.pickNvidiaModel(await runners.nvidiaModels({ key: prefsCache.nvidiaKey, fetchImpl }), prefsCache.nvidiaModel); }
      catch (error) { notes.push(error.message); }
      if (!providers.nvidiaModel && prefsCache.nvidiaModel) providers.nvidiaModel = prefsCache.nvidiaModel;
    }
    if (agent('opencode')) {
      if (prefsCache.freeModel) providers.freeModel = prefsCache.freeModel;
      else {
        const free = await runners.opencodeFreeModels({ procs, resolved: agent('opencode') }).catch(() => []);
        providers.freeModel = free.find(m => /coder|deepseek|qwen|glm|kimi|minimax/i.test(m)) || free[0] || null;
      }
    }
    await runners.writeOpencodeConfig(configPath, { nvidiaModel: providers.nvidiaModel });
    return notes;
  }

  async function state() {
    const prefs = await store.load();
    const snapshot = orchestrator.snapshot();
    return {
      telegram: { configured: Boolean(prefs.telegramToken), bot, paired: Boolean(prefs.chatId), chatName: prefs.chatName || '', pairing: pairing && Date.now() < pairing.expires ? { code: pairing.code, expiresAt: pairing.expires } : null, error: telegram.lastError },
      nvidia: { configured: Boolean(prefs.nvidiaKey), model: providers.nvidiaModel },
      opencode: { available: Boolean(agent('opencode')), freeModel: providers.freeModel },
      claude: { available: Boolean(agent('claude')), limitedUntil: claudeLimitedUntil > Date.now() ? claudeLimitedUntil : null },
      prefs: { root: prefs.root || null, mode: prefs.mode === 'auto' ? 'auto' : 'manual', claudeModel: prefs.claudeModel || '', nvidiaModel: prefs.nvidiaModel || '', freeModel: prefs.freeModel || '', maxCycles: prefs.maxCycles ?? 20, maxHours: prefs.maxHours ?? 8 },
      run: snapshot,
    };
  }
  function emitState() { state().then(sendToRenderer).catch(() => {}); }

  async function startTelegram() {
    await telegram.stop();
    bot = null;
    if (!prefsCache.telegramToken) return;
    const me = await telegram.getMe();
    bot = me.username ? '@' + me.username : me.first_name;
    telegram.start();
  }

  async function start({ root, mode }) {
    if (orchestrator.running) throw new Error('O auto-work já está em execução.');
    if (!allowedRoots().includes(root)) throw new Error('Abra a pasta numa aba do MCode Space antes de iniciar.');
    const notes = await prepareProviders();
    if (!agent('claude') && !providers.nvidiaModel && !providers.freeModel) throw new Error('Nenhum orquestrador disponível: entre no Claude CLI, configure a NVIDIA ou instale o OpenCode.');
    if (!workers().length) throw new Error('Nenhum executor disponível para implementar.');
    prefsCache = await store.save({ root, mode: mode === 'auto' ? 'auto' : 'manual' });
    const result = orchestrator.start({ root, name: path.basename(root), mode, limits: { maxCycles: prefsCache.maxCycles ?? 20, maxHours: prefsCache.maxHours ?? 8 } });
    if (notes.length) reply('⚠️ ' + notes.join(' ')).catch(() => {});
    emitState();
    return result;
  }

  async function handle(command) {
    if (command.chatId === undefined || command.chatId === null) return;
    prefsCache = await store.load();
    if (String(command.chatId) !== String(prefsCache.chatId || '')) {
      if (command.cmd !== 'parear' || !command.private || !pairing || Date.now() > pairing.expires) return;
      if (command.arg !== pairing.code) { if (++pairing.attempts >= 5) pairing = null; emitState(); return; }
      pairing = null;
      prefsCache = await store.save({ chatId: String(command.chatId), chatName: String(command.name || '').slice(0, 60) });
      emitState();
      await telegram.send(command.chatId, '✅ MCode Space pareado.\n\n' + HELP);
      return;
    }
    if (command.callbackId) telegram.answer(command.callbackId);
    const o = orchestrator;
    switch (command.cmd) {
      case 'ajuda': case 'unknown': return reply(HELP);
      case 'parear': return reply('Este chat já está pareado.');
      case 'iniciar': case 'sozinho': {
        const auto = command.cmd === 'sozinho' || /^(sozinho|auto)/i.test(command.arg);
        if (o.running) return reply(command.cmd === 'sozinho' ? '🤖 Modo: ' + (o.setMode('auto') === 'auto' ? 'decide sozinho.' : 'manual.') : 'Já está rodando. /status');
        if (!prefsCache.root) return reply('Inicie uma vez pelo app para escolher a pasta.');
        return start({ root: prefsCache.root, mode: auto ? 'auto' : 'manual' }).catch(error => reply('⚠️ ' + error.message));
      }
      case 'manual': if (!o.running) return reply('Auto-work parado. /iniciar'); o.setMode('manual'); return reply('🙋 Modo: você escolhe a partir do próximo plano.');
      case 'parar': return reply(o.stop() ? '⏹ Encerrando após a etapa atual…' : 'Auto-work já está parado.');
      case 'abortar': return reply(o.abort() ? '🛑 Abortando…' : 'Auto-work já está parado.');
      case 'pular': return reply(o.skip() ? '⏭ Pulando a tarefa atual.' : 'Nenhuma tarefa em andamento.');
      case 'status': return reply(o.statusText());
      case 'ideia': { const r = command.arg ? o.idea(command.arg) : false; return reply(r === 'now' ? '👍 Vou fazer essa.' : r ? '📝 Ideia na fila para o próximo plano.' : 'Use /ideia seguida do texto.'); }
      case 'pick': return o.choose(command.arg) ? reply(`👍 Opção ${command.arg + 1}.`) : reply('Nada aguardando escolha agora.');
      case 'decide': return o.decide() ? reply('🤖 Eu escolho.') : reply('Nada aguardando escolha agora.');
      case 'text': return reply('Use /ideia para sugerir uma tarefa ou /ajuda.');
    }
  }

  return {
    async init() { prefsCache = await store.load(); await startTelegram().catch(() => {}); emitState(); },
    state,
    async configure(value = {}) {
      const patch = {};
      if (value.clearTelegram) Object.assign(patch, { telegramToken: null, chatId: null, chatName: null });
      else if (typeof value.telegramToken === 'string' && value.telegramToken.trim()) {
        const token = value.telegramToken.trim();
        if (!TOKEN.test(token)) throw new Error('Token do bot inválido. Copie o token do @BotFather.');
        if (token !== prefsCache.telegramToken) Object.assign(patch, { telegramToken: token, chatId: null, chatName: null });
      }
      if (value.clearNvidia) patch.nvidiaKey = null;
      else if (typeof value.nvidiaKey === 'string' && value.nvidiaKey.trim()) {
        if (!NVIDIA_KEY.test(value.nvidiaKey.trim())) throw new Error('Chave NVIDIA inválida (começa com nvapi-).');
        patch.nvidiaKey = value.nvidiaKey.trim();
      }
      if (value.claudeModel !== undefined) { if (!CLAUDE_MODEL.test(String(value.claudeModel))) throw new Error('Modelo Claude inválido.'); patch.claudeModel = String(value.claudeModel); }
      for (const key of ['nvidiaModel', 'freeModel']) if (value[key] !== undefined) { const v = String(value[key]).trim(); if (v && !runners.MODEL.test(v)) throw new Error('Nome de modelo inválido.'); patch[key] = v; }
      if (value.freeModel && !/^opencode\//.test(value.freeModel)) throw new Error('O modelo grátis do OpenCode começa com opencode/.');
      if (value.maxCycles !== undefined) patch.maxCycles = Math.max(0, Math.min(500, Math.round(Number(value.maxCycles) || 0)));
      if (value.maxHours !== undefined) patch.maxHours = Math.max(0, Math.min(72, Number(value.maxHours) || 0));
      const telegramChanged = 'telegramToken' in patch;
      prefsCache = await store.save(patch);
      if (telegramChanged) { pairing = null; await startTelegram().catch(async error => { await telegram.stop(); bot = null; throw error; }); }
      if ('nvidiaKey' in patch && patch.nvidiaKey) await runners.nvidiaModels({ key: patch.nvidiaKey, fetchImpl }).then(ids => { providers.nvidiaModel = runners.pickNvidiaModel(ids, prefsCache.nvidiaModel); }).catch(() => {});
      emitState();
      return state();
    },
    async pair() {
      if (!prefsCache.telegramToken || !telegram.running) throw new Error('Configure o token do bot primeiro.');
      pairing = { code: String(randomInt(100000, 1000000)), expires: Date.now() + 10 * 60e3, attempts: 0 };
      emitState();
      return state();
    },
    async unpair() { prefsCache = await store.save({ chatId: null, chatName: null }); pairing = null; emitState(); return state(); },
    start,
    stop: () => orchestrator.stop(),
    abort: () => orchestrator.abort(),
    setMode: mode => orchestrator.running ? orchestrator.setMode(mode) : store.save({ mode: mode === 'auto' ? 'auto' : 'manual' }).then(p => { prefsCache = p; emitState(); return p.mode; }),
    choose: index => orchestrator.choose(index),
    decide: () => orchestrator.decide(),
    idea: text => orchestrator.idea(text),
    get running() { return orchestrator.running; },
    async shutdown() { orchestrator.abort(); procs.abortAll(); await telegram.stop(); },
    _handle: handle,
  };
}

module.exports = { createAutowork, createStore, which, HELP };
