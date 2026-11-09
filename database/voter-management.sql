-- Private Penubaka voter-management migration.
-- Run once in Supabase SQL Editor. No voter records or photographs are stored in this public GitHub repository.

create schema if not exists private;

create table if not exists private.voters (
  id uuid primary key default gen_random_uuid(),
  village_slug text not null default 'penubaka',
  ward_no integer not null check (ward_no between 1 and 12),
  serial_no integer not null check (serial_no > 0),
  voter_name text not null,
  guardian_name text,
  relationship text,
  age integer check (age between 18 and 120),
  gender text check (gender in ('male','female','other','unknown')),
  house_no text,
  voter_id text,
  photo_path text,
  source_page integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (village_slug, ward_no, serial_no)
);

create index if not exists private_voters_ward_serial_idx
  on private.voters(village_slug, ward_no, serial_no);
create index if not exists private_voters_name_idx
  on private.voters using gin (to_tsvector('simple', voter_name));

alter table private.voters enable row level security;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
revoke all on private.voters from public, anon, authenticated;

-- Search deliberately excludes voter_id and photo_path from list results.
create or replace function public.admin_search_voters(
  p_query text default null,
  p_ward integer default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid, ward_no integer, serial_no integer, voter_name text,
  guardian_name text, relationship text, age integer, gender text, house_no text
)
language plpgsql security definer set search_path = ''
as $$
begin
  if not (select private.is_admin()) then raise exception 'Not authorized'; end if;
  if p_ward is not null and (p_ward < 1 or p_ward > 12) then raise exception 'Invalid ward'; end if;
  return query
    select v.id, v.ward_no, v.serial_no, v.voter_name, v.guardian_name,
           v.relationship, v.age, v.gender, v.house_no
    from private.voters v
    where v.village_slug = 'penubaka'
      and (p_ward is null or v.ward_no = p_ward)
      and (nullif(trim(p_query),'') is null
        or v.voter_name ilike '%' || trim(p_query) || '%'
        )
    order by v.ward_no, v.serial_no
    limit least(greatest(coalesce(p_limit,50),1),100)
    offset greatest(coalesce(p_offset,0),0);
end; $$;

create or replace function public.admin_voter_stats()
returns table(total_voters bigint, male_voters bigint, female_voters bigint, other_voters bigint, wards_count bigint)
language plpgsql security definer set search_path = ''
as $$
begin
  if not (select private.is_admin()) then raise exception 'Not authorized'; end if;
  return query
    select count(*)::bigint,
      count(*) filter (where gender='male')::bigint,
      count(*) filter (where gender='female')::bigint,
      count(*) filter (where gender='other')::bigint,
      count(distinct ward_no)::bigint
    from private.voters where village_slug='penubaka';
end; $$;

-- Import supports structured JSON metadata only. Do not put image base64 in JSON.
create or replace function public.admin_import_voters(p_rows jsonb)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare inserted_count integer;
begin
  if not (select private.is_admin()) then raise exception 'Not authorized'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 3000 then
    raise exception 'Expected a JSON array with at most 3000 voter records';
  end if;
  insert into private.voters (
    village_slug, ward_no, serial_no, voter_name, guardian_name, relationship,
    age, gender, house_no, voter_id, photo_path, source_page
  )
  select
    'penubaka',
    (r->>'ward_no')::integer,
    (r->>'serial_no')::integer,
    trim(r->>'voter_name'),
    nullif(trim(r->>'guardian_name'),''),
    nullif(trim(r->>'relationship'),''),
    nullif(r->>'age','')::integer,
    case lower(coalesce(r->>'gender','unknown'))
      when 'male' then 'male' when 'female' then 'female'
      when 'other' then 'other' else 'unknown' end,
    nullif(trim(r->>'house_no'),''),
    nullif(trim(r->>'voter_id'),''),
    nullif(trim(r->>'photo_path'),''),
    nullif(r->>'source_page','')::integer
  from jsonb_array_elements(p_rows) r
  where nullif(trim(r->>'voter_name'),'') is not null
  on conflict (village_slug, ward_no, serial_no) do update set
    voter_name=excluded.voter_name, guardian_name=excluded.guardian_name,
    relationship=excluded.relationship, age=excluded.age, gender=excluded.gender,
    house_no=excluded.house_no, voter_id=excluded.voter_id,
    photo_path=excluded.photo_path, source_page=excluded.source_page,
    updated_at=now();
  get diagnostics inserted_count = row_count;
  return inserted_count;
end; $$;

revoke all on function public.admin_search_voters(text,integer,integer,integer) from public, anon;
revoke all on function public.admin_voter_stats() from public, anon;
revoke all on function public.admin_import_voters(jsonb) from public, anon;
grant execute on function public.admin_search_voters(text,integer,integer,integer) to authenticated;
grant execute on function public.admin_voter_stats() to authenticated;
grant execute on function public.admin_import_voters(jsonb) to authenticated;

-- Private photo storage. Only authenticated admins may access objects.
insert into storage.buckets (id, name, public)
values ('penubaka-voter-photos', 'penubaka-voter-photos', false)
on conflict (id) do update set public = false;

drop policy if exists "Admins read private voter photos" on storage.objects;
create policy "Admins read private voter photos"
on storage.objects for select to authenticated
using (bucket_id='penubaka-voter-photos' and (select private.is_admin()));

drop policy if exists "Admins upload private voter photos" on storage.objects;
create policy "Admins upload private voter photos"
on storage.objects for insert to authenticated
with check (bucket_id='penubaka-voter-photos' and (select private.is_admin()));

drop policy if exists "Admins update private voter photos" on storage.objects;
create policy "Admins update private voter photos"
on storage.objects for update to authenticated
using (bucket_id='penubaka-voter-photos' and (select private.is_admin()))
with check (bucket_id='penubaka-voter-photos' and (select private.is_admin()));

drop policy if exists "Admins delete private voter photos" on storage.objects;
create policy "Admins delete private voter photos"
on storage.objects for delete to authenticated
using (bucket_id='penubaka-voter-photos' and (select private.is_admin()));

-- Do not add this data to the public website or GitHub.
