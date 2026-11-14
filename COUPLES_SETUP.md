# Focus OS — private study partner setup

This feature shares a small study plan and one live focus timer between two signed-in accounts. Invitations appear inside the recipient's portal; the app does not send an email. For an existing Focus OS account, invite by Google account email (looked up only inside a server-side function). A one-time invite code is also available if needed.

## What is shared

- Task title, subject, due date and completion status for upcoming tasks not marked private.
- A room activity notice when the second account joins.
- One shared focus timer and its label.

Personal notes, daily logs, reminders, analytics, account email and tasks marked **🔒** are not copied to the couple tables. A task starts shared by default; click its arrow button to hide it before adding private details.

## Supabase steps

1. Open the existing Focus OS project in Supabase.
2. Open **SQL Editor → New query**.
3. From this repository, open `supabase/couples.sql`, copy all of it into the editor and select **Run**. A successful schema setup can say “Success. No rows returned.” This creates the room, invite, shared-task and timer tables plus server-side access policies and RPC functions. It does not require a service-role key in the website.
4. In **Table Editor**, confirm the `couples`, `couple_members`, `couple_invites`, `couple_invitations`, `couple_events`, `couple_tasks`, and `couple_focus_sessions` tables exist. They will be empty until the portal is used.
5. Deploy the updated website files to the same Vercel project (push to the connected GitHub branch or deploy from Vercel). No Vercel environment variables need to be added for this feature. Keep `supabase-config.js` limited to the project URL and publishable key; never put a service-role/secret key in browser files.

## Use it

1. Sign in to Focus OS with your Google account and open **Profile & Study Partner** in the sidebar.
2. Select **Create study room**, then enter your partner's Google account email and choose **Send in-portal invite**. This does not send email; it creates a private notification and badge in their portal when that account signs in.
3. If your partner is not registered yet, create a one-time code and share it privately. They sign in with their own Google account, open the same section and enter the code. The code expires after seven days and can only be used once.
4. Both accounts should then see each other's non-private upcoming tasks, including today and tomorrow. Use ↗ / 🔒 beside a task to share or hide it. Start the shared focus timer from either account.
5. Test with only harmless sample tasks first. Confirm a private task does not appear in `couple_tasks` and cannot be read from the other account.

## Privacy and costs

Browser code can be inspected by visitors; that is normal for static websites. This feature keeps access control in Supabase RLS and server-side functions, and the browser uses only the already-public publishable key. Never expose Supabase secret/service-role keys. Only the two accounts holding room membership can read shared records. Ending the room deletes its shared records for both users but leaves each person's private `study_data` untouched.

The feature uses the existing Supabase project and its database/Realtime quotas; it does not create paid resources or enable billing. Stay on the Free plan and keep billing disabled to avoid charges. Supabase Free limits still apply, and inactive free projects may pause. The invite code is a bearer secret: send it only to the intended partner.
