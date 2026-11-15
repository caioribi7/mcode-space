// Lateral do auto-work: configuração, pareamento do Telegram, controle do ciclo e registro resumido.
export function setupAutowork({ api, icon, notify, activeRoot }) {
  const $ = id => document.getElementById(id);
  let current = null, busy = false;
  const node = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
  const k = n => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1000 ? Math.round(n / 1000) + 'k' : String(n);
  const providers = { claude: 'Claude', nvidia: 'NVIDIA', opencode: 'OpenCode' };
  const time = at => new Date(at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  async function act(fn, success) {
    if (busy) return; busy = true; render();
    try { const result = await fn(); if (result && result.telegram) current = result; if (success) notify(success); }
    catch (error) { notify(error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); }
    finally { busy = false; render(); }
  }

  function render() {
    if (!current) return;
    const { run, telegram, nvidia, opencode, claude, prefs } = current;
    const running = run.running;
    $('autowork-status').textContent = running ? `${run.statusLabel} · ciclo ${run.cycle}` : 'Parado';
    $('autowork-status').classList.toggle('active', running);
    $('autowork-current').textContent = running && run.current ? run.current.title : running ? '' : run.endedAt ? `Última sessão: ${run.commits.length} commits · ${run.reason}` : 'Abra uma pasta com Git e inicie.';
    $('autowork-folder').textContent = running ? run.name || run.root : activeRoot() ? 'Pasta: ' + activeRoot() : 'Nenhuma pasta aberta.';
    $('autowork-start').hidden = running; $('autowork-stop').hidden = !running; $('autowork-abort').hidden = !running;
    $('autowork-start').disabled = busy || !activeRoot();
    const mode = running ? run.mode : prefs.mode;
    for (const b of document.querySelectorAll('[data-autowork-mode]')) b.setAttribute('aria-pressed', String(b.dataset.autoworkMode === mode));
    const usage = Object.entries(run.usage || {}).filter(([, u]) => u.input + u.output > 0).map(([by, u]) => `${providers[by] || by} ${k(u.input + u.output)}${u.estimated ? '~' : ''}`);
    $('autowork-usage').textContent = (run.commits.length || run.failures.length ? `${run.commits.length} commits · ${run.failures.length} falhas · ` : '') + (usage.length ? 'Tokens: ' + usage.join(' · ') : '');

    const choices = $('autowork-choices'); choices.replaceChildren();
    choices.hidden = !(running && run.status === 'choosing');
    if (!choices.hidden) {
      choices.append(node('h2', 'Escolha a próxima tarefa'));
      run.options.forEach((option, index) => {
        const b = node('button', undefined, 'autowork-option' + (index === run.recommended ? ' recommended' : ''));
        b.type = 'button'; b.disabled = busy;
        b.append(node('strong', `${index + 1}. ${option.title}`), node('span', option.why));
        b.onclick = () => act(() => api.autoworkChoose(index));
        choices.append(b);
      });
      const decide = node('button', 'Decida você', 'button subtle'); decide.type = 'button'; decide.onclick = () => act(() => api.autoworkDecide()); choices.append(decide);
    }

    $('autowork-telegram-state').textContent = !telegram.configured ? 'Sem bot configurado.' : telegram.error ? 'Erro: ' + telegram.error : telegram.paired ? `Bot ${telegram.bot || ''} pareado com ${telegram.chatName || 'seu chat'}.` : `Bot ${telegram.bot || ''} ativo, aguardando pareamento.`;
    $('autowork-pair').hidden = !telegram.configured || telegram.paired;
    $('autowork-unpair').hidden = !telegram.paired;
    $('autowork-pairing').textContent = telegram.pairing ? `Envie ao bot, em até 10 min:  /parear ${telegram.pairing.code}` : '';
    $('autowork-clear-telegram').hidden = !telegram.configured;
    $('autowork-clear-nvidia').hidden = !nvidia.configured;
    $('autowork-providers').replaceChildren(
      node('li', `Claude (plano): ${claude.available ? (claude.limitedUntil ? 'no limite até ' + time(claude.limitedUntil) : 'disponível') : 'não encontrado'}`),
      node('li', `NVIDIA: ${nvidia.configured ? (nvidia.model || 'modelo escolhido ao iniciar') : 'sem chave'}`),
      node('li', `OpenCode: ${opencode.available ? (opencode.freeModel || 'modelo grátis escolhido ao iniciar') : 'não instalado'}`),
    );
    const form = $('autowork-form').elements;
    if (document.activeElement?.form !== $('autowork-form')) {
      form.claudeModel.value = prefs.claudeModel; form.nvidiaModel.value = prefs.nvidiaModel; form.freeModel.value = prefs.freeModel;
      form.maxCycles.value = prefs.maxCycles; form.maxHours.value = prefs.maxHours;
      form.telegramToken.placeholder = telegram.configured ? 'Token salvo (criptografado)' : '123456:ABC…';
      form.nvidiaKey.placeholder = nvidia.configured ? 'Chave salva (criptografada)' : 'nvapi-…';
    }
    const log = $('autowork-log'); log.replaceChildren();
    for (const entry of run.log.slice(-25).reverse()) { const li = node('li'); li.append(node('time', time(entry.at)), node('span', entry.message)); log.append(li); }
  }

  $('autowork-start').onclick = () => {
    const mode = document.querySelector('[data-autowork-mode][aria-pressed="true"]')?.dataset.autoworkMode || 'manual';
    act(() => api.autoworkStart(activeRoot(), mode));
  };
  $('autowork-stop').onclick = () => act(() => api.autoworkStop(), 'O auto-work encerra após a etapa atual.');
  $('autowork-abort').onclick = () => act(() => api.autoworkAbort());
  for (const b of document.querySelectorAll('[data-autowork-mode]')) b.onclick = () => act(() => api.autoworkMode(b.dataset.autoworkMode));
  $('autowork-pair').onclick = () => act(() => api.autoworkPair());
  $('autowork-unpair').onclick = () => { if (confirm('Desparear o chat do Telegram?')) act(() => api.autoworkUnpair()); };
  $('autowork-clear-telegram').onclick = () => { if (confirm('Remover o token do bot do Telegram?')) act(() => api.autoworkConfigure({ clearTelegram: true })); };
  $('autowork-clear-nvidia').onclick = () => { if (confirm('Remover a chave da NVIDIA?')) act(() => api.autoworkConfigure({ clearNvidia: true })); };
  $('autowork-idea').onsubmit = event => {
    event.preventDefault();
    const field = event.target.elements.idea, text = field.value.trim();
    if (text) act(async () => { const r = await api.autoworkIdea(text); field.value = ''; notify(r === 'now' ? 'Ideia escolhida para este ciclo.' : 'Ideia na fila do próximo plano.'); });
  };
  $('autowork-form').onsubmit = event => {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(event.target));
    act(async () => { const result = await api.autoworkConfigure(fields); event.target.elements.telegramToken.value = ''; event.target.elements.nvidiaKey.value = ''; return result; }, 'Configuração do auto-work salva.');
  };
  api.onAutowork(value => { current = value; render(); });
  window.addEventListener('mcode-sidebar', e => { if (e.detail.name === 'autowork') api.autoworkState().then(value => { current = value; render(); }).catch(() => {}); });
  api.autoworkState().then(value => { current = value; render(); }).catch(() => {});
}
