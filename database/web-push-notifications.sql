-- Run once in Supabase SQL Editor after database/notification-interest.sql.
-- Subscription endpoints and keys are private and must never be exposed to anon users.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  village_id uuid not null references public.villages(id) on delete cascade,
  visitor_id uuid not null,
  endpoint text not null unique,
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_success_at timestamptz
);

create index if not exists push_subscriptions_village_idx
  on public.push_subscriptions(village_id);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from public, anon, authenticated;

create or replace function public.admin_get_push_subscriber_count(
  p_village_slug text default 'penubaka'
) returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_village_id uuid;
  v_total bigint;
begin
  if not (select private.is_admin()) then
    raise exception 'Not authorized';
  end if;

  select id into v_village_id
  from public.villages
  where slug = p_village_slug;

  if v_village_id is null then
    raise exception 'Village not found';
  end if;

  select count(*) into v_total
  from public.push_subscriptions
  where village_id = v_village_id;

  return v_total;
end;
$$;

revoke all on function public.admin_get_push_subscriber_count(text) from public;
grant execute on function public.admin_get_push_subscriber_count(text) to authenticated;
