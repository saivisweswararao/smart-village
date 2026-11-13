-- Public announcement feed fix for Penubaka.
-- Run this entire script once in Supabase Dashboard > SQL Editor.
-- The RPC is read-only and returns only published rows for an active village.

create or replace function public.get_public_announcements(p_village_slug text)
returns table (
  id uuid,
  title_en text,
  title_te text,
  body_en text,
  body_te text,
  published_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.title_en, a.title_te, a.body_en, a.body_te,
         a.published_at, a.created_at
  from public.announcements as a
  inner join public.villages as v on v.id = a.village_id
  where v.slug = p_village_slug
    and v.is_active = true
    and a.status = 'published'
  order by coalesce(a.published_at, a.created_at) desc
  limit 100;
$$;

revoke all on function public.get_public_announcements(text) from public;
grant execute on function public.get_public_announcements(text) to anon, authenticated;

-- Keep direct public table reads limited to active villages and published announcements.
alter table public.villages enable row level security;
alter table public.announcements enable row level security;
grant select on public.villages, public.announcements to anon, authenticated;

drop policy if exists "Active villages public" on public.villages;
create policy "Active villages public"
on public.villages for select
to anon, authenticated
using (is_active = true);

drop policy if exists "Published announcements public" on public.announcements;
create policy "Published announcements public"
on public.announcements for select
to anon, authenticated
using (status = 'published' or (select private.is_admin()));

drop policy if exists "Admins manage announcements" on public.announcements;
create policy "Admins manage announcements"
on public.announcements for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));
