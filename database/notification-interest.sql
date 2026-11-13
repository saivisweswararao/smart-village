-- Notification-interest tracker for Penubaka Smart Village.
-- Run this file once in Supabase Dashboard -> SQL Editor.

create table if not exists public.notification_interests (
  village_id uuid not null references public.villages(id) on delete cascade,
  visitor_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (village_id, visitor_id)
);

create index if not exists notification_interests_village_idx
  on public.notification_interests(village_id, created_at desc);

alter table public.notification_interests enable row level security;
revoke all on public.notification_interests from public, anon, authenticated;

-- Public visitors can register one anonymous browser-profile interest per village.
-- The random browser ID is stored in first-party localStorage; no name, phone, email,
-- IP address or browser fingerprint is collected by this feature.
create or replace function public.register_notification_interest(
  p_village_slug text,
  p_visitor_id uuid
) returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_village_id uuid;
  v_total bigint;
begin
  if p_village_slug is null or length(p_village_slug) > 80 or p_visitor_id is null then
    raise exception 'Invalid request';
  end if;

  select id into v_village_id
  from public.villages
  where slug = p_village_slug and is_active = true;

  if v_village_id is null then
    raise exception 'Village not found';
  end if;

  insert into public.notification_interests(village_id, visitor_id)
  values (v_village_id, p_visitor_id)
  on conflict (village_id, visitor_id) do nothing;

  select count(*) into v_total
  from public.notification_interests
  where village_id = v_village_id;

  return v_total;
end;
$$;

-- Only an authenticated administrator can view the aggregate count.
create or replace function public.admin_get_notification_interest_count(
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
  from public.notification_interests
  where village_id = v_village_id;

  return v_total;
end;
$$;

revoke all on function public.register_notification_interest(text, uuid) from public;
revoke all on function public.admin_get_notification_interest_count(text) from public;
grant execute on function public.register_notification_interest(text, uuid) to anon, authenticated;
grant execute on function public.admin_get_notification_interest_count(text) to authenticated;
