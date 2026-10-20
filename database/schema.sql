-- Penubaka Smart Village starter schema. Review and test policies before production.
create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;

create table public.villages(id uuid primary key default gen_random_uuid(),name_en text not null,name_te text not null,slug text unique not null,is_active boolean not null default true,created_at timestamptz not null default now());
insert into public.villages(name_en,name_te,slug) values('Penubaka','పెనుబాక','penubaka') on conflict(slug) do nothing;

create table public.admin_profiles(user_id uuid primary key references auth.users(id) on delete cascade,display_name text not null,role text not null default 'admin' check(role in('admin')),created_at timestamptz not null default now());
create table public.announcements(id uuid primary key default gen_random_uuid(),village_id uuid not null references public.villages(id),title_en text not null,title_te text not null,body_en text,body_te text,status text not null default 'draft' check(status in('draft','published','archived')),published_at timestamptz,created_at timestamptz not null default now());
create table public.village_contacts(id uuid primary key default gen_random_uuid(),village_id uuid not null references public.villages(id),name text not null,category text not null,phone text,details_en text,details_te text,is_verified boolean not null default false,is_published boolean not null default false,created_at timestamptz not null default now());
create table public.schemes(id uuid primary key default gen_random_uuid(),village_id uuid not null references public.villages(id),title_en text not null,title_te text not null,body_en text,body_te text,source_url text,status text not null default 'draft' check(status in('draft','published','archived')),created_at timestamptz not null default now());
create table public.service_listings(id uuid primary key default gen_random_uuid(),village_id uuid not null references public.villages(id),name text not null,category text not null,description_en text,description_te text,phone text,source_url text,is_approved boolean not null default false,owner_consent boolean not null default false,created_at timestamptz not null default now());
create table public.issues(id uuid primary key default gen_random_uuid(),village_id uuid not null references public.villages(id),reference_code text unique not null,category text not null check(category in('road','drainage','garbage','water','streetlight','electricity','other')),description text not null check(char_length(description) between 10 and 2000),area_description text,tracking_token_hash text not null,status text not null default 'received' check(status in('received','under_review','in_progress','resolved','rejected')),created_at timestamptz not null default now());
create table public.issue_updates(id uuid primary key default gen_random_uuid(),issue_id uuid not null references public.issues(id) on delete cascade,status text not null,public_note text,updated_by uuid references auth.users(id),created_at timestamptz not null default now());
create table public.public_works(id uuid primary key default gen_random_uuid(),village_id uuid not null references public.villages(id),title_en text not null,title_te text not null,description_en text,description_te text,source_url text,status text not null default 'proposed' check(status in('proposed','approved','in_progress','completed','on_hold')),last_verified_at timestamptz,is_published boolean not null default false,created_at timestamptz not null default now());
create table public.community_suggestions(id uuid primary key default gen_random_uuid(),village_id uuid not null references public.villages(id),suggestion text not null check(char_length(suggestion) between 10 and 2000),status text not null default 'pending' check(status in('pending','approved','rejected','implemented')),public_summary text,created_at timestamptz not null default now());

create index announcements_feed_idx on public.announcements(village_id,published_at desc) where status='published';
create index issues_status_idx on public.issues(village_id,status,created_at desc);
create index works_public_idx on public.public_works(village_id,created_at desc) where is_published;

alter table public.villages enable row level security;
alter table public.admin_profiles enable row level security;
alter table public.announcements enable row level security;
alter table public.village_contacts enable row level security;
alter table public.schemes enable row level security;
alter table public.service_listings enable row level security;
alter table public.issues enable row level security;
alter table public.issue_updates enable row level security;
alter table public.public_works enable row level security;
alter table public.community_suggestions enable row level security;

create or replace function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.admin_profiles p where p.user_id=(select auth.uid()) and p.role='admin'); $$;
revoke all on function private.is_admin() from public;
grant usage on schema private to anon,authenticated;
grant execute on function private.is_admin() to anon,authenticated;

revoke all on public.villages,public.admin_profiles,public.announcements,public.village_contacts,public.schemes,public.service_listings,public.issues,public.issue_updates,public.public_works,public.community_suggestions from anon,authenticated;
grant select on public.villages,public.announcements,public.village_contacts,public.schemes,public.service_listings,public.public_works to anon,authenticated;
grant select,insert,update,delete on public.announcements,public.village_contacts,public.schemes,public.service_listings,public.public_works to authenticated;
grant select on public.admin_profiles to authenticated;
grant select,update on public.issues to authenticated;
grant select,insert on public.issue_updates to authenticated;
grant select,insert on public.community_suggestions to authenticated;

