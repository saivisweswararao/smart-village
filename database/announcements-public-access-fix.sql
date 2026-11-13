-- Fresh single-language Penubaka announcements with optional photos.
-- IMPORTANT: This intentionally deletes ALL existing Penubaka announcement rows
-- (draft, published and archived) so you can start with a clean announcement list.
-- Run once in Supabase Dashboard > SQL Editor.

delete from public.announcements
where village_id in (select id from public.villages where slug = 'penubaka');

alter table public.announcements
  alter column title_te drop not null,
  add column if not exists photo_url text;

-- Public image bucket for announcement photos (uploads remain admin-only).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('announcement-photos', 'announcement-photos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "Public can view announcement photos" on storage.objects;
create policy "Public can view announcement photos"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'announcement-photos');

drop policy if exists "Admins upload announcement photos" on storage.objects;
create policy "Admins upload announcement photos"
on storage.objects for insert
to authenticated
with check (bucket_id = 'announcement-photos' and (select private.is_admin()));

drop policy if exists "Admins update announcement photos" on storage.objects;
create policy "Admins update announcement photos"
on storage.objects for update
to authenticated
using (bucket_id = 'announcement-photos' and (select private.is_admin()))
with check (bucket_id = 'announcement-photos' and (select private.is_admin()));

drop policy if exists "Admins delete announcement photos" on storage.objects;
create policy "Admins delete announcement photos"
on storage.objects for delete
to authenticated
using (bucket_id = 'announcement-photos' and (select private.is_admin()));

-- Public feed: only published posts for the active village are returned.
create or replace function public.get_public_announcements(p_village_slug text)
returns table (
  id uuid,
  title_en text,
  body_en text,
  photo_url text,
  published_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.title_en, a.body_en, a.photo_url, a.published_at, a.created_at
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
