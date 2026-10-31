create function public.mcode_valid_stack(values_ text[]) returns boolean language sql immutable set search_path='' as $$
 select coalesce(array_length(values_,1),0)<=20 and not exists(select 1 from unnest(values_) v where char_length(trim(v)) not between 1 and 30 or v is null);
$$;
create table public.mcode_profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 username text unique check(username ~ '^[a-z0-9_]{3,24}$'),
 display_name text not null default '' check(char_length(display_name)<=80),
 stack text[] not null default '{}' check(public.mcode_valid_stack(stack)),
 avatar_path text check(avatar_path is null or (avatar_path like id::text||'/%' and avatar_path not like '%..%')),
 updated_at timestamptz not null default now()
);
create function public.mcode_touch() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=clock_timestamp(); return new; end; $$;
create trigger mcode_profiles_touch before update on public.mcode_profiles for each row execute function public.mcode_touch();
create function public.mcode_new_user() returns trigger language plpgsql security definer set search_path='' as $$ begin insert into public.mcode_profiles(id) values(new.id) on conflict do nothing; return new; end; $$;
create trigger mcode_auth_signup after insert on auth.users for each row execute function public.mcode_new_user();
insert into public.mcode_profiles(id) select id from auth.users on conflict do nothing;
create table public.mcode_clients (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 code text not null check(char_length(code) between 1 and 60 and code=lower(code)), name text not null check(char_length(name) between 1 and 500),
 contact text not null default '' check(char_length(contact)<=500), email text not null default '' check(char_length(email)<=500), phone text not null default '' check(char_length(phone)<=500),service text not null default '' check(char_length(service)<=500),
 contract numeric(16,2) check(contract>0), created_at timestamptz not null default now(), unique(owner_id,code)
);
create table public.mcode_fixed_expenses (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 description text not null check(char_length(description) between 1 and 500),category text not null default '' check(char_length(category)<=500),supplier text not null default '' check(char_length(supplier)<=500),
 amount numeric(16,2) not null check(amount>0),period text not null check(period in ('Mensal','Trimestral','Semestral','Anual')),due_day int not null check(due_day between 1 and 31),active boolean not null default true,created_at timestamptz not null default now()
);
create table public.mcode_transactions (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 type text not null check(type in ('Entrada','Saída')),group_name text not null check(group_name in ('Receita cliente','Outra entrada','Aporte','Gasto fixo','Despesa variável','Impostos','Investimento','Retirada')),
 category text not null default '' check(char_length(category)<=500),description text not null check(char_length(description) between 1 and 500),client_code text,
 due_on date,paid_on date,amount numeric(16,2) not null check(amount>0),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(owner_id,client_code) references public.mcode_clients(owner_id,code),check(group_name<>'Receita cliente' or (client_code is not null and type='Entrada'))
);
create trigger mcode_transactions_touch before update on public.mcode_transactions for each row execute function public.mcode_touch();
create index mcode_transactions_owner on public.mcode_transactions(owner_id,created_at);
create index mcode_fixed_owner on public.mcode_fixed_expenses(owner_id,created_at);
alter table public.mcode_profiles enable row level security;
alter table public.mcode_clients enable row level security;
alter table public.mcode_fixed_expenses enable row level security;
alter table public.mcode_transactions enable row level security;
create policy profiles_select on public.mcode_profiles for select to authenticated using(id=(select auth.uid()));
create policy profiles_insert on public.mcode_profiles for insert to authenticated with check(id=(select auth.uid()));
create policy profiles_update on public.mcode_profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
create policy clients_owner on public.mcode_clients for all to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy fixed_owner on public.mcode_fixed_expenses for all to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy transactions_owner on public.mcode_transactions for all to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
revoke all on public.mcode_profiles,public.mcode_clients,public.mcode_fixed_expenses,public.mcode_transactions from anon;
grant select,insert,update on public.mcode_profiles to authenticated;
grant select,insert,update,delete on public.mcode_clients,public.mcode_fixed_expenses,public.mcode_transactions to authenticated;
revoke all on function public.mcode_new_user() from public;
revoke all on function public.mcode_touch() from public;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('avatars','avatars',false,3145728,array['image/png']) on conflict(id) do nothing;
create policy avatar_select on storage.objects for select to authenticated using(bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy avatar_insert on storage.objects for insert to authenticated with check(bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy avatar_update on storage.objects for update to authenticated using(bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text) with check(bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy avatar_delete on storage.objects for delete to authenticated using(bucket_id='avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);
