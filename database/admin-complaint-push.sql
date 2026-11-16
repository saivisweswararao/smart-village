-- Run once in Supabase SQL Editor.
-- Private complaint-alert subscriptions are deliberately separate from public announcement subscriptions.
create table if not exists public.admin_complaint_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.admin_complaint_push_subscriptions enable row level security;
-- No anon/authenticated policies: only the Edge Function service role can access this table.

create table if not exists public.complaint_push_delivery_log (
  grievance_id text primary key,
  delivered_at timestamptz not null default now()
);
alter table public.complaint_push_delivery_log enable row level security;
-- No anon/authenticated policies: only the Edge Function service role can access this table.
