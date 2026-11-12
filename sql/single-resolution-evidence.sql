-- Run once in Supabase Dashboard > SQL Editor.
-- One combined before/after image and an optional resolution comment.
alter table public.public_grievances
  add column if not exists resolution_image_url text,
  add column if not exists resolution_comment text;

comment on column public.public_grievances.resolution_image_url is 'Public URL of one combined before-and-after image uploaded by an authorized admin.';
comment on column public.public_grievances.resolution_comment is 'Optional completion note entered by an authorized admin.';
