// Valida as migrations num Postgres embutido (PGlite), com stubs mínimos de auth/storage do Supabase, e testa o isolamento por equipe (RLS).
// Uso: npm i --no-save @electric-sql/pglite@0.3.14 && node supabase/tests/rls-check.mjs
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = process.argv[2] || fileURLToPath(new URL('../migrations/', import.meta.url));
const db = new PGlite();
const ok = (cond, msg) => { if (!cond) { console.error('FALHOU: ' + msg); process.exitCode = 1; } else console.log('ok - ' + msg); };
await db.exec(`
create role anon nologin; create role authenticated nologin;
create schema auth; create schema storage;
create table auth.users(id uuid primary key, email text, created_at timestamptz default now());
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name,'/') $$;
create function public.rls_auto_enable() returns void language sql as $$ select $$;
insert into auth.users(id,email,created_at) values
 ('00000000-0000-0000-0000-00000000000a','a@x','2026-01-01'),('00000000-0000-0000-0000-00000000000b','b@x','2026-01-02');
`);
const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
// Dados legados antes da migration de equipes.
for (const f of files) {
  if (f.includes('teams')) {
    await db.exec(`insert into public.mcode_clients(owner_id,code,name) values('00000000-0000-0000-0000-00000000000a','acme','Acme');
      insert into public.mcode_todos(created_by,title) values('00000000-0000-0000-0000-00000000000b','Legado');`);
  }
  try { await db.exec(fs.readFileSync(path.join(dir, f), 'utf8')); ok(true, 'migration ' + f); }
  catch (e) { ok(false, 'migration ' + f + ': ' + e.message); process.exit(1); }
}
const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b', C = '00000000-0000-0000-0000-00000000000c';
await db.exec(`insert into auth.users(id,email) values('${C}','c@x'); insert into public.mcode_profiles(id,username,display_name) values('${C}','carla','Carla') on conflict(id) do update set username='carla',display_name='Carla';`);
const as = async (uid, sql, params) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${uid}',false); set role authenticated;`);
  try { return { rows: (await db.query(sql, params)).rows }; } catch (e) { return { error: e.message }; } finally { await db.exec('reset role'); }
};
const legacy = (await db.query(`select id from public.mcode_teams`)).rows[0]?.id;
ok(Boolean(legacy), 'equipe inicial criada para dados existentes');
ok((await db.query(`select role from public.mcode_team_members where user_id='${A}'`)).rows[0]?.role === 'owner', 'conta mais antiga é dona');
ok((await as(A, `select * from public.mcode_clients`)).rows?.length === 1, 'membro lê cliente legado');
ok((await as(C, `select * from public.mcode_clients`)).rows?.length === 0, 'não membro não lê cliente');
ok((await as(C, `select * from public.mcode_todos`)).rows?.length === 0, 'não membro não lê tarefas');
const ins = await as(C, `insert into public.mcode_todos(created_by,title,team_id) values($1,'x',$2)`, [C, legacy]);
ok(Boolean(ins.error), 'não membro não insere na equipe alheia');
const created = await as(C, `select public.mcode_create_team('Equipe C') id`);
const teamC = created.rows?.[0]?.id; ok(Boolean(teamC), 'cria equipe via RPC');
ok(!(await as(C, `insert into public.mcode_todos(created_by,title,team_id) values($1,'minha',$2)`, [C, teamC])).error, 'dono insere tarefa na própria equipe');
ok((await as(A, `select * from public.mcode_todos where team_id=$1`, [teamC])).rows?.length === 0, 'outra equipe não vê tarefas de C');
ok(Boolean((await as(C, `insert into public.mcode_clients(owner_id,code,name,team_id) values($1,'acme','Acme C',$2)`, [C, teamC])).error) === false, 'mesmo código de cliente em outra equipe');
ok(Boolean((await as(A, `update public.mcode_todos set team_id=$1`, [teamC])).error), 'team_id não pode ser alterado');
const invite = await as(C, `select public.mcode_create_invite($1,'member',7,1) code`, [teamC]);
const code = invite.rows?.[0]?.code; ok(/^[0-9a-f]{32}$/.test(code || ''), 'convite gera código');
ok(Boolean((await as(B, `select public.mcode_create_invite($1,'member',7,1)`, [teamC])).error), 'não membro não convida');
ok((await as(C, `select code_hash from public.mcode_team_invites`)).error !== undefined, 'hash do convite não é legível');
ok((await as(B, `select public.mcode_accept_invite($1) id`, [code.toUpperCase()])).rows?.[0]?.id === teamC, 'convite aceito');
ok(Boolean((await as(A, `select public.mcode_accept_invite($1)`, [code])).error), 'convite de uso único não reutiliza');
ok((await as(B, `select * from public.mcode_todos where team_id=$1`, [teamC])).rows?.length === 1, 'novo membro lê tarefas');
ok((await as(B, `select display_name from public.mcode_profiles where id=$1`, [C])).rows?.[0]?.display_name === 'Carla', 'membros veem perfis da equipe');
ok((await as(A, `select * from public.mcode_profiles where id=$1`, [C])).rows?.length === 0, 'perfis de fora da equipe ficam ocultos');
ok(Boolean((await as(B, `select public.mcode_create_invite($1,'member',7,1)`, [teamC])).error), 'membro comum não convida');
ok(Boolean((await as(B, `select public.mcode_set_member_role($1,$2,'admin')`, [teamC, B])).error), 'membro não se promove');
ok(!(await as(C, `select public.mcode_set_member_role($1,$2,'admin')`, [teamC, B])).error, 'dono promove');
ok(Boolean((await as(B, `select public.mcode_create_invite($1,'admin',7,1)`, [teamC])).error), 'admin não cria convite de admin');
ok(Boolean((await as(C, `select public.mcode_remove_member($1,$2)`, [teamC, C])).error), 'último dono não sai');
ok(Boolean((await as(B, `select public.mcode_remove_member($1,$2)`, [teamC, C])).error), 'admin não remove dono');
ok(!(await as(B, `update public.mcode_teams set name='Renomeada' where id=$1`, [teamC])).error, 'admin renomeia');
ok((await as(B, `delete from public.mcode_teams where id=$1 returning id`, [teamC])).rows?.length === 0, 'admin não exclui equipe');
ok(!(await as(B, `select public.mcode_remove_member($1,$2)`, [teamC, B])).error, 'membro sai da equipe');
ok((await as(B, `select * from public.mcode_todos where team_id=$1`, [teamC])).rows?.length === 0, 'ex-membro perde acesso');
ok((await as(C, `delete from public.mcode_teams where id=$1 returning id`, [teamC])).rows?.length === 1, 'dono exclui equipe');
ok((await db.query(`select count(*)::int n from public.mcode_todos where team_id=$1`, [teamC])).rows[0].n === 0, 'exclusão em cascata');
ok(Boolean((await as(A, `select * from public.mcode_teams`)).rows) && (await db.exec("reset role"), true), 'fim');
