# بن خلدون — القائمة

Arabic-first café menu and table-ordering app. Staff manage the menu at `/admin`; customers browse and order from `/`.

## Supabase setup

1. Run [`supabase/schema.sql`](supabase/schema.sql) in the Supabase SQL Editor. It creates or updates the menu, variants, ingredient options, order tables, admin allowlist, storage bucket, row-level security policies, and database functions. If you already set up Supabase, rerun the full script to add per-order payment tracking and the order-payment function.
2. In Supabase Authentication, create and confirm the staff user's email/password.
3. Add that user's ID to the admin allowlist in the SQL Editor, replacing the sample email:

   ```sql
   insert into public.admin_users (user_id)
   select id from auth.users where lower(email) = lower('admin@example.com')
   on conflict (user_id) do nothing;
   ```

4. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as Replit environment variables, then restart the web workflow.
5. Open `/admin` directly and sign in with that Supabase user's credentials. There is no signup screen or link to the admin route from the customer menu.
6. Replace the seeded example menu and prices with the café's current menu. Existing starter ingredients are imported as core ingredients; edit them to mark customer-excludable ingredients.

The browser uses only Supabase's public anon key. RLS and database functions restrict menu changes and image uploads to users in `public.admin_users`. Customers can read available items and submit orders, but cannot read or edit orders. Never expose a Supabase `service_role` key in a `VITE_` variable.

Menu images are stored in the public `menu-images` Supabase Storage bucket. Item variants can override the base price and image; blank overrides inherit the item's base values. Customer exclusions are checked against the item's excludable ingredient records and stored with the order.

Orders, dining sessions, and service requests are managed in the staff area at `/admin`. Staff can review active and recent table sessions, respond to waiter and bill requests, and mark orders served. From an order's details, staff can mark just that order paid without closing the session; the customer’s next bill excludes it. The card-level payment action settles the remaining unpaid orders and closes the whole session. Manually closing a session warns if any served order remains unpaid, but staff can choose to continue. The customer menu accepts a table number in a QR link, for example `?table=12`; without one, the customer is asked to enter it.

The app expects the Supabase project URL and public anon key at build time as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. The included `.env.example` lists both names. The menu and admin area show setup guidance when either value is missing; no Supabase credentials are included in this repository.
