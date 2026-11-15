// Equipes na janela da conta: equipe ativa, criação, convites, membros e papéis.
const ROLE = { owner: 'Dono', admin: 'Administrador', member: 'Membro' };
export function setupTeams({ api, notify }) {
  const $ = id => document.getElementById(id);
  let current = { teams: [], active: null, members: [], invites: [] }, signed = false, busy = false;
  const node = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
  const clean = message => String(message || '').replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

  async function act(fn, success) {
    if (busy) return; busy = true; render();
    try { const next = await fn(); if (next && Array.isArray(next.teams)) current = next; if (success) notify(success); }
    catch (error) { $('team-status').textContent = clean(error.message); notify(clean(error.message)); }
    finally { busy = false; render(); }
  }
  function broadcast() {
    for (const n of document.querySelectorAll('[data-team-name]')) n.textContent = current.active ? current.active.name : 'nenhuma equipe';
    $('team-indicator').textContent = signed && current.active ? current.active.name : '';
    $('team-indicator').hidden = !(signed && current.active);
  }
  function render() {
    broadcast();
    const section = $('account-teams'); section.hidden = !signed;
    if (!signed) return;
    const team = current.active, role = team?.role;
    const select = $('team-select'); select.replaceChildren();
    for (const t of current.teams) { const o = node('option', `${t.name} · ${ROLE[t.role]}`); o.value = t.id; o.selected = t.id === team?.id; select.append(o); }
    select.hidden = !current.teams.length; select.disabled = busy;
    $('team-status').textContent = team ? `Caixa e tarefas mostram os dados de ${team.name}. Seu papel: ${ROLE[role]}.` : 'Crie uma equipe para sua empresa ou entre com um código de convite.';
    $('team-manage').hidden = !team;
    $('team-rename-form').hidden = !team || role === 'member';
    if (team && document.activeElement !== $('team-rename-form').elements.name) $('team-rename-form').elements.name.value = team.name;
    $('team-delete').hidden = role !== 'owner';
    $('team-invite-form').hidden = !team || role === 'member';
    $('team-invite-form').elements.role.querySelector('[value="admin"]').disabled = role !== 'owner';

    const members = $('team-members'); members.replaceChildren();
    for (const m of current.members) {
      const li = node('li'); const who = node('div');
      who.append(node('strong', (m.name || (m.username ? '@' + m.username : 'Perfil sem nome')) + (m.self ? ' (você)' : '')), node('small', (m.username ? '@' + m.username + ' · ' : '') + ROLE[m.role]));
      li.append(who);
      const actions = node('div', undefined, 'team-member-actions');
      if (role === 'owner' && !m.self) {
        const r = node('select'); r.setAttribute('aria-label', 'Papel de ' + (m.name || m.username || 'membro')); r.disabled = busy;
        for (const [value, label] of Object.entries(ROLE)) { const o = node('option', label); o.value = value; o.selected = value === m.role; r.append(o); }
        r.onchange = () => act(() => api.teamsRole(m.id, r.value), 'Papel atualizado.');
        actions.append(r);
      }
      if (!m.self && (role === 'owner' || (role === 'admin' && m.role === 'member'))) {
        const b = node('button', 'Remover', 'button subtle'); b.type = 'button'; b.disabled = busy;
        b.onclick = () => act(async () => (await api.teamsRemoveMember(m.id)) || current, null);
        actions.append(b);
      }
      li.append(actions); members.append(li);
    }
    const invites = $('team-invites'); invites.replaceChildren();
    for (const i of current.invites) {
      const li = node('li'); li.append(node('span', `${ROLE[i.role]} · ${i.uses}/${i.maxUses} usos · até ${new Date(i.expiresAt).toLocaleDateString('pt-BR')}`));
      const b = node('button', 'Revogar', 'button subtle'); b.type = 'button'; b.disabled = busy; b.onclick = () => act(() => api.teamsRevokeInvite(i.id), 'Convite revogado.');
      li.append(b); invites.append(li);
    }
    $('team-invites-title').hidden = !current.invites.length;
  }
  async function refresh() {
    if (!signed) { current = { teams: [], active: null, members: [], invites: [] }; render(); return; }
    try { current = await api.teamsState(); } catch (error) { $('team-status').textContent = clean(error.message); }
    render();
  }

  $('team-select').onchange = e => act(() => api.teamsSelect(e.target.value));
  $('team-create-form').onsubmit = e => { e.preventDefault(); const name = e.target.elements.name.value; act(async () => { const r = await api.teamsCreate(name); e.target.reset(); return r; }, 'Equipe criada.'); };
  $('team-join-form').onsubmit = e => { e.preventDefault(); const code = e.target.elements.code.value; act(async () => { const r = await api.teamsAccept(code); e.target.reset(); return r; }, 'Você entrou na equipe.'); };
  $('team-rename-form').onsubmit = e => { e.preventDefault(); act(() => api.teamsRename(e.target.elements.name.value), 'Equipe renomeada.'); };
  $('team-leave').onclick = () => act(async () => (await api.teamsLeave(current.active.id)) || current);
  $('team-delete').onclick = () => act(async () => (await api.teamsRemove(current.active.id)) || current);
  $('team-invite-form').onsubmit = e => {
    e.preventDefault();
    const value = Object.fromEntries(new FormData(e.target));
    act(async () => {
      const result = await api.teamsInvite(value);
      $('team-invite-code').value = result.code; $('team-invite-result').hidden = false; $('team-invite-code').select();
      navigator.clipboard?.writeText(result.code).catch(() => {});
      return result.state;
    }, 'Convite criado. Envie o código para a pessoa.');
  };
  window.addEventListener('mcode-account', e => { if (e.detail?.team) return; signed = Boolean(e.detail?.signedIn); $('team-invite-result').hidden = true; refresh(); });
  // Troca de equipe reinicia caixa e tarefas, descartando respostas da equipe anterior.
  api.onTeamsChanged(() => { refresh().then(() => window.dispatchEvent(new CustomEvent('mcode-account', { detail: { signedIn: signed, team: true } }))); });
}
