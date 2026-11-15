// Equipes (organizações): cada conta participa de várias equipes; caixa e tarefas usam a equipe ativa.
const fs = require('node:fs/promises');
const path = require('node:path');
const ROLES = ['owner', 'admin', 'member'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function teamName(value) { const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''; if (name.length < 2 || name.length > 80) throw Error('Use um nome de equipe com 2 a 80 caracteres.'); return name; }
function inviteCode(value) { const code = String(value || '').trim().toLowerCase().replace(/[\s-]/g, ''); if (!/^[0-9a-f]{32}$/.test(code)) throw Error('Código de convite inválido.'); return code; }
function uuid(value, label = 'Identificador') { if (typeof value !== 'string' || !UUID.test(value)) throw Error(label + ' inválido.'); return value; }
function inviteInput(value = {}) {
  const role = value.role === 'admin' ? 'admin' : 'member';
  const days = Math.round(Number(value.days ?? 7)), uses = Math.round(Number(value.uses ?? 1));
  if (!(days >= 1 && days <= 30) || !(uses >= 1 && uses <= 100)) throw Error('Validade de 1 a 30 dias e de 1 a 100 usos.');
  return { role, days, uses };
}

function createTeams({ account, file, cacheMs = 4000, now = Date.now }) {
  let cache = null, prefs = null, queue = Promise.resolve();
  const listeners = new Set();
  async function loadPrefs() { if (prefs) return prefs; try { prefs = JSON.parse(await fs.readFile(file, 'utf8')); } catch { prefs = {}; } if (!prefs.active || typeof prefs.active !== 'object') prefs.active = {}; return prefs; }
  function savePrefs() { const snapshot = JSON.stringify(prefs); queue = queue.catch(() => {}).then(async () => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file + '.tmp', snapshot); await fs.rename(file + '.tmp', file); }); return queue; }
  function changed() { cache = null; for (const fn of listeners) try { fn(); } catch {} }

  async function memberships() {
    const u = await account.user(), c = await account.getClient();
    if (cache && cache.user === u.id && now() - cache.at < cacheMs) return { u, c, teams: cache.teams };
    const { data, error } = await c.from('mcode_team_members').select('role,team:mcode_teams(id,name)').eq('user_id', u.id);
    account.check(error);
    const teams = data.filter(r => r.team && ROLES.includes(r.role)).map(r => ({ id: r.team.id, name: r.team.name, role: r.role })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    cache = { user: u.id, at: now(), teams };
    return { u, c, teams };
  }
  async function active() {
    const { u, c, teams } = await memberships(), p = await loadPrefs();
    return { u, c, teams, team: teams.find(t => t.id === p.active[u.id]) || teams[0] || null };
  }
  // Usado por caixa e tarefas: a equipe precisa existir e a conta precisa ser membro.
  async function current() {
    const { team } = await active();
    if (!team) throw Error('Crie ou entre numa equipe para usar o caixa e as tarefas.');
    return team;
  }
  async function admin(team) { if (!['owner', 'admin'].includes(team.role)) throw Error('Somente donos e administradores podem fazer isso.'); return team; }

  async function state() {
    if (!(await account.isSignedIn())) return { teams: [], active: null, members: [], invites: [] };
    const { u, c, teams, team } = await active();
    if (!team) return { teams, active: null, members: [], invites: [] };
    const members = await c.from('mcode_team_members').select('user_id,role,created_at').eq('team_id', team.id).order('created_at');
    account.check(members.error);
    const ids = members.data.map(m => m.user_id);
    const profiles = ids.length ? await c.from('mcode_profiles').select('id,username,display_name').in('id', ids) : { data: [], error: null };
    account.check(profiles.error);
    const byId = new Map(profiles.data.map(p => [p.id, p]));
    let invites = [];
    if (team.role !== 'member') {
      const result = await c.from('mcode_team_invites').select('id,role,expires_at,max_uses,uses,revoked,created_at').eq('team_id', team.id).eq('revoked', false).gt('expires_at', new Date(now()).toISOString()).order('created_at', { ascending: false }).limit(20);
      account.check(result.error);
      invites = result.data.filter(i => i.uses < i.max_uses).map(i => ({ id: i.id, role: i.role, expiresAt: i.expires_at, uses: i.uses, maxUses: i.max_uses }));
    }
    return {
      teams, active: team, invites,
      members: members.data.map(m => ({ id: m.user_id, role: m.role, self: m.user_id === u.id, name: byId.get(m.user_id)?.display_name || '', username: byId.get(m.user_id)?.username || '' })),
    };
  }
  async function select(id) {
    uuid(id, 'Equipe');
    const { u, teams } = await memberships();
    if (!teams.some(t => t.id === id)) throw Error('Você não participa desta equipe.');
    (await loadPrefs()).active[u.id] = id; await savePrefs(); changed();
    return state();
  }
  async function rpc(name, args) { const c = await account.getClient(); const { data, error } = await c.rpc(name, args); account.check(error); return data; }

  return {
    state, current, select,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    reset() { changed(); },
    async create(name) { const id = await rpc('mcode_create_team', { team_name: teamName(name) }); cache = null; return select(id); },
    async rename(name) {
      const team = await admin(await current()), c = await account.getClient();
      const { data, error } = await c.from('mcode_teams').update({ name: teamName(name) }).eq('id', team.id).select('id');
      account.check(error); if (data.length !== 1) throw Error('Não foi possível renomear a equipe.'); changed(); return state();
    },
    async remove(expectedId) {
      const team = await current(); if (team.id !== expectedId) throw Error('A equipe ativa mudou. Confira antes de excluir.');
      if (team.role !== 'owner') throw Error('Somente donos excluem a equipe.');
      const c = await account.getClient(); const { data, error } = await c.from('mcode_teams').delete().eq('id', team.id).select('id');
      account.check(error); if (data.length !== 1) throw Error('Não foi possível excluir a equipe.'); changed(); return state();
    },
    async invite(value) {
      const team = await admin(await current()), input = inviteInput(value);
      if (input.role === 'admin' && team.role !== 'owner') throw Error('Somente donos convidam administradores.');
      const code = await rpc('mcode_create_invite', { team: team.id, invite_role: input.role, valid_days: input.days, uses_allowed: input.uses });
      return { code: inviteCode(code), state: await state() };
    },
    async revokeInvite(id) {
      const team = await admin(await current()), c = await account.getClient();
      const { error } = await c.from('mcode_team_invites').update({ revoked: true }).eq('id', uuid(id, 'Convite')).eq('team_id', team.id);
      account.check(error); return state();
    },
    async accept(code) { const id = await rpc('mcode_accept_invite', { invite_code: inviteCode(code) }); cache = null; return select(id); },
    async setRole(userId, role) {
      const team = await current(); if (!ROLES.includes(role)) throw Error('Papel inválido.');
      await rpc('mcode_set_member_role', { team: team.id, member: uuid(userId, 'Membro'), new_role: role }); changed(); return state();
    },
    async removeMember(userId) { const team = await current(); await rpc('mcode_remove_member', { team: team.id, member: uuid(userId, 'Membro') }); changed(); return state(); },
    async leave(expectedId) {
      const { u, team } = await active(); if (!team || team.id !== expectedId) throw Error('A equipe ativa mudou. Confira antes de sair.');
      await rpc('mcode_remove_member', { team: team.id, member: u.id }); changed(); return state();
    },
  };
}

module.exports = { createTeams, teamName, inviteCode, inviteInput };
