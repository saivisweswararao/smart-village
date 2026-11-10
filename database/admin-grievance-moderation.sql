-- Admin approval and moderation for Penubaka public grievances.
-- Run after database/public-grievances.sql. Existing complaints are moved to Pending Review
-- so none are exposed publicly without an explicit admin approval.
alter table public.public_grievances
  add column if not exists status text not null default 'Pending Review';
alter table public.public_grievances drop constraint if exists public_grievances_status_check;
alter table public.public_grievances alter column status set default 'Pending Review';
update public.public_grievances set status='Pending Review';
alter table public.public_grievances add constraint public_grievances_status_check
  check (status in ('Pending Review','Published','Under Review','In Progress','Resolved','Rejected'));

-- Do not allow anonymous submitters to set status or publish their own complaint.
revoke all on public.public_grievances from public,anon,authenticated;
grant select on public.public_grievances to anon,authenticated;
grant insert(village_slug,name,description,photo_url) on public.public_grievances to anon,authenticated;
grant update(status),delete on public.public_grievances to authenticated;

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
drop policy if exists "Admins update grievance status" on public.public_grievances;
create policy "Admins update grievance status" on public.public_grievances for update to authenticated
 using ((select private.is_admin())) with check ((select private.is_admin()));
drop policy if exists "Admins delete grievances" on public.public_grievances;
create policy "Admins delete grievances" on public.public_grievances for delete to authenticated
 using ((select private.is_admin()));

drop policy if exists "Admins delete grievance photos" on storage.objects;
create policy "Admins delete grievance photos" on storage.objects for delete to authenticated
 using (bucket_id='penubaka-grievance-photos' and (select private.is_admin()));
