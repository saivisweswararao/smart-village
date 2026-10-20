# Penubaka Smart Village / పెనుబాక స్మార్ట్ విలేజ్

Mobile-first Telugu + English community information website. Static HTML/CSS/JS for Cloudflare Pages; Supabase stores approved public content and private issue reports.

## Included
- Bilingual mobile-first home page and language toggle
- Announcements, schemes, local services, development updates
- Private issue submission and token-protected tracking
- Starter admin sign-in page
- Supabase schema with row-level security (RLS) and RPCs

## Setup (₹0 target)
1. Create a Supabase project on the free tier and run `database/schema.sql` in SQL Editor.
2. Create your admin account in Supabase Authentication > Users. Then follow the admin bootstrap comments at the end of the SQL file.
3. Set the project URL and **publishable/anon key only** in `js/config.js`. Never place a service-role key in browser code.
4. Connect this GitHub repository to Cloudflare Pages. Framework preset: None; build command: blank; output directory: `/`.
5. Test all pages, anonymous access, admin access and RLS before sharing publicly.

## Important
This is a starter, not a security audit or an official Panchayat website. Public issue submissions need rate limiting/abuse protection before production. Do not collect sensitive personal information or upload photos until secure private storage is configured. Check current free-tier limits before launch.