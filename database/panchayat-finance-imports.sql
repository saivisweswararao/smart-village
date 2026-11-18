-- Penubaka Smart Village: private staging table for eGramSwaraj finance report imports.
-- Run this script in Supabase SQL Editor before using the admin importer.
create table if not exists public.panchayat_finance_imports (
  id uuid primary key default gen_random_uuid(),
  report_type text not null check (report_type in ('financial_progress','receipt_expenditure','scheme_wise','year_book','own_revenue','voucher_payment','other')),
  report_type_label text not null,
  financial_year text not null,
  file_name text not null,
  file_format text not null check (file_format in ('xlsx','xls','csv')),
  source_name text not null default 'eGramSwaraj',
  source_url text not null default 'https://egramswaraj.gov.in/',
  row_count integer not null default 0 check (row_count >= 0),
  column_headers jsonb not null default '[]'::jsonb,
  report_data jsonb not null default '[]'::jsonb,
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists panchayat_finance_imports_year_type_idx
  on public.panchayat_finance_imports (financial_year, report_type);
alter table public.panchayat_finance_imports enable row level security;
revoke all on public.panchayat_finance_imports from anon;
revoke all on public.panchayat_finance_imports from authenticated;
grant select, insert, delete on public.panchayat_finance_imports to authenticated;
drop policy if exists "Admins can view finance imports" on public.panchayat_finance_imports;
create policy "Admins can view finance imports"
  on public.panchayat_finance_imports for select to authenticated
  using ((select private.is_admin()));
drop policy if exists "Admins can insert finance imports" on public.panchayat_finance_imports;
create policy "Admins can insert finance imports"
  on public.panchayat_finance_imports for insert to authenticated
  with check ((select private.is_admin()) and uploaded_by = auth.uid());
drop policy if exists "Admins can delete finance imports" on public.panchayat_finance_imports;
create policy "Admins can delete finance imports"
  on public.panchayat_finance_imports for delete to authenticated
  using ((select private.is_admin()));
