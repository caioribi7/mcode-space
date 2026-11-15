// Palco do auto-work: ocupa a área dos terminais em mosaico. Um tile mostra contexto e progresso;
// os demais mostram, ao vivo, os arquivos que o agente está editando no worktree.
const PIPELINE = [['mapping', 'Mapa'], ['planning', 'Plano'], ['choosing', 'Escolha'], ['specifying', 'Contexto'], ['implementing', 'Implementar'], ['verifying', 'Testes'], ['reviewing', 'Revisão'], ['committing', 'Commit']];
const PROVIDERS = { claude: 'Claude', nvidia: 'NVIDIA', opencode: 'OpenCode', local: 'Local' };

export function setupAutoworkStage({ api, icon, notify }) {
  const $ = id => document.getElementById(id);
  let run = null, shown = false, wasRunning = false, clock = null, specOpen = false;
  const node = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
  const k = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1000 ? Math.round(n / 1000) + 'k' : String(n);
  const ago = at => { const s = Math.max(0, Math.round((Date.now() - at) / 1000)); return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}min` : `${Math.floor(s / 3600)}h${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}`; };
  const time = at => new Date(at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const clean = m => String(m || '').replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

  function setShown(value) {
    shown = value;
    $('autowork-stage').hidden = !shown;
    $('autowork-show').hidden = shown || !run || (!run.running && !run.endedAt);
    if (shown) render();
  }

  function progressTile() {
    const tile = node('section', undefined, 'aws-tile aws-progress');
    const task = run.current;
    tile.append(node('p', run.running ? run.statusLabel : 'Sessão encerrada', 'aws-kicker'));
    tile.append(node('h3', task?.title || (run.running ? 'Preparando a próxima tarefa' : run.reason || 'Auto-work parado')));
    if (task?.why) tile.append(node('p', task.why, 'aws-why'));

    const order = PIPELINE.map(([id]) => id), current = order.indexOf(run.status);
    const pipe = node('ol', undefined, 'aws-pipeline');
    PIPELINE.forEach(([id, label], i) => {
      const step = node('li', label, i < current ? 'done' : i === current ? 'active' : '');
      if (i === current) step.setAttribute('aria-current', 'step');
      pipe.append(step);
    });
    tile.append(pipe);

    const meta = [`Ciclo ${run.cycle}${run.limits?.maxCycles ? '/' + run.limits.maxCycles : ''}`];
    if (run.status === 'implementing' && run.attempt) meta.push(`tentativa ${run.attempt}/2`);
    if (run.startedAt) meta.push(ago(run.startedAt) + ' de sessão');
    meta.push(`backlog ${run.options.length}`);
    tile.append(node('p', meta.join(' · '), 'aws-meta'));

    if (run.actor) {
      const actor = node('div', undefined, 'aws-actor');
      actor.append(node('span', '', 'aws-pulse'), node('strong', PROVIDERS[run.actor.by] || run.actor.by), node('span', `${run.actor.label} · ${ago(run.actor.at)}`));
      tile.append(actor);
    }

    if (run.running && run.status === 'choosing') {
      const choices = node('div', undefined, 'aws-choices');
      run.options.forEach((option, index) => {
        const b = node('button', undefined, 'autowork-option' + (index === run.recommended ? ' recommended' : '')); b.type = 'button';
        b.append(node('strong', `${index + 1}. ${option.title}`), node('span', option.why));
        b.onclick = () => api.autoworkChoose(index).catch(e => notify(clean(e.message)));
        choices.append(b);
      });
      const decide = node('button', 'Decida você', 'button subtle'); decide.type = 'button'; decide.onclick = () => api.autoworkDecide().catch(e => notify(clean(e.message)));
      choices.append(decide); tile.append(choices);
    } else if (task?.spec && run.status !== 'specifying') {
      const details = node('details', undefined, 'aws-spec'); details.open = specOpen; details.ontoggle = () => { specOpen = details.open; }; details.append(node('summary', 'Contexto entregue ao implementador'), node('p', task.spec));
      tile.append(details);
    }

    tile.append(node('h4', 'Agora'));
    const feed = node('ol', undefined, 'aws-feed');
    const items = [...run.activity.map(a => ({ at: a.at, by: a.by, text: a.text })), ...run.log.slice(-6).map(l => ({ at: l.at, by: 'space', text: l.message }))].sort((a, b) => b.at - a.at).slice(0, 12);
    for (const item of items) { const li = node('li'); li.append(node('time', time(item.at)), node('span', PROVIDERS[item.by] || 'Space', 'aws-by ' + item.by), node('span', item.text)); feed.append(li); }
    if (!items.length) feed.append(node('li', 'Sem atividade ainda.'));
    tile.append(feed);

    const usage = Object.entries(run.usage || {}).filter(([, u]) => u.input + u.output > 0);
    const total = usage.reduce((n, [, u]) => n + u.input + u.output, 0);
    const foot = node('div', undefined, 'aws-foot');
    foot.append(node('span', `${run.commits.length} commits · ${run.failures.length} falhas`));
    for (const [by, u] of usage) foot.append(node('span', `${PROVIDERS[by] || by} ${k(u.input + u.output)}${u.estimated ? '~' : ''}${total ? ` (${Math.round((u.input + u.output) / total * 100)}%)` : ''}`, 'aws-by ' + by));
    tile.append(foot);
    if (run.commits.length) {
      const commits = node('ol', undefined, 'aws-commits');
      for (const c of run.commits.slice(-4).reverse()) commits.append(node('li', `${c.hash} ${c.title} (+${c.added} −${c.removed})`));
      tile.append(commits);
    }
    return tile;
  }

  function fileTile(file) {
    const tile = node('section', undefined, 'aws-tile aws-file');
    const head = node('header');
    head.append(node('span', file.status, 'aws-badge ' + file.status), node('strong', file.path), node('span', `+${file.added} −${file.removed}`, 'aws-stat'), node('time', ago(file.mtime)));
    const pre = node('pre', undefined, 'aws-diff');
    for (const line of String(file.diff || '').split('\n').slice(-400)) {
      pre.append(node('span', line || ' ', line.startsWith('@@') ? 'hunk' : line.startsWith('+') ? 'add' : line.startsWith('-') ? 'del' : ''));
    }
    tile.append(head, pre);
    return { tile, pre };
  }

  function render() {
    if (!run || !shown) return;
    $('aws-cycle').textContent = run.running ? `ciclo ${run.cycle}` : 'encerrado';
    $('aws-stop').hidden = !run.running;
    const grid = $('aws-grid'), progress = progressTile(), files = node('div', undefined, 'aws-files');
    // Preserva a rolagem de cada diff entre atualizações (acompanha o fim quando já estava no fim).
    const scroll = new Map([...grid.querySelectorAll('.aws-file')].map(t => { const pre = t.querySelector('pre'); return [t.dataset.path, { top: pre.scrollTop, end: pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 8 }]; }));
    const progressScroll = grid.querySelector('.aws-progress')?.scrollTop || 0;
    const pres = [];
    for (const file of run.files || []) { const { tile, pre } = fileTile(file); tile.dataset.path = file.path; files.append(tile); pres.push([file.path, pre]); }
    if (!run.files?.length) {
      const empty = node('section', undefined, 'aws-tile aws-empty');
      empty.append(node('p', run.status === 'implementing' ? 'Aguardando a primeira edição do agente…' : 'Os arquivos editados aparecem aqui, em tempo real, durante a implementação.'));
      files.append(empty);
    }
    files.dataset.count = String(Math.min(4, run.files?.length || 1));
    grid.replaceChildren(progress, files);
    progress.scrollTop = progressScroll;
    for (const [path, pre] of pres) { const s = scroll.get(path); pre.scrollTop = !s || s.end ? pre.scrollHeight : s.top; }
  }

  $('autowork-show').onclick = () => setShown(true);
  $('aws-hide').onclick = () => setShown(false);
  $('aws-stop').onclick = () => api.autoworkStop().then(() => notify('O auto-work encerra após a etapa atual.')).catch(e => notify(clean(e.message)));
  api.onAutowork(state => {
    run = state.run;
    if (run.running && !wasRunning) setShown(true);
    wasRunning = run.running;
    $('autowork-show').hidden = shown || (!run.running && !run.endedAt);
    $('autowork-show').classList.toggle('active', run.running);
    render();
  });
  // Atualiza os tempos relativos ("há 12s") sem depender de novos eventos.
  clock = setInterval(() => { if (shown && run?.running && !document.hidden) render(); }, 5000);
  api.autoworkState().then(state => { run = state.run; wasRunning = run.running; if (run.running) setShown(true); }).catch(() => {});
}
