revoke all on function public.mcode_new_user() from public,anon,authenticated;
revoke all on function public.mcode_touch() from public,anon,authenticated;
revoke all on function public.rls_auto_enable() from public,anon,authenticated;
create index mcode_transactions_client on public.mcode_transactions(owner_id,client_code);
