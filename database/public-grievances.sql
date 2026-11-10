-- Public Penubaka grievance board with admin approval before publication.
-- Complaint text and photos become public only after an administrator publishes the complaint.
create table if not exists public.public_grievances (
 id uuid primary key default gen_random_uuid(),
 village_slug text not null default 'penubaka' check (village_slug='penubaka'),
 name text check (name is null or char_length(name)<=80),
 description text not null check (char_length(trim(description)) between 5 and 3000),
 photo_url text,
 status text not null default 'Pending Review' check (status in ('Pending Review','Published','Under Review','In Progress','Resolved','Rejected')),
 created_at timestamptz not null default now()
);
create index if not exists public_grievances_village_created_idx on public.public_grievances(village_slug,created_at desc);
alter table public.public_grievances enable row level security;
revoke all on public.public_grievances from public,anon,authenticated;
grant select on public.public_grievances to anon,authenticated;
grant insert(village_slug,name,description,photo_url) on public.public_grievances to anon,authenticated;
drop policy if exists "Anyone can view public grievances" on public.public_grievances;
drop policy if exists "Public can view published grievances" on public.public_grievances;
create policy "Public can view published grievances" on public.public_grievances for select to anon,authenticated using (status='Published');
drop policy if exists "Admins can view all grievances" on public.public_grievances;
create policy "Admins can view all grievances" on public.public_grievances for select to authenticated using ((select private.is_admin()));
drop policy if exists "Anyone can submit public grievances" on public.public_grievances;
create policy "Anyone can submit public grievances" on public.public_grievances for insert to anon,authenticated with check (
 village_slug='penubaka' and status='Pending Review' and char_length(trim(description)) between 5 and 3000
 and (name is null or char_length(name)<=80)
 and (photo_url is null or photo_url like 'https://sxyfaujflhzzheaeaspw.supabase.co/storage/v1/object/public/penubaka-grievance-photos/%')
);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('penubaka-grievance-photos','penubaka-grievance-photos',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
drop policy if exists "Anyone can upload grievance photos" on storage.objects;
create policy "Anyone can upload grievance photos" on storage.objects for insert to anon,authenticated with check (
 bucket_id='penubaka-grievance-photos' and (storage.foldername(name))[1]='penubaka'
 and lower(storage.extension(name)) in ('jpg','jpeg','png','webp')
);
