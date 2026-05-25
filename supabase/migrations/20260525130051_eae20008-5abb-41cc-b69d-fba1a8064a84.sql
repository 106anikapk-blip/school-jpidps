
alter function public.update_updated_at_column() set search_path = public;
alter function public.next_receipt_no() set search_path = public;

revoke execute on function public.has_role(uuid, public.app_role) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.next_receipt_no() from public, anon, authenticated;
revoke execute on function public.update_updated_at_column() from public, anon, authenticated;
