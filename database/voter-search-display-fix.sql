-- Run this once in Supabase SQL Editor after the voter-management page deployment.
-- This RPC returns voter ID and private photo path ONLY to signed-in administrators.
drop function if exists public.admin_search_voters(text,integer,integer,integer);

create function public.admin_search_voters(
  p_query text default null,
  p_ward integer default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  ward_no integer,
  serial_no integer,
  voter_name text,
  guardian_name text,
  relationship text,
  age integer,
  gender text,
  house_no text,
  voter_id text,
  photo_path text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.is_admin()) then
    raise exception 'Not authorized';
  end if;

  if p_ward is not null and (p_ward < 1 or p_ward > 12) then
    raise exception 'Invalid ward';
  end if;

  return query
    select v.id, v.ward_no, v.serial_no, v.voter_name, v.guardian_name,
           v.relationship, v.age, v.gender, v.house_no, v.voter_id, v.photo_path
    from private.voters v
    where v.village_slug = 'penubaka'
      and (p_ward is null or v.ward_no = p_ward)
      and (
        nullif(trim(p_query), '') is null
        or v.voter_name ilike '%' || trim(p_query) || '%'
        or coalesce(v.voter_id, '') ilike '%' || trim(p_query) || '%'
      )
    order by v.ward_no, v.serial_no
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
    offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke all on function public.admin_search_voters(text, integer, integer, integer)
from public, anon;
grant execute on function public.admin_search_voters(text, integer, integer, integer)
to authenticated;
