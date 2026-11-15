'use strict';
// Ciclo do auto-work: planejar 5 tarefas → escolher (usuário ou orquestrador) → especificar → implementar → testar → revisar → commit.
const prompts = require('./prompts.cjs');
const { extractJson } = require('./runners.cjs');
const { forbiddenPaths } = require('./sandbox.cjs');

const STATUS = { idle: 'Parado', preparing: 'Preparando worktree', planning: 'Planejando', choosing: 'Aguardando escolha', specifying: 'Detalhando tarefa', implementing: 'Implementando', verifying: 'Rodando testes', reviewing: 'Revisando', committing: 'Fazendo commit', waiting: 'Aguardando provedores' };
const PROVIDERS = { claude: 'Claude', nvidia: 'NVIDIA', opencode: 'OpenCode' };

function parsePlan(text) {
  const data = extractJson(text);
  const options = (Array.isArray(data?.options) ? data.options : []).filter(o => o && typeof o.title === 'string' && o.title.trim()).slice(0, 5)
    .map(o => ({ title: o.title.trim().replace(/\s+/g, ' ').slice(0, 90), why: String(o.why || '').trim().replace(/\s+/g, ' ').slice(0, 200), size: ['P', 'M', 'G'].includes(o.size) ? o.size : 'M' }));
  const recommended = Number.isInteger(data?.recommended) && data.recommended >= 0 && data.recommended < options.length ? data.recommended : 0;
  return { options, recommended };
}
function parseReview(text) {
  const data = extractJson(text);
  if (!data || typeof data.approve !== 'boolean') return null;
  const commit = String(data.commit || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 100);
  return { approve: data.approve, feedback: String(data.feedback || '').trim().slice(0, 600), commit };
}
const kTokens = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1000 ? Math.round(n / 1000) + 'k' : String(n);
function duration(ms) { const m = Math.round(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m}min`; }
function usageLine(usage) {
  const parts = Object.entries(usage).filter(([, u]) => u.input + u.output > 0).map(([by, u]) => `${PROVIDERS[by] || by} ${kTokens(u.input + u.output)}${u.estimated ? '~' : ''}`);
  return parts.length ? 'Tokens: ' + parts.join(' · ') : 'Tokens: —';
}

function createOrchestrator({ think, implement, createSandbox, send, abortProcesses = () => {}, onState = () => {}, now = Date.now, retryDelayMs = 60000 }) {
  let st = null, waiter = null, sleeper = null, loop = null;
  const flags = { stop: false, abort: false, skip: false };
  const fresh = () => ({ status: 'idle', mode: 'manual', root: null, cycle: 0, current: null, options: [], recommended: 0, commits: [], failures: [], ideas: [], usage: {}, log: [], startedAt: null, endedAt: null, reason: null, limits: {} });
  st = fresh();

  function snapshot() { return JSON.parse(JSON.stringify({ ...st, statusLabel: STATUS[st.status] || st.status, running: Boolean(loop) })); }
  const emit = () => { try { onState(snapshot()); } catch {} };
  function log(message) { st.log.push({ at: now(), message: String(message).slice(0, 300) }); if (st.log.length > 60) st.log.splice(0, st.log.length - 60); emit(); }
  function status(value) { st.status = value; emit(); }
  function notify(text, buttons) { return Promise.resolve().then(() => send(text, buttons)).catch(error => log('Telegram: ' + error.message)); }
  function addUsage(by, u) {
    if (!by || !u) return;
    const total = st.usage[by] ||= { input: 0, output: 0, cached: 0, estimated: false };
    total.input += u.input || 0; total.output += u.output || 0; total.cached += u.cached || 0; total.estimated ||= Boolean(u.estimated); emit();
  }
  const interrupted = () => flags.stop || flags.abort;
  function sleep(ms) { return new Promise(resolve => { const timer = setTimeout(done, ms); function done() { clearTimeout(timer); sleeper = null; resolve(); } sleeper = done; }); }
  function waitChoice() { return new Promise(resolve => { waiter = value => { waiter = null; resolve(value); }; }); }
  function wake(value) { waiter?.(value); sleeper?.(); }

  async function ask(kind, prompt, cwd) {
    const result = await think(kind, prompt, { cwd });
    for (const attempt of result.attempts || [result]) addUsage(attempt.by, attempt.usage);
    if (result.notice) log(result.notice);
    return result;
  }

  async function chooseTask(cwd, ctx) {
    status('planning');
    const planned = await ask('plan', prompts.plan(ctx, st), cwd);
    if (!planned.ok) throw Object.assign(new Error('Planejamento falhou: ' + (planned.error || 'sem resposta')), { transient: true });
    const { options, recommended } = parsePlan(planned.text);
    if (!options.length) throw Object.assign(new Error('O orquestrador não retornou opções válidas.'), { transient: true });
    st.options = options; st.recommended = recommended; st.ideas = [];
    log(`Plano por ${PROVIDERS[planned.by] || planned.by}: ${options.length} opções.`);
    if (st.mode === 'auto') return options[recommended];
    status('choosing');
    const lines = options.map((o, i) => `${i + 1}. ${o.title} (${o.size})\n   ${o.why}`);
    await notify(`🧭 Próxima tarefa (ciclo ${st.cycle + 1})\n\n${lines.join('\n')}\n\n⭐ Recomendo: ${recommended + 1}`, [
      options.map((_, i) => ({ text: String(i + 1), callback_data: 'pick:' + i })),
      [{ text: '🤖 Decida você', callback_data: 'pick:auto' }, { text: '⏹ Parar', callback_data: 'stop' }],
    ]);
    const choice = await waitChoice();
    if (choice.stop || interrupted()) return null;
    if (choice.idea) return { title: choice.idea.slice(0, 90), why: 'Pedido pelo usuário: ' + choice.idea.slice(0, 180), size: 'M' };
    return options[choice.auto ? recommended : choice.index] || options[recommended];
  }

  async function runCycle(sandbox, task, ctx) {
    const cwd = sandbox.workdir;
    st.cycle++; st.current = { title: task.title, started: now() }; flags.skip = false;
    await sandbox.reset();
    const base = await sandbox.head();
    log(`Ciclo ${st.cycle}: ${task.title}`);
    if (st.mode === 'auto') await notify(`▶️ #${st.cycle} ${task.title}`);
    status('specifying');
    const specified = await ask('spec', prompts.spec(task, ctx), cwd);
    const specText = specified.ok ? specified.text.slice(0, 6000) : task.why;
    let feedback = '', reason = 'sem alterações';
    for (let attempt = 1; attempt <= 2 && !interrupted() && !flags.skip; attempt++) {
      status('implementing');
      await sandbox.writeTask(prompts.taskFile(task, specText, feedback));
      const done = await implement(attempt, { cwd });
      for (const a of done.attempts || [done]) addUsage(a.by, a.usage);
      await sandbox.clearTask();
      if (interrupted() || flags.skip) break;
      if (done.notice) log(done.notice);
      await sandbox.ensureHead(base);
      if (!done.ok) { reason = 'implementação falhou: ' + (done.error || '').slice(0, 120); log(reason); feedback = ''; continue; }
      log(`Implementado por ${PROVIDERS[done.by] || done.by} (tentativa ${attempt}).`);
      const changed = await sandbox.changes();
      const blocked = forbiddenPaths(changed);
      if (blocked.length) { reason = 'alterou arquivos protegidos: ' + blocked.slice(0, 3).join(', '); log(reason); await sandbox.reset(); break; }
      if (!changed.length) { reason = 'nenhuma alteração'; feedback = 'Nenhum arquivo foi alterado. Implemente a tarefa.'; log(reason); continue; }
      status('verifying');
      const tests = await sandbox.test();
      if (interrupted() || flags.skip) break;
      log(tests.ran ? (tests.ok ? 'Testes passaram.' : 'Testes falharam.') : 'Projeto sem testes.');
      status('reviewing');
      const diff = await sandbox.diff();
      const reviewed = await ask('review', prompts.review(task, diff, tests), cwd);
      const verdict = reviewed.ok ? parseReview(reviewed.text) : null;
      if (interrupted() || flags.skip) break;
      if (verdict?.approve && tests.ok) {
        status('committing');
        const hash = await sandbox.commit(verdict.commit || ('feat: ' + task.title).slice(0, 72));
        const entry = { hash, title: task.title, files: diff.files, added: diff.added, removed: diff.removed, by: done.by, at: now() };
        st.commits.push(entry); st.current = null;
        log(`Commit ${hash}: ${task.title}`);
        await notify(`✅ #${st.cycle} ${hash} · ${task.title}\n+${diff.added} −${diff.removed} · ${diff.files} arq. · ${tests.ran ? 'testes ok' : 'sem testes'} · ${PROVIDERS[done.by] || done.by}`);
        return true;
      }
      reason = !tests.ok ? 'testes falharam' : verdict ? 'revisão reprovou: ' + verdict.feedback.slice(0, 120) : 'revisão indisponível';
      feedback = [!tests.ok ? 'Os testes falharam:\n' + tests.output.slice(-1500) : '', verdict?.feedback || ''].filter(Boolean).join('\n\n');
      log(reason);
      await sandbox.reset();
    }
    await sandbox.reset().catch(() => {});
    if (flags.skip) reason = 'pulada pelo usuário';
    if (flags.abort) reason = 'abortada';
    st.failures.push({ title: task.title, reason, at: now() }); st.current = null;
    if (!flags.abort) await notify(`❌ #${st.cycle} ${task.title}\n${reason}`);
    return false;
  }

  function limitReason(consecutive) {
    if (st.limits.maxCycles && st.cycle >= st.limits.maxCycles) return `limite de ${st.limits.maxCycles} ciclos`;
    if (st.limits.maxHours && now() - st.startedAt >= st.limits.maxHours * 3600e3) return `limite de ${st.limits.maxHours}h`;
    if (consecutive >= 3) return '3 falhas seguidas';
    return null;
  }

  async function main() {
    status('preparing');
    const sandbox = createSandbox(st.root);
    const box = await sandbox.prepare();
    log(`Worktree pronto na branch ${box.branch}.`);
    await notify(`🤖 Auto-work iniciado\nPasta: ${st.name}\nModo: ${st.mode === 'auto' ? 'decide sozinho' : 'você escolhe'} · branch ${box.branch}\n/parar para encerrar · /status`);
    let consecutive = 0;
    while (!interrupted()) {
      const limit = limitReason(consecutive);
      if (limit) { st.reason = limit; break; }
      try {
        const ctx = await sandbox.context();
        const task = await chooseTask(sandbox.workdir, ctx);
        if (!task || interrupted()) break;
        consecutive = (await runCycle(sandbox, task, ctx)) ? 0 : consecutive + 1;
      } catch (error) {
        if (interrupted()) break;
        consecutive++;
        log(error.message);
        if (!error.transient) throw error;
        await notify(`⚠️ ${error.message.slice(0, 200)}\nNova tentativa em ${Math.round(retryDelayMs / 1000)}s.`);
        status('waiting'); await sleep(retryDelayMs);
      }
    }
    if (flags.abort) await sandbox.reset().catch(() => {});
  }

  async function finish(error) {
    st.endedAt = now();
    st.reason = error ? 'erro: ' + error.message.slice(0, 160) : flags.abort ? 'abortado pelo usuário' : flags.stop ? 'pedido do usuário' : st.reason || 'fim';
    const commits = st.commits.map(c => `• ${c.hash} ${c.title}`).slice(-15);
    const text = `🏁 Auto-work encerrado (${st.reason})\nCiclos: ${st.cycle} · commits: ${st.commits.length} · falhas: ${st.failures.length} · ${duration(st.endedAt - st.startedAt)}\n${commits.join('\n')}${commits.length ? '\n' : ''}${usageLine(st.usage)}\n${st.commits.length ? 'Branch autowork pronta para revisão e merge.' : ''}`;
    log('Encerrado: ' + st.reason);
    await notify(text.trim());
  }

  return {
    snapshot,
    get running() { return Boolean(loop); },
    start({ root, name, mode = 'manual', limits = {} }) {
      if (loop) throw new Error('O auto-work já está em execução.');
      const ideas = st.ideas;
      st = fresh(); st.root = root; st.name = name || root; st.mode = mode === 'auto' ? 'auto' : 'manual'; st.ideas = ideas.slice(0, 10); st.startedAt = now();
      st.limits = { maxCycles: Math.max(0, Math.min(500, Number(limits.maxCycles) || 0)), maxHours: Math.max(0, Math.min(72, Number(limits.maxHours) || 0)) };
      flags.stop = flags.abort = flags.skip = false;
      loop = main().then(() => finish(), error => finish(error)).finally(() => { loop = null; status('idle'); });
      emit();
      return snapshot();
    },
    stop() { if (!loop) return false; flags.stop = true; log('Parada solicitada: encerrando após a etapa atual.'); wake({ stop: true }); return true; },
    abort() { if (!loop) return false; flags.abort = flags.stop = true; log('Abortando agora.'); abortProcesses(); wake({ stop: true }); return true; },
    skip() { if (!loop || !st.current) return false; flags.skip = true; log('Pulando a tarefa atual.'); abortProcesses(); return true; },
    choose(index) { if (!waiter || !Number.isInteger(index) || index < 0 || index >= st.options.length) return false; log(`Escolhida a opção ${index + 1}.`); waiter({ index }); return true; },
    decide() { if (!waiter) return false; log('Orquestrador vai decidir esta.'); waiter({ auto: true }); return true; },
    idea(text) {
      const value = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 500);
      if (!value) return false;
      if (waiter) { log('Ideia do usuário escolhida.'); waiter({ idea: value }); return 'now'; }
      st.ideas.push(value); if (st.ideas.length > 10) st.ideas.shift(); log('Ideia adicionada à fila.'); return 'queued';
    },
    setMode(mode) { st.mode = mode === 'auto' ? 'auto' : 'manual'; log(st.mode === 'auto' ? 'Modo: decide sozinho.' : 'Modo: você escolhe.'); if (st.mode === 'auto' && waiter) waiter({ auto: true }); emit(); return st.mode; },
    statusText() {
      if (!loop) return `⏸ Auto-work parado.${st.endedAt ? ` Última sessão: ${st.commits.length} commits (${st.reason}).` : ''}`;
      const last = st.commits.at(-1);
      return `🤖 ${STATUS[st.status] || st.status} · ciclo ${st.cycle}${st.current ? `\n${st.current.title}` : ''}\nModo: ${st.mode === 'auto' ? 'sozinho' : 'você escolhe'} · ${duration(now() - st.startedAt)}\nCommits: ${st.commits.length} · falhas: ${st.failures.length}${last ? `\nÚltimo: ${last.hash} ${last.title}` : ''}\n${usageLine(st.usage)}`;
    },
    whenIdle() { return loop || Promise.resolve(); },
  };
}

module.exports = { createOrchestrator, parsePlan, parseReview, usageLine, STATUS };
