-- Run this once in Supabase SQL Editor to ensure published announcements
-- can be read by public visitors while drafts remain administrator-only.
alter table public.announcements enable row level security;
alter table public.villages enable row level security;

grant select on public.villages to anon, authenticated;
grant select on public.announcements to anon, authenticated;
grant insert, update, delete on public.announcements to authenticated;

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
