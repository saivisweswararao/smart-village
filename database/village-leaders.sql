-- Public village leaders directory. Run once in Supabase SQL Editor.
create table if not exists public.village_leaders (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 100),
  designation text not null check (char_length(trim(designation)) between 2 and 120),
  photo_url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.village_leaders enable row level security;
revoke all on public.village_leaders from public, anon, authenticated;
grant select on public.village_leaders to anon, authenticated;
grant insert(name, designation, photo_url), update(name, designation, photo_url), delete on public.village_leaders to authenticated;

drop policy if exists "Public can view village leaders" on public.village_leaders;
create policy "Public can view village leaders" on public.village_leaders
  for select to anon, authenticated using (true);
drop policy if exists "Admins manage village leaders" on public.village_leaders;
create policy "Admins manage village leaders" on public.village_leaders
  for all to authenticated using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- Public read access is intentional for leader portraits; only admins can upload/change/delete.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('penubaka-leader-photos', 'penubaka-leader-photos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=true, file_size_limit=5242880,
  allowed_mime_types=array['image/jpeg','image/png','image/webp'];

drop policy if exists "Admins upload leader photos" on storage.objects;
create policy "Admins upload leader photos" on storage.objects
  for insert to authenticated with check (bucket_id='penubaka-leader-photos' and (select private.is_admin()));
drop policy if exists "Admins update leader photos" on storage.objects;
create policy "Admins update leader photos" on storage.objects
  for update to authenticated using (bucket_id='penubaka-leader-photos' and (select private.is_admin()))
  with check (bucket_id='penubaka-leader-photos' and (select private.is_admin()));
drop policy if exists "Admins delete leader photos" on storage.objects;
create policy "Admins delete leader photos" on storage.objects
  for delete to authenticated using (bucket_id='penubaka-leader-photos' and (select private.is_admin()));
