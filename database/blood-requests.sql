-- Penubaka public blood request history and private admin alerts.
-- Public users can submit requests and read only masked mobile numbers.
-- Full requester mobile numbers are available to the private push alert only.

create table if not exists public.blood_requests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(trim(full_name)) between 2 and 100),
  mobile_number text not null check (mobile_number ~ '^[6-9][0-9]{9}$'),
  blood_group text not null check (blood_group in ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  consent_public boolean not null default false check (consent_public = true),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  status text not null default 'Open' check (status in ('Open','Closed'))
);

-- Safe migration for databases created before the admin management screen.
alter table public.blood_requests add column if not exists status text not null default 'Open';
alter table public.blood_requests drop constraint if exists blood_requests_status_check;
alter table public.blood_requests add constraint blood_requests_status_check check (status in ('Open','Closed'));

grant select, update, delete on public.blood_requests to authenticated;
drop policy if exists "Admins can view blood requests" on public.blood_requests;
drop policy if exists "Admins can update blood requests" on public.blood_requests;
drop policy if exists "Admins can delete blood requests" on public.blood_requests;
create policy "Admins can view blood requests" on public.blood_requests for select to authenticated using ((select private.is_admin()));
create policy "Admins can update blood requests" on public.blood_requests for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "Admins can delete blood requests" on public.blood_requests for delete to authenticated using ((select private.is_admin()));

create index if not exists blood_requests_created_idx
  on public.blood_requests (created_at desc);

alter table public.blood_requests enable row level security;
revoke all on public.blood_requests from anon, authenticated;

create table if not exists public.blood_request_push_delivery_log (
  blood_request_id uuid primary key references public.blood_requests(id) on delete cascade,
  delivered_at timestamptz not null default now()
);
alter table public.blood_request_push_delivery_log enable row level security;
revoke all on public.blood_request_push_delivery_log from anon, authenticated;

create or replace function public.submit_blood_request(
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
    raise exception 'Please consent to displaying your name, blood group and last four mobile digits in public request history.';
  end if;

  insert into public.blood_requests(full_name,mobile_number,blood_group,consent_public)
  values (trim(p_full_name),p_mobile_number,p_blood_group,true)
  returning id into v_id;

  return jsonb_build_object('success',true,'id',v_id);
end;
$$;

create or replace function public.list_public_blood_requests()
returns table(
  id uuid,
  full_name text,
  mobile_last4 text,
  blood_group text,
  requested_on timestamptz,
  request_status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.full_name, right(r.mobile_number,4), r.blood_group,
         r.created_at,
         case when r.status = 'Closed' then 'Closed' when now() < r.expires_at then 'Open' else 'Expired' end
  from public.blood_requests r
  where r.consent_public = true
  order by r.created_at desc;
$$;

revoke all on function public.submit_blood_request(text,text,text,boolean) from public, anon, authenticated;
revoke all on function public.list_public_blood_requests() from public, anon, authenticated;
grant execute on function public.submit_blood_request(text,text,text,boolean) to anon, authenticated;
grant execute on function public.list_public_blood_requests() to anon, authenticated;
