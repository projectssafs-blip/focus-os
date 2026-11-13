# Focus OS — Supabase and Google sign-in setup

Focus OS uses Supabase Auth for Google sign-in and Supabase Postgres for cloud data. The browser config contains only the Project URL and publishable key. Row-level security (RLS) isolates each signed-in user's data by Supabase user ID; no Google email is stored in the browser config.

## Before you start

1. Export a JSON backup from Focus OS (Analytics → Backup JSON).
2. Use a Supabase project on the Free plan. Do not upgrade, enter payment details, or add paid products for this setup.
3. Never put a Supabase secret/service-role key or the Google client secret in project files or chat.

## 1. Configure the browser-safe Supabase values

In the Supabase project, open **Project Settings → API Keys** (or **Connect**) and copy the Project URL and **Publishable key** (`sb_publishable_...`). The repository's `supabase-config.js` is for these two values only. They are intended for browser use; do not use a key named **secret** or **service_role** here.

If recreating the config, copy `supabase-config.example.js` to `supabase-config.js` and fill in the URL and publishable key. The example has no email field.

## 2. Create or update the private data table policy

1. In Supabase, open **SQL Editor → New query**.
2. Open `supabase/schema.sql` from this project.
3. Paste the SQL as-is and select **Run**. It replaces the earlier email-restricted policy without deleting study rows.

The policy allows a signed-in user to access only rows with their own Supabase user ID. Other accounts cannot read or change those rows.

## 3. Enable Google sign-in

1. In Google Cloud Console, open **Google Auth Platform → Branding** and complete the app details.
2. Under **Audience**, choose **External** for personal Google accounts and add your Google account as a test user. While the app is in Testing, Google limits access to listed test users.
3. Under **Clients**, create a **Web application** OAuth client.
4. Add the development origin, such as `http://localhost:3000` for VS Code Live Preview or `http://localhost:5500` for Live Server. Add the Vercel origin after deployment. Origins have no path.
5. In Supabase **Authentication → Sign In / Providers → Google**, copy the callback URL and add that exact URL as the Google client's **Authorized redirect URI**.
6. Paste the Google Client ID and Client secret into Supabase's Google provider settings and save. Keep the Client secret in Supabase only.

## 4. Deploy on Vercel

1. Import `projectssafs-blip/focus-os` into Vercel.
2. Choose the free Hobby plan for personal, noncommercial use.
3. Set Framework Preset to **Other**, leave Build Command blank, and set Output Directory to `.`. Deploy.
4. In Supabase **Authentication → URL Configuration**, set Site URL to your exact Vercel production URL (for example, `https://your-project.vercel.app`). Add `https://your-project.vercel.app/**` to Redirect URLs.
5. Keep the local Redirect URL too: `http://localhost:3000/**` or `http://localhost:5500/**`, matching your local server.
6. In Google Cloud's OAuth client, add the Vercel origin (for example, `https://your-project.vercel.app`) under **Authorized JavaScript origins**. The Supabase callback URI remains the Google **Authorized redirect URI**.

## 5. Test sign-in and sync

1. Open the Vercel site and choose **Continue with Google**.
2. Use a Google account enabled in the Supabase provider and, while Google's app is in Testing, listed as a test user.
3. Confirm the sidebar reports cloud sync and check **Table Editor → study_data** in Supabase.
4. Try a different Google test account. It should get a separate workspace, and RLS must prevent it from reading the first account's rows.
5. Keep exporting JSON backups. Supabase Free has usage limits and does not include downloadable database backups; review the current plan limits in your dashboard.

The site is not deployed by this guide. Never add a Supabase secret/service-role key or Google client secret to the site.