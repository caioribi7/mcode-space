alter table public.mcode_transactions drop constraint mcode_transactions_owner_id_client_code_fkey;
alter table public.mcode_clients add constraint mcode_clients_code_key unique(code);
alter table public.mcode_transactions add constraint mcode_transactions_client_code_fkey foreign key(client_code) references public.mcode_clients(code);
-- owner_id records the creator; shared records survive account removal.
alter table public.mcode_clients alter column owner_id drop not null, drop constraint mcode_clients_owner_id_fkey, add constraint mcode_clients_owner_id_fkey foreign key(owner_id) references auth.users(id) on delete set null;
alter table public.mcode_fixed_expenses alter column owner_id drop not null, drop constraint mcode_fixed_expenses_owner_id_fkey, add constraint mcode_fixed_expenses_owner_id_fkey foreign key(owner_id) references auth.users(id) on delete set null;
alter table public.mcode_transactions alter column owner_id drop not null, drop constraint mcode_transactions_owner_id_fkey, add constraint mcode_transactions_owner_id_fkey foreign key(owner_id) references auth.users(id) on delete set null;
drop policy clients_owner on public.mcode_clients;
drop policy fixed_owner on public.mcode_fixed_expenses;
drop policy transactions_owner on public.mcode_transactions;
create policy clients_shared_read on public.mcode_clients for select to authenticated using(true);
create policy clients_shared_insert on public.mcode_clients for insert to authenticated with check(owner_id=(select auth.uid()));
create policy clients_shared_update on public.mcode_clients for update to authenticated using(true) with check(true);
create policy clients_shared_delete on public.mcode_clients for delete to authenticated using(true);
create policy fixed_shared_read on public.mcode_fixed_expenses for select to authenticated using(true);
create policy fixed_shared_insert on public.mcode_fixed_expenses for insert to authenticated with check(owner_id=(select auth.uid()));
create policy fixed_shared_update on public.mcode_fixed_expenses for update to authenticated using(true) with check(true);
create policy fixed_shared_delete on public.mcode_fixed_expenses for delete to authenticated using(true);
create policy transactions_shared_read on public.mcode_transactions for select to authenticated using(true);
create policy transactions_shared_insert on public.mcode_transactions for insert to authenticated with check(owner_id=(select auth.uid()));
create policy transactions_shared_update on public.mcode_transactions for update to authenticated using(true) with check(true);
create policy transactions_shared_delete on public.mcode_transactions for delete to authenticated using(true);
revoke update on public.mcode_clients,public.mcode_fixed_expenses,public.mcode_transactions from authenticated;
grant update(name,contact,email,phone,service,contract) on public.mcode_clients to authenticated;
grant update(description,category,supplier,amount,period,due_day,active) on public.mcode_fixed_expenses to authenticated;
grant update(paid_on) on public.mcode_transactions to authenticated;
create table public.mcode_todos (
 id uuid primary key default gen_random_uuid(),
 created_by uuid default auth.uid() references auth.users(id) on delete set null,
 title text not null check(char_length(trim(title)) between 1 and 160),
 notes text not null default '' check(char_length(notes)<=2000),
 priority text not null default 'normal' check(priority in ('low','normal','high')),
 due_on date,done boolean not null default false,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create trigger mcode_todos_touch before update on public.mcode_todos for each row execute function public.mcode_touch();
alter table public.mcode_todos enable row level security;
create policy todos_shared_read on public.mcode_todos for select to authenticated using(true);
create policy todos_shared_insert on public.mcode_todos for insert to authenticated with check(created_by=(select auth.uid()));
create policy todos_shared_update on public.mcode_todos for update to authenticated using(true) with check(true);
create policy todos_shared_delete on public.mcode_todos for delete to authenticated using(true);
revoke all on public.mcode_todos from anon,authenticated;
grant select,insert,delete on public.mcode_todos to authenticated;
grant update(title,notes,priority,due_on,done) on public.mcode_todos to authenticated;
create index mcode_todos_created on public.mcode_todos(created_at desc,id);
create index mcode_todos_author on public.mcode_todos(created_by);
create index mcode_transactions_shared_client on public.mcode_transactions(client_code);
