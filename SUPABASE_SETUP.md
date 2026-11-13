# Focus OS — Supabase and Google sign-in setup

This project now uses Supabase Auth for Google sign-in and Supabase Postgres for cloud data. The browser only receives the **publishable** key. The table's row-level security (RLS) restricts data to the Google email and user ID you configure.

## Before you start

1. Export a JSON backup from Focus OS (Analytics → Backup JSON). The first successful Google sign-in will copy this browser's current Focus OS data into the new account if that account has no rows yet.
2. Keep your Google account email handy.
3. Do not put a Supabase secret/service-role key or the Google client secret in project files or chat.

## 1. Create a free Supabase project

1. Open [Supabase Dashboard](https://supabase.com/dashboard) and sign in.
2. Choose an existing organization or create one on the **Free** plan.
3. Select **New project**. Name it `focus-os`, choose a nearby region, and create a strong database password. Save that password somewhere private; this app does not need it.
4. Confirm the organization and project are on **Free**. Do not upgrade, enable paid add-ons, or enter payment details. If the dashboard requires payment details, stop before continuing.

## 2. Copy the browser-safe project settings

In the project dashboard, open **Project Settings → API Keys** (or **Connect**). Copy:

- Project URL, like `https://abcdefgh.supabase.co`
- **Publishable key**, which starts with `sb_publishable_`

Copy `supabase-config.example.js` to `supabase-config.js` in this project, then replace its URL and key placeholders. Set `ownerEmail` to the same Google account email you will use below. The real config file is kept out of Git so your email stays private. These values identify the project; the publishable key is designed to appear in browser code. Never use a key named **secret** or **service_role** here.

## 3. Create the private data table

1. In the Supabase project, open **SQL Editor → New query**.
2. Open `supabase/schema.sql` in this project.
3. Replace both occurrences of `REPLACE_WITH_YOUR_GOOGLE_EMAIL` with your Google account email.
4. Paste the edited SQL into the Supabase SQL Editor and select **Run**.

The table has RLS enabled. Its policy checks both the authenticated Supabase user ID and the allowed Google email. Other Google accounts can’t read or write your rows.

## 4. Create Google OAuth credentials

1. Open [Google Cloud Console](https://console.cloud.google.com/). Create a project or select one you control.
2. Open **Google Auth Platform → Branding** and complete the app name and contact details.
3. Under **Audience**, choose **External** for a personal Google account and add your email as a **Test user**. While the app remains in Testing, Google limits access to listed test users and test authorizations expire after seven days.
4. Under **Clients**, choose **Create client → Web application**.
5. Add these **Authorized JavaScript origins** (origins have no path):
   - Local development: `http://localhost:3000` for VS Code Live Preview, or `http://localhost:5500` for Live Server. Use the port shown in your browser.
   - Later, add the production origin, such as `https://your-project.pages.dev`.
6. In Supabase, open **Authentication → Sign In / Providers → Google** and copy its callback URL. It normally looks like `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`.
7. Add that exact URL as the Google client's **Authorized redirect URI**. Google requires an exact match.
8. Create the client and copy its Client ID and Client secret. Return to Supabase's Google provider settings, enable Google, paste both values, and save. Keep the Client secret in Supabase only; do not add it to this project.

## 5. Allow the app's post-login return URLs

In Supabase, open **Authentication → URL Configuration**:

- Set **Site URL** to your current primary app URL.
- Add `http://localhost:3000/**` to **Redirect URLs** for VS Code Live Preview, or `http://localhost:5500/**` for Live Server.
- After you have a production site URL, add `https://your-project.pages.dev/**` (using your actual Pages project name).

The Google redirect URI in the previous step points to Supabase. These Redirect URLs are where Supabase sends the browser back to your app after authentication; they are different settings.

## 6. Run it locally and sign in

Serve the project over HTTP rather than opening `index.html` as a file. Use VS Code Live Preview (commonly port 3000) or the Live Server extension (commonly port 5500). Use the exact same port in the Google origin and Supabase Redirect URLs.

Open the local `index.html`, choose **Continue with Google**, and sign in using the email you put in `supabase-config.js` and `schema.sql`. On first sign-in, if the new Supabase account has no data rows, the app imports this browser's existing Focus OS data. Later edits are saved to Supabase and cached locally. The sidebar reports the sync state.

## 7. Check the setup

- In Supabase, open **Table Editor → study_data**. You should see one row per Focus OS data item, with your Supabase user ID and data key.
- Sign out and sign in again. Your tasks, notes, logs, and settings should return.
- Try signing in with a different Google account: the app should refuse access to this workspace, and the RLS policy must reject its database requests.
- Keep a JSON backup. The Supabase Free plan does not include downloadable database backups.

## Cost and availability

Supabase currently includes two Free projects per account, 500 MB database size per project, 5 GB egress, and 50,000 monthly active users. Free-plan overages are restricted rather than billed automatically; do not upgrade the organization or add paid products. Free projects with very little database activity can be paused after about seven days and resumed from the dashboard. Free projects do not include downloadable database backups, so continue using Focus OS JSON exports.

## What this integration does

Supabase provides the managed Auth and database API; this remains a static front end and does not add a separate custom server. Each account's rows are protected by RLS. The app loads cloud data at sign-in and saves edits per data key. If you keep the app open on two devices at once, reload the other device to fetch the latest data; live Realtime updates are not configured.

The app is not published by these changes. A publishable key is expected in the browser; security comes from Google Auth and the SQL policies. Do not add a secret key to the site. No project, provider, or deployment has been created or changed in your accounts by this setup.
