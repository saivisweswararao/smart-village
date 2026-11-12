-- Penubaka Smart Village: privacy-preserving unique browser visitor count.
-- Run this once in Supabase Dashboard > SQL Editor.
-- A visitor is counted once per browser profile (localStorage ID), not once per person.

create table if not exists public.site_unique_visitors (
  visitor_id uuid primary key,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

alter table public.site_unique_visitors enable row level security;
revoke all on table public.site_unique_visitors from public, anon, authenticated;

create or replace function public.register_site_unique_visitor(p_visitor_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_visitor_id is null then
    raise exception 'Visitor ID is required' using errcode = '22004';
  end if;

  insert into public.site_unique_visitors (visitor_id)
  values (p_visitor_id)
  on conflict (visitor_id)
  do update set last_seen_at = now();
end;
$$;

revoke all on function public.register_site_unique_visitor(uuid) from public;
grant execute on function public.register_site_unique_visitor(uuid) to anon, authenticated;

create or replace function public.admin_get_unique_visitor_count()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.admin_check_access(), false) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  return (select count(*) from public.site_unique_visitors);
end;
$$;

revoke all on function public.admin_get_unique_visitor_count() from public, anon;
grant execute on function public.admin_get_unique_visitor_count() to authenticated;
