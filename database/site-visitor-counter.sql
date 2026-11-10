-- Penubaka Smart Village visitor counter
-- Run this once in Supabase SQL Editor.

create table if not exists public.site_visitor_stats (
  id integer primary key check (id = 1),
  total_visitors bigint not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.site_visitor_stats (id, total_visitors)
values (1, 0)
on conflict (id) do nothing;

alter table public.site_visitor_stats enable row level security;
revoke all on table public.site_visitor_stats from public, anon, authenticated;

create or replace function public.increment_site_visitors()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare current_total bigint;
begin
  update public.site_visitor_stats
  set total_visitors = total_visitors + 1,
      updated_at = now()
  where id = 1
  returning total_visitors into current_total;
  return current_total;
end;
$$;

create or replace function public.get_site_visitor_count()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select total_visitors from public.site_visitor_stats where id = 1;
$$;

revoke all on function public.increment_site_visitors() from public;
revoke all on function public.get_site_visitor_count() from public;
grant execute on function public.increment_site_visitors() to anon, authenticated;
grant execute on function public.get_site_visitor_count() to anon, authenticated;
