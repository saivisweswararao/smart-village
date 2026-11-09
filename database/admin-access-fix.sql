-- Admin access verification fix for Penubaka Smart Village.
-- Run this once in the SQL Editor of the SAME Supabase project used by js/config.js.
-- This checks the currently authenticated user's UID without requiring a direct table read.

create or replace function public.admin_check_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin();
$$;

revoke all on function public.admin_check_access() from public, anon;
grant execute on function public.admin_check_access() to authenticated;
