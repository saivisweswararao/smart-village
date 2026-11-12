-- Run once in Supabase Dashboard > SQL Editor.
-- Adds optional before/after evidence images for resolved complaints.
alter table public.public_grievances
  add column if not exists before_image_url text,
  add column if not exists after_image_url text;

comment on column public.public_grievances.before_image_url is 'Public URL of the before-work evidence image, uploaded by an authorized admin.';
comment on column public.public_grievances.after_image_url is 'Public URL of the after-work completion image, uploaded by an authorized admin.';
