'use strict';
// Ciclo do auto-work: mapear (barato) → planejar backlog (Claude, sem ferramentas) → escolher → especificar (barato)
// → implementar (barato) → testar (local) → revisar (Claude, só diff) → commit. Repete até parar.
const prompts = require('./prompts.cjs');
const { extractJson } = require('./runners.cjs');
const { forbiddenPaths } = require('./sandbox.cjs');

const STATUS = { idle: 'Parado', preparing: 'Preparando worktree', mapping: 'Mapeando o projeto', planning: 'Planejando', choosing: 'Aguardando escolha', specifying: 'Organizando contexto', implementing: 'Implementando', verifying: 'Rodando testes', reviewing: 'Revisando', committing: 'Fazendo commit', waiting: 'Aguardando provedores' };
const STEPS = ['specifying', 'implementing', 'verifying', 'reviewing', 'committing'];
const PROVIDERS = { claude: 'Claude', nvidia: 'NVIDIA', opencode: 'OpenCode', local: 'Local' };
const REPLAN_BELOW = 3, DIGEST_EVERY = 4;

function parsePlan(text) {
  const data = extractJson(text);
  const options = (Array.isArray(data?.options) ? data.options : []).filter(o => o && typeof o.title === 'string' && o.title.trim()).slice(0, 5)
    .map(o => ({ title: o.title.trim().replace(/\s+/g, ' ').slice(0, 90), why: String(o.why || '').trim().replace(/\s+/g, ' ').slice(0, 200), size: ['P', 'M', 'G'].includes(o.size) ? o.size : 'M',
      files: (Array.isArray(o.files) ? o.files : []).filter(f => typeof f === 'string').map(f => f.slice(0, 160)).slice(0, 8) }));
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

function createOrchestrator({ think, implement, createSandbox, send, abortProcesses = () => {}, onState = () => {}, now = Date.now, retryDelayMs = 60000, pollMs = 1500 }) {
  let st = null, waiter = null, sleeper = null, loop = null, emitTimer = null;
  const flags = { stop: false, abort: false, skip: false };
  const fresh = () => ({ status: 'idle', mode: 'manual', root: null, cycle: 0, current: null, options: [], recommended: 0, commits: [], failures: [], ideas: [], usage: {}, log: [], activity: [], files: [], actor: null, digest: '', digestAt: -1, attempt: 0, startedAt: null, endedAt: null, reason: null, limits: {} });
  st = fresh();

  function snapshot() { return JSON.parse(JSON.stringify({ ...st, statusLabel: STATUS[st.status] || st.status, steps: STEPS, running: Boolean(loop) })); }
  // Eventos de atividade chegam em rajadas: agrupa as notificações à interface.
  const emit = () => { if (emitTimer) return; emitTimer = setTimeout(() => { emitTimer = null; try { onState(snapshot()); } catch {} }, 120); };
  function log(message) { st.log.push({ at: now(), message: String(message).slice(0, 300) }); if (st.log.length > 60) st.log.splice(0, st.log.length - 60); emit(); }
  function status(value) { st.status = value; st.stepAt = now(); emit(); }
  function notify(text, buttons) { return Promise.resolve().then(() => send(text, buttons)).catch(error => log('Telegram: ' + error.message)); }
  function addUsage(by, u) {
    if (!by || !u) return;
    const total = st.usage[by] ||= { input: 0, output: 0, cached: 0, estimated: false };
    total.input += u.input || 0; total.output += u.output || 0; total.cached += u.cached || 0; total.estimated ||= Boolean(u.estimated); emit();
  }
  const observer = {
    actor(by, label) { st.actor = { by, label: String(label || '').slice(0, 80), at: now() }; emit(); },
    note(by, text) { st.activity.push({ at: now(), by, text: String(text).slice(0, 160) }); if (st.activity.length > 40) st.activity.splice(0, st.activity.length - 40); emit(); },
  };
  const interrupted = () => flags.stop || flags.abort;
  function sleep(ms) { return new Promise(resolve => { const timer = setTimeout(done, ms); function done() { clearTimeout(timer); sleeper = null; resolve(); } sleeper = done; }); }
  function waitChoice() { return new Promise(resolve => { waiter = value => { waiter = null; resolve(value); }; }); }
  function wake(value) { waiter?.(value); sleeper?.(); }

  async function ask(kind, prompt, cwd) {
    const result = await think(kind, prompt, { cwd, observer });
    for (const attempt of result.attempts || [result]) addUsage(attempt.by, attempt.usage);
    if (result.notice) log(result.notice);
    st.actor = null;
    return result;
  }

  // Mapa do projeto feito por modelo barato, reaproveitado até DIGEST_EVERY commits novos.
  async function ensureDigest(cwd, ctx) {
    if (st.digest && st.commits.length - st.digestAt < DIGEST_EVERY) return;
    status('mapping');
    const mapped = await ask('digest', prompts.digest(ctx), cwd);
    if (mapped.ok && mapped.text.trim()) { st.digest = mapped.text.trim().slice(0, 5000); st.digestAt = st.commits.length; log(`Mapa do projeto por ${PROVIDERS[mapped.by] || mapped.by}.`); }
    else log('Mapa indisponível; o plano usa o resumo local.');
  }

  async function chooseTask(cwd, ctx) {
    // Backlog: o Claude planeja 5 tarefas e só replaneja quando sobram menos de 3 (ou há ideias novas).
    if (st.options.length < REPLAN_BELOW || st.ideas.length) {
      status('planning');
      const planned = await ask('plan', prompts.plan(ctx, st), cwd);
      if (!planned.ok) throw Object.assign(new Error('Planejamento falhou: ' + (planned.error || 'sem resposta')), { transient: true });
      const { options, recommended } = parsePlan(planned.text);
      if (!options.length) throw Object.assign(new Error('O orquestrador não retornou opções válidas.'), { transient: true });
      st.options = options; st.recommended = recommended; st.ideas = [];
      log(`Plano por ${PROVIDERS[planned.by] || planned.by}: ${options.length} opções.`);
    } else log(`Usando o backlog (${st.options.length} tarefas), sem novo plano.`);
    const take = index => { const [task] = st.options.splice(index, 1); st.recommended = 0; return task; };
    if (st.mode === 'auto') return take(st.recommended);
    status('choosing');
    const lines = st.options.map((o, i) => `${i + 1}. ${o.title} (${o.size})\n   ${o.why}`);
    await notify(`🧭 Próxima tarefa (ciclo ${st.cycle + 1})\n\n${lines.join('\n')}\n\n⭐ Recomendo: ${st.recommended + 1}`, [
      st.options.map((_, i) => ({ text: String(i + 1), callback_data: 'pick:' + i })),
      [{ text: '🤖 Decida você', callback_data: 'pick:auto' }, { text: '⏹ Parar', callback_data: 'stop' }],
    ]);
    const choice = await waitChoice();
    if (choice.stop || interrupted()) return null;
    if (choice.idea) return { title: choice.idea.slice(0, 90), why: 'Pedido pelo usuário: ' + choice.idea.slice(0, 180), size: 'M', files: [] };
    return take(choice.auto || !st.options[choice.index] ? st.recommended : choice.index);
  }

  // Acompanha o worktree enquanto o agente edita, para a interface mostrar os arquivos em tempo real.
  function watchFiles(sandbox) {
    if (!sandbox.liveFiles) return () => {};
    let busy = false, last = '';
    const poll = async () => {
      if (busy) return; busy = true;
      try { const files = await sandbox.liveFiles(); const key = files.map(f => f.path + f.mtime + f.added + f.removed).join('|'); if (key !== last) { last = key; st.files = files; emit(); } }
      catch {} finally { busy = false; }
    };
    const timer = setInterval(poll, pollMs);
    return async () => { clearInterval(timer); while (busy) await new Promise(r => setTimeout(r, 50)); await poll(); };
  }

  async function runCycle(sandbox, task, ctx) {
    const cwd = sandbox.workdir;
    st.cycle++; st.current = { ...task, started: now() }; st.files = []; st.activity = []; st.attempt = 0; flags.skip = false;
    await sandbox.reset();
    const base = await sandbox.head();
    log(`Ciclo ${st.cycle}: ${task.title}`);
    if (st.mode === 'auto') await notify(`▶️ #${st.cycle} ${task.title}`);
    status('specifying');
    const specified = await ask('spec', prompts.spec(task, ctx, st), cwd);
    const specText = specified.ok ? specified.text.slice(0, 6000) : task.why;
    st.current.spec = specText.slice(0, 1200);
    let feedback = '', reason = 'sem alterações';
    for (let attempt = 1; attempt <= 2 && !interrupted() && !flags.skip; attempt++) {
      st.attempt = attempt;
      status('implementing');
      await sandbox.writeTask(prompts.taskFile(task, specText, feedback));
      const stopWatching = watchFiles(sandbox);
      const done = await implement(attempt, { cwd, observer });
      await stopWatching();
      st.actor = null;
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
      status('verifying'); observer.actor('local', 'npm test');
      const tests = await sandbox.test();
      st.actor = null;
      if (interrupted() || flags.skip) break;
      log(tests.ran ? (tests.ok ? 'Testes passaram.' : 'Testes falharam.') : 'Projeto sem testes.');
      if (!tests.ok) {
        // Testes falhando voltam direto ao implementador: nenhuma revisão do Claude é gasta.
        reason = 'testes falharam'; feedback = 'Os testes falharam:\n' + tests.output.slice(-1500);
        await sandbox.reset(); continue;
      }
      status('reviewing');
      const diff = await sandbox.diff();
      const reviewed = await ask('review', prompts.review(task, diff, tests, specText), cwd);
      const verdict = reviewed.ok ? parseReview(reviewed.text) : null;
      if (interrupted() || flags.skip) break;
      if (verdict?.approve) {
        status('committing');
        const hash = await sandbox.commit(verdict.commit || ('feat: ' + task.title).slice(0, 72));
        const entry = { hash, title: task.title, files: diff.files, added: diff.added, removed: diff.removed, by: done.by, at: now() };
        st.commits.push(entry); st.current = null;
        log(`Commit ${hash}: ${task.title}`);
        await notify(`✅ #${st.cycle} ${hash} · ${task.title}\n+${diff.added} −${diff.removed} · ${diff.files} arq. · ${tests.ran ? 'testes ok' : 'sem testes'} · ${PROVIDERS[done.by] || done.by}`);
        return true;
      }
      reason = verdict ? 'revisão reprovou: ' + verdict.feedback.slice(0, 120) : 'revisão indisponível';
      feedback = verdict?.feedback || '';
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
        await ensureDigest(sandbox.workdir, ctx);
        if (interrupted()) break;
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
    st.endedAt = now(); st.actor = null;
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
      return `🤖 ${STATUS[st.status] || st.status} · ciclo ${st.cycle}${st.current ? `\n${st.current.title}` : ''}${st.actor ? `\nAgora: ${PROVIDERS[st.actor.by] || st.actor.by} — ${st.actor.label}` : ''}\nModo: ${st.mode === 'auto' ? 'sozinho' : 'você escolhe'} · ${duration(now() - st.startedAt)}\nCommits: ${st.commits.length} · falhas: ${st.failures.length} · backlog: ${st.options.length}${last ? `\nÚltimo: ${last.hash} ${last.title}` : ''}\n${usageLine(st.usage)}`;
    },
    whenIdle() { return loop || Promise.resolve(); },
  };
}

module.exports = { createOrchestrator, parsePlan, parseReview, usageLine, STATUS, STEPS };