create policy "Admins can read own profile" on public.admin_profiles for select to authenticated using(user_id=(select auth.uid()));
create policy "Active villages public" on public.villages for select to anon,authenticated using(is_active);
create policy "Admins manage villages" on public.villages for all to authenticated using((select private.is_admin())) with check((select private.is_admin()));
create policy "Published announcements public" on public.announcements for select to anon,authenticated using(status='published' or (select private.is_admin()));
create policy "Admins manage announcements" on public.announcements for all to authenticated using((select private.is_admin())) with check((select private.is_admin()));
create policy "Verified contacts public" on public.village_contacts for select to anon,authenticated using((is_verified and is_published) or (select private.is_admin()));
create policy "Admins manage contacts" on public.village_contacts for all to authenticated using((select private.is_admin())) with check((select private.is_admin()));
create policy "Published schemes public" on public.schemes for select to anon,authenticated using(status='published' or (select private.is_admin()));
create policy "Admins manage schemes" on public.schemes for all to authenticated using((select private.is_admin())) with check((select private.is_admin()));
create policy "Approved listings public" on public.service_listings for select to anon,authenticated using((is_approved and owner_consent) or (select private.is_admin()));
create policy "Admins manage listings" on public.service_listings for all to authenticated using((select private.is_admin())) with check((select private.is_admin()));
create policy "Admins read issues" on public.issues for select to authenticated using((select private.is_admin()));
create policy "Admins update issues" on public.issues for update to authenticated using((select private.is_admin())) with check((select private.is_admin()));
create policy "Admins read issue history" on public.issue_updates for select to authenticated using((select private.is_admin()));
create policy "Admins add issue history" on public.issue_updates for insert to authenticated with check((select private.is_admin()));
create policy "Published works public" on public.public_works for select to anon,authenticated using(is_published or (select private.is_admin()));
create policy "Admins manage works" on public.public_works for all to authenticated using((select private.is_admin())) with check((select private.is_admin()));
create policy "Admins read suggestions" on public.community_suggestions for select to authenticated using((select private.is_admin()));
create policy "Admins manage suggestions" on public.community_suggestions for all to authenticated using((select private.is_admin())) with check((select private.is_admin()));

create or replace function public.submit_village_issue(p_village_slug text,p_category text,p_description text,p_area_description text,p_tracking_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_village_id uuid; v_reference text;
begin
 if p_tracking_token is null or length(p_tracking_token)<32 or length(p_tracking_token)>128 then raise exception 'Invalid tracking token'; end if;
 if p_description is null or length(trim(p_description))<10 or length(p_description)>2000 then raise exception 'Description must be 10 to 2000 characters'; end if;
 if p_area_description is not null and length(p_area_description)>200 then raise exception 'Area description too long'; end if;
 if p_category not in('road','drainage','garbage','water','streetlight','electricity','other') then raise exception 'Invalid category'; end if;
 select id into v_village_id from public.villages where slug=p_village_slug and is_active;
 if v_village_id is null then raise exception 'Village not found'; end if;
 v_reference:=upper(encode(extensions.gen_random_bytes(8),'hex'));
 insert into public.issues(village_id,reference_code,category,description,area_description,tracking_token_hash) values(v_village_id,v_reference,p_category,trim(p_description),nullif(trim(p_area_description),''),encode(extensions.digest(p_tracking_token,'sha256'),'hex'));
 insert into public.issue_updates(issue_id,status,public_note) select id,'received','Report received' from public.issues where reference_code=v_reference;
 return jsonb_build_object('reference_code',v_reference,'tracking_token',p_tracking_token,'status','received');
end; $$;
create or replace function public.track_village_issue(p_reference_code text,p_tracking_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_issue_id uuid; v_status text; v_created_at timestamptz; v_updates jsonb;
begin
 if p_reference_code is null or length(p_reference_code)>40 or p_tracking_token is null or length(p_tracking_token)<32 or length(p_tracking_token)>128 then return jsonb_build_object('found',false); end if;
 select i.id,i.status,i.created_at into v_issue_id,v_status,v_created_at from public.issues i where i.reference_code=upper(p_reference_code) and i.tracking_token_hash=encode(extensions.digest(p_tracking_token,'sha256'),'hex');
 if v_issue_id is null then return jsonb_build_object('found',false); end if;
 select coalesce(jsonb_agg(jsonb_build_object('status',u.status,'note',u.public_note,'created_at',u.created_at) order by u.created_at),'[]'::jsonb) into v_updates from public.issue_updates u where u.issue_id=v_issue_id and u.public_note is not null;
 return jsonb_build_object('found',true,'reference_code',upper(p_reference_code),'status',v_status,'created_at',v_created_at,'updates',v_updates);
end; $$;
revoke all on function public.submit_village_issue(text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.track_village_issue(text,text) from public,anon,authenticated;
grant execute on function public.submit_village_issue(text,text,text,text,text) to anon,authenticated;
grant execute on function public.track_village_issue(text,text) to anon,authenticated;

-- Admin bootstrap: create your own Auth user, copy its UUID, then run:
-- insert into public.admin_profiles(user_id,display_name,role) values ('YOUR-AUTH-USER-UUID','Penubaka Administrator','admin');
-- Before production: add RPC rate limiting/abuse protection and test RLS. Admin status updates should be done through a controlled audited function.