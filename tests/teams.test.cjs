const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
const { createTeams, teamName, inviteCode, inviteInput } = require('../electron/teams.cjs');

const T1 = '00000000-0000-0000-0000-0000000000a1', T2 = '00000000-0000-0000-0000-0000000000a2', U = '00000000-0000-0000-0000-0000000000f1';

test('team inputs are validated before reaching Supabase', () => {
  assert.equal(teamName('  Acme   Ltda '), 'Acme Ltda');
  for (const v of ['', 'a', 'x'.repeat(81), 42]) assert.throws(() => teamName(v));
  assert.equal(inviteCode(' ABCDEF0123456789abcdef0123456789 '), 'abcdef0123456789abcdef0123456789');
  for (const v of ['abc', 'g'.repeat(32), "'; drop table x; --"]) assert.throws(() => inviteCode(v));
  assert.deepEqual(inviteInput({ role: 'owner', days: '3', uses: '2' }), { role: 'member', days: 3, uses: 2 });
  assert.throws(() => inviteInput({ days: 0 })); assert.throws(() => inviteInput({ uses: 101 }));
});

function fakeClient(memberships, calls) {
  return {
    from(table) {
      const q = { filters: [], select() { return q; }, eq(...a) { q.filters.push(a); calls.push([table, 'eq', ...a]); return q; }, in() { return q; }, gt() { return q; }, order() { return q; }, limit() { return q; },
        update(v) { calls.push([table, 'update', v]); return q; },
        then(resolve) {
          let data = [];
          if (table === 'mcode_team_members' && q.filters.some(f => f[0] === 'user_id')) data = memberships;
          else if (table === 'mcode_team_members') data = [{ user_id: U, role: 'member', created_at: '2026-01-01' }];
          else if (table === 'mcode_profiles') data = [{ id: U, username: 'ana', display_name: 'Ana' }];
          return Promise.resolve({ data, error: null }).then(resolve);
        } };
      return q;
    },
    async rpc(name, args) { calls.push(['rpc', name, args]); return { data: name === 'mcode_create_invite' ? 'a'.repeat(32) : T2, error: null }; },
  };
}

test('active team is per account, limited to memberships and gates admin actions', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcode-teams-'));
  try {
    const calls = [], memberships = [{ role: 'member', team: { id: T1, name: 'Beta' } }, { role: 'owner', team: { id: T2, name: 'Alpha' } }];
    const client = fakeClient(memberships, calls);
    const account = { user: async () => ({ id: U }), getClient: async () => client, check: e => { if (e) throw e; }, isSignedIn: async () => true };
    let changes = 0;
    const teams = createTeams({ account, file: path.join(dir, 'teams.json'), cacheMs: 0 });
    teams.onChange(() => changes++);
    let state = await teams.state();
    assert.deepEqual(state.teams.map(t => t.name), ['Alpha', 'Beta']);
    assert.equal(state.active.id, T2); assert.equal(state.members[0].self, true);
    await assert.rejects(teams.select('00000000-0000-0000-0000-0000000000ff'), /não participa/);
    state = await teams.select(T1);
    assert.equal(state.active.id, T1); assert.equal(changes, 1);
    assert.equal(JSON.parse(await fs.readFile(path.join(dir, 'teams.json'), 'utf8')).active[U], T1);
    assert.equal(state.invites.length, 0, 'membro comum não lista convites');
    await assert.rejects(teams.invite({ role: 'member' }), /donos e administradores/);
    await assert.rejects(teams.rename('Novo'), /donos e administradores/);
    await assert.rejects(teams.remove(T1), /Somente donos/);
    await assert.rejects(teams.leave(T2), /mudou/);
    await teams.select(T2);
    const invite = await teams.invite({ role: 'admin', days: 2, uses: 5 });
    assert.equal(invite.code, 'a'.repeat(32));
    assert.deepEqual(calls.find(c => c[1] === 'mcode_create_invite')[2], { team: T2, invite_role: 'admin', valid_days: 2, uses_allowed: 5 });
    assert.equal((await teams.current()).id, T2);
    memberships.length = 0;
    await assert.rejects(teams.current(), /Crie ou entre numa equipe/);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
