# For the Supabase project owner — apply migration 002

Relay's new features (sponsor research, payments, volunteer profiles, mission roles, rewards, incidents, audit log) need new tables. Only someone who can open this project in Supabase can add them. Pick **one** of the two ways below; both take about a minute.

---

## Way 1 — do it yourself in the dashboard (no tools needed)

1. Go to <https://supabase.com/dashboard> and open the Relay project (`synchronise`, ref `orzkpoknrjbvohqyqdct`).
2. Left sidebar → **SQL Editor** → **New query**.
3. Open [`002_sponsor_crm_volunteers.sql`](./002_sponsor_crm_volunteers.sql) (branch `dashboard-v2`), copy **all** of it, paste it in, press **Run**.
4. You should see "Success. No rows returned". Done — tell the team.

It only **adds** tables and columns. Nothing existing is changed or deleted, and running it twice is harmless.

---

## Way 2 — paste this prompt into an AI assistant that's connected to your Supabase account

(For example Claude with the Supabase connector enabled.) Copy everything inside the box:

```text
I own the Supabase project "synchronise" (project ref: orzkpoknrjbvohqyqdct). Please apply a database migration to it.

1. Read the file supabase/migrations/002_sponsor_crm_volunteers.sql from the GitHub repo aro830-cmd/sync, branch dashboard-v2
   (https://github.com/aro830-cmd/sync/blob/dashboard-v2/supabase/migrations/002_sponsor_crm_volunteers.sql).
   If you can't read GitHub, ask me to paste the file contents.
2. Apply it to project orzkpoknrjbvohqyqdct as a migration named "sponsor_crm_volunteers", exactly as written — do not
   edit, drop, rename or "clean up" anything. It is additive and idempotent (only CREATE ... IF NOT EXISTS,
   ADD COLUMN IF NOT EXISTS, and INSERT ... ON CONFLICT DO NOTHING).
3. Verify by running these read-only checks and show me the results:
     select count(*) as roles from roles;                         -- expect 9
     select count(*) as companies from companies;                 -- expect at least the number of distinct sponsor companies
     select count(*) as profiles from volunteer_profiles;         -- expect the number of club roster members
     select value from settings where key = 'fit_weights';        -- expect the default weights JSON
     select column_name from information_schema.columns
       where table_name = 'sponsors' and column_name in ('company_id','contribution_type','value','terms','proposal_sent_at');  -- expect 5 rows
4. Run the security advisor for the project and tell me if anything new is flagged. "RLS enabled, no policy" on the new
   tables is expected and intended: only the app's server (secret key) may access them.
Do not change any other project, and do not change data in existing tables beyond what the file does.
```

---

### What the migration adds

| Area | Tables / columns |
|---|---|
| Sponsor research | `companies`, `company_sources` (claim + URL + date + confidence), `settings` (fit-score weights) |
| Sponsor deals | `sponsors.company_id, contribution_type, value, terms, proposal_sent_at`, `sponsor_payments`, `sponsor_deliverables` |
| Volunteers | `volunteer_profiles`, `roles` (9 mission roles, pre-filled), `role_requests`, `volunteer_feedback`, `rewards` |
| Command centre | `incidents`, `audit_log` |

Existing sponsors are copied into `companies`, and the club volunteer roster is copied into `volunteer_profiles`.
