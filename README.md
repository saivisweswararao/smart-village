# Penubaka Smart Village / పెనుబాక స్మార్ట్ విలేజ్

Mobile-first Telugu + English community information website. Static HTML/CSS/JS for Cloudflare Pages; Supabase stores approved public content and private issue reports.

## Included
- Bilingual mobile-first home page and language toggle
- Announcements, schemes, local services, development updates
- Private issue submission and token-protected tracking
- Starter admin sign-in page
- Private admin-only voter management with name search, ward filters and voter cards; voter records and photographs stay in private Supabase storage
- Supabase schema with row-level security (RLS) and RPCs

## Setup (₹0 target)
1. Create a Supabase project on the free tier and run `database/schema.sql` in SQL Editor.
2. Create your admin account in Supabase Authentication > Users. Then follow the admin bootstrap comments at the end of the SQL file.
3. Set the project URL and **publishable/anon key only** in `js/config.js`. Never put a service-role key in browser code.
4. Connect this GitHub repository to Cloudflare Pages. Framework preset: None; build command: blank; output directory: `/`.
5. Test all pages, anonymous access, admin access and RLS before sharing publicly.

## Important
This is a starter, not a security audit or an official Panchayat website. Public issue submissions need rate limiting/abuse protection before production. Do not collect sensitive personal information or upload photos until secure private storage is configured. Check current free-tier limits before launch.

<!-- Cloudflare Pages deployment trigger: 2026-11-09 -->


## Browser push notifications (Penubaka)
1. Run `database/notification-interest.sql` and then `database/web-push-notifications.sql` in Supabase SQL Editor.
2. Generate a VAPID key pair on the deployed site at `/tools/generate-vapid-keys.html`. Put the public key in `js/push-notifications.js` as `VAPID_PUBLIC_KEY`. Store the private key-pair JSON only as the Supabase Edge Function secret `VAPID_KEY_PAIR_JSON`.
3. Deploy `supabase/functions/push-notifications/index.ts` as an Edge Function named `push-notifications`. The function must have gateway JWT verification disabled because public visitors subscribe without logging in; the function itself checks administrator JWTs and admin_profiles before sending.
4. Add Edge Function secrets: `SUPABASE_PUBLISHABLE_KEY` (same browser-safe publishable key used by `js/config.js`), `VAPID_PUBLIC_KEY`, `VAPID_KEY_PAIR_JSON`, and `VAPID_CONTACT_EMAIL`. Supabase provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions; never put the service-role key in browser code or GitHub.
5. Deploy the static site. Visitors tap Enable notifications and grant browser permission. Admins publish announcements from the admin portal; the function sends push notifications to active subscriptions and removes expired subscriptions.

Push requires HTTPS, a supporting browser, a registered service worker, and explicit browser permission. A past website visit alone does not create a subscription. Users can turn notifications off from the homepage control or browser settings. Push sending is subject to Supabase free-tier quotas and push-service/browser delivery behavior.
