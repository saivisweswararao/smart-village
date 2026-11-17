-- Penubaka blood donor directory
-- Public users can submit and read only masked details through RPC functions.
-- Full mobile numbers are visible only to authenticated admins.

create table if not exists public.blood_donors (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(trim(full_name)) between 2 and 100),
  mobile_number text not null check (mobile_number ~ '^[6-9][0-9]{9}$'),
  blood_group text not null check (blood_group in ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  consent_public boolean not null default false check (consent_public = true),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists blood_donors_group_name_idx
  on public.blood_donors (blood_group, full_name);

alter table public.blood_donors enable row level security;
revoke all on public.blood_donors from anon, authenticated;
grant select, update, delete on public.blood_donors to authenticated;

drop policy if exists "Admins can view blood donor full details" on public.blood_donors;
drop policy if exists "Admins can update blood donor details" on public.blood_donors;
drop policy if exists "Admins can delete blood donor details" on public.blood_donors;

create policy "Admins can view blood donor full details"
on public.blood_donors for select to authenticated
using ((select private.is_admin()));

create policy "Admins can update blood donor details"
on public.blood_donors for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy "Admins can delete blood donor details"
on public.blood_donors for delete to authenticated
using ((select private.is_admin()));

create or replace function public.submit_blood_donor(
  p_full_name text,
  p_mobile_number text,
  p_blood_group text,
  p_consent_public boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if p_full_name is null or char_length(trim(p_full_name)) < 2 or char_length(trim(p_full_name)) > 100 then
    raise exception 'Please enter a valid name (2 to 100 characters).';
  end if;
  if p_mobile_number is null or p_mobile_number !~ '^[6-9][0-9]{9}$' then
    raise exception 'Enter a valid 10-digit Indian mobile number.';
  end if;
  if p_blood_group not in ('A+','A-','B+','B-','AB+','AB-','O+','O-') then
    raise exception 'Select a valid blood group.';
  end if;
  if p_consent_public is distinct from true then
    raise exception 'Public display consent is required.';
  end if;

  insert into public.blood_donors(full_name,mobile_number,blood_group,consent_public)
  values (trim(p_full_name),p_mobile_number,p_blood_group,true)
  returning id into v_id;

  return jsonb_build_object('success',true,'id',v_id);
end;
$$;

create or replace function public.list_public_blood_donors(p_blood_group text default null)
returns table(full_name text,blood_group text,mobile_last4 text,created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select d.full_name, d.blood_group, right(d.mobile_number,4), d.created_at
  from public.blood_donors d
  where d.consent_public = true
    and (p_blood_group is null or p_blood_group = '' or d.blood_group = p_blood_group)
  order by d.full_name asc;
$$;

revoke all on function public.submit_blood_donor(text,text,text,boolean) from public, anon, authenticated;
revoke all on function public.list_public_blood_donors(text) from public, anon, authenticated;
grant execute on function public.submit_blood_donor(text,text,text,boolean) to anon, authenticated;
grant execute on function public.list_public_blood_donors(text) to anon, authenticated;
