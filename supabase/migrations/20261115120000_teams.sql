-- Equipes (organizações). Caixa e tarefas deixam de ser compartilhados entre TODAS as contas
-- e passam a pertencer a uma equipe; somente membros da equipe leem e alteram seus dados.
-- Antes de aplicar num projeto existente, inspecione o schema remoto (nomes de constraints e policies).

create table public.mcode_teams (
 id uuid primary key default gen_random_uuid(),
 name text not null check(char_length(trim(name)) between 2 and 80),
 created_by uuid default auth.uid() references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create trigger mcode_teams_touch before update on public.mcode_teams for each row execute function public.mcode_touch();

create table public.mcode_team_members (
 team_id uuid not null references public.mcode_teams(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null default 'member' check(role in ('owner','admin','member')),
 created_at timestamptz not null default now(),
 primary key(team_id,user_id)
);
create index mcode_team_members_user on public.mcode_team_members(user_id);

-- O código do convite só existe no retorno de mcode_create_invite; o banco guarda o SHA-256.
create table public.mcode_team_invites (
 id uuid primary key default gen_random_uuid(),
 team_id uuid not null references public.mcode_teams(id) on delete cascade,
 code_hash text not null unique,
 role text not null default 'member' check(role in ('admin','member')),
 created_by uuid references auth.users(id) on delete set null,
 expires_at timestamptz not null,
 max_uses int not null default 1 check(max_uses between 1 and 100),
 uses int not null default 0 check(uses>=0),
 revoked boolean not null default false,
 created_at timestamptz not null default now()
);
create index mcode_team_invites_team on public.mcode_team_invites(team_id,created_at desc);

-- Funções auxiliares das policies. security definer evita recursão de RLS em mcode_team_members.
create function public.mcode_team_role(team uuid) returns text language sql stable security definer set search_path='' as $$
 select m.role from public.mcode_team_members m where m.team_id=team and m.user_id=(select auth.uid());
$$;
create function public.mcode_is_member(team uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.mcode_team_members m where m.team_id=team and m.user_id=(select auth.uid()));
$$;
create function public.mcode_shares_team(other uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.mcode_team_members a join public.mcode_team_members b on b.team_id=a.team_id where a.user_id=(select auth.uid()) and b.user_id=other);
$$;

create function public.mcode_create_team(team_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); created uuid;
begin
 if uid is null then raise exception 'Entre na sua conta.' using errcode='42501'; end if;
 if (select count(*) from public.mcode_teams t where t.created_by=uid)>=20 then raise exception 'Limite de 20 equipes criadas por conta.' using errcode='P0001'; end if;
 insert into public.mcode_teams(name,created_by) values(trim(team_name),uid) returning id into created;
 insert into public.mcode_team_members(team_id,user_id,role) values(created,uid,'owner');
 return created;
end; $$;

create function public.mcode_create_invite(team uuid,invite_role text default 'member',valid_days int default 7,uses_allowed int default 1) returns text language plpgsql security definer set search_path='' as $$
declare my_role text:=public.mcode_team_role(team); code text:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
begin
 if my_role is null or my_role not in ('owner','admin') then raise exception 'Somente donos e administradores convidam.' using errcode='42501'; end if;
 if invite_role not in ('admin','member') or (invite_role='admin' and my_role<>'owner') then raise exception 'Papel de convite inválido.' using errcode='42501'; end if;
 if valid_days not between 1 and 30 or uses_allowed not between 1 and 100 then raise exception 'Validade ou usos inválidos.' using errcode='P0001'; end if;
 code:=left(code,32);
 insert into public.mcode_team_invites(team_id,code_hash,role,created_by,expires_at,max_uses)
 values(team,encode(sha256(convert_to(code,'UTF8')),'hex'),invite_role,auth.uid(),now()+make_interval(days=>valid_days),uses_allowed);
 return code;
end; $$;

create function public.mcode_accept_invite(invite_code text) returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); invite public.mcode_team_invites%rowtype;
begin
 if uid is null then raise exception 'Entre na sua conta.' using errcode='42501'; end if;
 select * into invite from public.mcode_team_invites i where i.code_hash=encode(sha256(convert_to(lower(trim(invite_code)),'UTF8')),'hex') for update;
 if not found or invite.revoked or invite.expires_at<now() or invite.uses>=invite.max_uses then raise exception 'Convite inválido ou expirado.' using errcode='P0001'; end if;
 if public.mcode_is_member(invite.team_id) then return invite.team_id; end if;
 insert into public.mcode_team_members(team_id,user_id,role) values(invite.team_id,uid,invite.role);
 update public.mcode_team_invites set uses=uses+1 where id=invite.id;
 return invite.team_id;
end; $$;

create function public.mcode_set_member_role(team uuid,member uuid,new_role text) returns void language plpgsql security definer set search_path='' as $$
begin
 if public.mcode_team_role(team) is distinct from 'owner' then raise exception 'Somente donos alteram papéis.' using errcode='42501'; end if;
 if new_role not in ('owner','admin','member') then raise exception 'Papel inválido.' using errcode='P0001'; end if;
 if new_role<>'owner' and (select role from public.mcode_team_members where team_id=team and user_id=member)='owner'
  and (select count(*) from public.mcode_team_members where team_id=team and role='owner')<=1 then raise exception 'A equipe precisa de ao menos um dono.' using errcode='P0001'; end if;
 update public.mcode_team_members set role=new_role where team_id=team and user_id=member;
 if not found then raise exception 'Membro não encontrado.' using errcode='P0001'; end if;
end; $$;

-- Remove outro membro (dono: qualquer um; administrador: só membros) ou a própria conta (sair da equipe).
create function public.mcode_remove_member(team uuid,member uuid) returns void language plpgsql security definer set search_path='' as $$
declare my_role text:=public.mcode_team_role(team); target text;
begin
 select role into target from public.mcode_team_members where team_id=team and user_id=member;
 if my_role is null or target is null then raise exception 'Membro não encontrado.' using errcode='42501'; end if;
 if member<>auth.uid() and not (my_role='owner' or (my_role='admin' and target='member')) then raise exception 'Sem permissão para remover este membro.' using errcode='42501'; end if;
 if target='owner' and (select count(*) from public.mcode_team_members where team_id=team and role='owner')<=1 then raise exception 'Transfira a posse ou exclua a equipe antes de sair.' using errcode='P0001'; end if;
 delete from public.mcode_team_members where team_id=team and user_id=member;
end; $$;

-- Dados existentes: tudo que era compartilhado por todas as contas vai para uma equipe inicial,
-- com todas as contas atuais como membros (a mais antiga é dona; as demais, administradoras).
alter table public.mcode_clients add column team_id uuid references public.mcode_teams(id) on delete cascade;
alter table public.mcode_fixed_expenses add column team_id uuid references public.mcode_teams(id) on delete cascade;
alter table public.mcode_transactions add column team_id uuid references public.mcode_teams(id) on delete cascade;
alter table public.mcode_todos add column team_id uuid references public.mcode_teams(id) on delete cascade;
do $$
declare legacy uuid; first_user uuid;
begin
 if exists(select 1 from public.mcode_clients) or exists(select 1 from public.mcode_fixed_expenses) or exists(select 1 from public.mcode_transactions) or exists(select 1 from public.mcode_todos) then
  select id into first_user from auth.users order by created_at limit 1;
  insert into public.mcode_teams(name,created_by) values('Equipe inicial',first_user) returning id into legacy;
  insert into public.mcode_team_members(team_id,user_id,role) select legacy,u.id,case when u.id=first_user then 'owner' else 'admin' end from auth.users u;
  update public.mcode_clients set team_id=legacy;
  update public.mcode_fixed_expenses set team_id=legacy;
  update public.mcode_transactions set team_id=legacy;
  update public.mcode_todos set team_id=legacy;
 end if;
end $$;
alter table public.mcode_clients alter column team_id set not null;
alter table public.mcode_fixed_expenses alter column team_id set not null;
alter table public.mcode_transactions alter column team_id set not null;
alter table public.mcode_todos alter column team_id set not null;

-- Códigos de cliente são únicos por equipe, e lançamentos só referenciam clientes da mesma equipe.
alter table public.mcode_transactions drop constraint if exists mcode_transactions_client_code_fkey;
alter table public.mcode_clients drop constraint if exists mcode_clients_code_key;
alter table public.mcode_clients drop constraint if exists mcode_clients_owner_id_code_key;
alter table public.mcode_clients add constraint mcode_clients_team_code_key unique(team_id,code);
alter table public.mcode_transactions add constraint mcode_transactions_team_client_fkey foreign key(team_id,client_code) references public.mcode_clients(team_id,code);
create index mcode_clients_team on public.mcode_clients(team_id,created_at);
create index mcode_fixed_team on public.mcode_fixed_expenses(team_id,created_at);
create index mcode_transactions_team on public.mcode_transactions(team_id,created_at);
create index mcode_todos_team on public.mcode_todos(team_id,created_at desc);

drop policy if exists clients_shared_read on public.mcode_clients;
drop policy if exists clients_shared_insert on public.mcode_clients;
drop policy if exists clients_shared_update on public.mcode_clients;
drop policy if exists clients_shared_delete on public.mcode_clients;
drop policy if exists fixed_shared_read on public.mcode_fixed_expenses;
drop policy if exists fixed_shared_insert on public.mcode_fixed_expenses;
drop policy if exists fixed_shared_update on public.mcode_fixed_expenses;
drop policy if exists fixed_shared_delete on public.mcode_fixed_expenses;
drop policy if exists transactions_shared_read on public.mcode_transactions;
drop policy if exists transactions_shared_insert on public.mcode_transactions;
drop policy if exists transactions_shared_update on public.mcode_transactions;
drop policy if exists transactions_shared_delete on public.mcode_transactions;
drop policy if exists todos_shared_read on public.mcode_todos;
drop policy if exists todos_shared_insert on public.mcode_todos;
drop policy if exists todos_shared_update on public.mcode_todos;
drop policy if exists todos_shared_delete on public.mcode_todos;

create policy clients_team_read on public.mcode_clients for select to authenticated using(public.mcode_is_member(team_id));
create policy clients_team_insert on public.mcode_clients for insert to authenticated with check(owner_id=(select auth.uid()) and public.mcode_is_member(team_id));
create policy clients_team_update on public.mcode_clients for update to authenticated using(public.mcode_is_member(team_id)) with check(public.mcode_is_member(team_id));
create policy clients_team_delete on public.mcode_clients for delete to authenticated using(public.mcode_is_member(team_id));
create policy fixed_team_read on public.mcode_fixed_expenses for select to authenticated using(public.mcode_is_member(team_id));
create policy fixed_team_insert on public.mcode_fixed_expenses for insert to authenticated with check(owner_id=(select auth.uid()) and public.mcode_is_member(team_id));
create policy fixed_team_update on public.mcode_fixed_expenses for update to authenticated using(public.mcode_is_member(team_id)) with check(public.mcode_is_member(team_id));
create policy fixed_team_delete on public.mcode_fixed_expenses for delete to authenticated using(public.mcode_is_member(team_id));
create policy transactions_team_read on public.mcode_transactions for select to authenticated using(public.mcode_is_member(team_id));
create policy transactions_team_insert on public.mcode_transactions for insert to authenticated with check(owner_id=(select auth.uid()) and public.mcode_is_member(team_id));
create policy transactions_team_update on public.mcode_transactions for update to authenticated using(public.mcode_is_member(team_id)) with check(public.mcode_is_member(team_id));
create policy transactions_team_delete on public.mcode_transactions for delete to authenticated using(public.mcode_is_member(team_id));
create policy todos_team_read on public.mcode_todos for select to authenticated using(public.mcode_is_member(team_id));
create policy todos_team_insert on public.mcode_todos for insert to authenticated with check(created_by=(select auth.uid()) and public.mcode_is_member(team_id));
create policy todos_team_update on public.mcode_todos for update to authenticated using(public.mcode_is_member(team_id)) with check(public.mcode_is_member(team_id));
create policy todos_team_delete on public.mcode_todos for delete to authenticated using(public.mcode_is_member(team_id));

-- Membros da mesma equipe veem nome e usuário uns dos outros; fotos continuam privadas no Storage.
create policy profiles_team_select on public.mcode_profiles for select to authenticated using(public.mcode_shares_team(id));

alter table public.mcode_teams enable row level security;
alter table public.mcode_team_members enable row level security;
alter table public.mcode_team_invites enable row level security;
create policy teams_member_read on public.mcode_teams for select to authenticated using(public.mcode_is_member(id));
create policy teams_admin_update on public.mcode_teams for update to authenticated using(public.mcode_team_role(id) in ('owner','admin')) with check(public.mcode_team_role(id) in ('owner','admin'));
create policy teams_owner_delete on public.mcode_teams for delete to authenticated using(public.mcode_team_role(id)='owner');
create policy members_team_read on public.mcode_team_members for select to authenticated using(public.mcode_is_member(team_id));
create policy invites_admin_read on public.mcode_team_invites for select to authenticated using(public.mcode_team_role(team_id) in ('owner','admin'));
create policy invites_admin_update on public.mcode_team_invites for update to authenticated using(public.mcode_team_role(team_id) in ('owner','admin')) with check(public.mcode_team_role(team_id) in ('owner','admin'));

revoke all on public.mcode_teams,public.mcode_team_members,public.mcode_team_invites from anon,authenticated;
grant select,delete on public.mcode_teams to authenticated;
grant update(name) on public.mcode_teams to authenticated;
grant select on public.mcode_team_members to authenticated;
grant select(id,team_id,role,created_by,expires_at,max_uses,uses,revoked,created_at) on public.mcode_team_invites to authenticated;
grant update(revoked) on public.mcode_team_invites to authenticated;

revoke all on function public.mcode_team_role(uuid),public.mcode_is_member(uuid),public.mcode_shares_team(uuid),public.mcode_create_team(text),
 public.mcode_create_invite(uuid,text,int,int),public.mcode_accept_invite(text),public.mcode_set_member_role(uuid,uuid,text),public.mcode_remove_member(uuid,uuid) from public,anon;
grant execute on function public.mcode_team_role(uuid),public.mcode_is_member(uuid),public.mcode_shares_team(uuid),public.mcode_create_team(text),
 public.mcode_create_invite(uuid,text,int,int),public.mcode_accept_invite(text),public.mcode_set_member_role(uuid,uuid,text),public.mcode_remove_member(uuid,uuid) to authenticated;
