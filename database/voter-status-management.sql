-- Penubaka voter record-maintenance statuses.
-- Run once in Supabase SQL Editor after the page files are deployed.
-- These labels describe record verification/lifecycle only; never use them to infer political views.

alter table private.voters
  add column if not exists voter_status text not null default 'Not Verified';

alter table private.voters drop constraint if exists voters_voter_status_check;
alter table private.voters add constraint voters_voter_status_check
  check (voter_status in ('Verified','Not Verified','Equal','Not Required','Dead','Shifted outside','Duplicate'));

create index if not exists private_voters_status_idx
  on private.voters(village_slug, voter_status, ward_no, serial_no);

drop function if exists public.admin_search_voters(text,integer,integer,integer);
create function public.admin_search_voters(
  p_query text default null,
  p_ward integer default null,
  p_limit integer default 50,
  p_offset integer default 0,
  p_status text default null
)
returns table (
  id uuid, ward_no integer, serial_no integer, voter_name text,
  guardian_name text, relationship text, age integer, gender text, house_no text,
  voter_id text, photo_path text, voter_status text
)
language plpgsql security definer set search_path = ''
as $$
begin
  if not (select private.is_admin()) then raise exception 'Not authorized'; end if;
  if p_ward is not null and (p_ward < 1 or p_ward > 12) then raise exception 'Invalid ward'; end if;
  if p_status is not null and p_status not in ('Verified','Not Verified','Equal','Not Required','Dead','Shifted outside','Duplicate') then
    raise exception 'Invalid record status';
  end if;
  return query
    select v.id, v.ward_no, v.serial_no, v.voter_name, v.guardian_name,
           v.relationship, v.age, v.gender, v.house_no, v.voter_id, v.photo_path, v.voter_status
    from private.voters v
    where v.village_slug = 'penubaka'
      and (p_ward is null or v.ward_no = p_ward)
      and (p_status is null or v.voter_status = p_status)
      and (nullif(trim(p_query),'') is null
        or v.voter_name ilike '%' || trim(p_query) || '%'
        or coalesce(v.voter_id,'') ilike '%' || trim(p_query) || '%')
    order by v.ward_no, v.serial_no
    limit least(greatest(coalesce(p_limit,50),1),100)
    offset greatest(coalesce(p_offset,0),0);
end; $$;

create or replace function public.admin_update_voter_status(p_voter_id uuid, p_status text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  if not (select private.is_admin()) then raise exception 'Not authorized'; end if;
  if p_status not in ('Verified','Not Verified','Equal','Not Required','Dead','Shifted outside','Duplicate') then
    raise exception 'Invalid record status';
  end if;
  update private.voters
     set voter_status=p_status, updated_at=now()
   where id=p_voter_id and village_slug='penubaka';
  if not found then raise exception 'Voter record not found'; end if;
  return true;
end; $$;

create or replace function public.admin_voter_status_counts()
returns table(voter_status text, voter_count bigint)
language plpgsql security definer set search_path = ''
as $$
begin
  if not (select private.is_admin()) then raise exception 'Not authorized'; end if;
  return query
    select s.status, count(v.id)::bigint
    from (values
      ('Verified'),('Not Verified'),('Equal'),('Not Required'),
      ('Dead'),('Shifted outside'),('Duplicate')
    ) as s(status)
    left join private.voters v
      on v.village_slug='penubaka' and v.voter_status=s.status
    group by s.status
    order by case s.status
      when 'Verified' then 1 when 'Not Verified' then 2 when 'Equal' then 3
      when 'Not Required' then 4 when 'Dead' then 5
      when 'Shifted outside' then 6 else 7 end;
end; $$;

revoke all on function public.admin_search_voters(text,integer,integer,integer,text) from public, anon;
revoke all on function public.admin_update_voter_status(uuid,text) from public, anon;
revoke all on function public.admin_voter_status_counts() from public, anon;
grant execute on function public.admin_search_voters(text,integer,integer,integer,text) to authenticated;
grant execute on function public.admin_update_voter_status(uuid,text) to authenticated;
grant execute on function public.admin_voter_status_counts() to authenticated;