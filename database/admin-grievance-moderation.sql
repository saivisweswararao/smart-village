-- Admin moderation permissions for public Penubaka grievances.
-- Run after database/public-grievances.sql in the same Supabase project.
alter table public.public_grievances
  add column if not exists status text not null default 'Submitted';
alter table public.public_grievances
  drop constraint if exists public_grievances_status_check;
alter table public.public_grievances
  add constraint public_grievances_status_check
  check (status in ('Submitted','Under Review','In Progress','Resolved'));

-- Public users can read and submit only. Only authenticated admins may update status or delete.
revoke update, delete on public.public_grievances from public, anon, authenticated;
grant select, insert on public.public_grievances to anon, authenticated;
grant update(status), delete on public.public_grievances to authenticated;

drop policy if exists "Admins update grievance status" on public.public_grievances;
create policy "Admins update grievance status"
  on public.public_grievances for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

drop policy if exists "Admins delete grievances" on public.public_grievances;
create policy "Admins delete grievances"
  on public.public_grievances for delete to authenticated
  using ((select private.is_admin()));

drop policy if exists "Admins delete grievance photos" on storage.objects;
create policy "Admins delete grievance photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id='penubaka-grievance-photos'
    and (select private.is_admin())
  );
