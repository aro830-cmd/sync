# Relay

Multi-agent technical club event & sponsorship orchestrator — Synchronise 2026, problem statement PS-CA2.

Type a one-line brief ("Hackathon, 15 Dec, ₹50k, 200 people"). Five agents — Planner, Sponsorship, Logistics, Comms, Reporting — run in order and each ends in a real side effect: database rows, sent emails, generated PDFs. Sponsor pitches wait for a human "Approve & send".

Design: [`ARCHITECTURE.md`](ARCHITECTURE.md) · Build status: [`PROGRESS.md`](PROGRESS.md)

## Stack

Next.js 16 + TypeScript · Tailwind v4 + motion · Gemini · Supabase Postgres · Gmail SMTP (Nodemailer) · pdf-lib

## Setup

1. `npm install`
2. Copy the keys into `.env.local` (git-ignored):

   | Variable | Where |
   |---|---|
   | `GEMINI_API_KEY`, `GEMINI_MODEL` (optional) | https://aistudio.google.com/apikey |
   | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API keys (use the **secret** key) |
   | `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Google Account → Security → App passwords |
   | `ADMIN_PASSCODE` | Any password; guards `/dashboard` |
   | `SESSION_SECRET` | Any long random string; signs student login cookies |

3. New Supabase project only: run `supabase/schema.sql` in the SQL editor, then optionally `supabase/seed.sql` for the demo event (open `/dashboard/de000000-0000-4000-a000-000000000001`).
4. `npm run dev` → http://localhost:3000

## Routes

- `/` — landing
- `/admin/login` → `/dashboard` — organiser desk (passcode = `ADMIN_PASSCODE`)
- `/e/[id]` — public event registration
- `/student/signup`, `/student/login`, `/student` — student portal (my events, one-tap registration, certificate download after check-in)

## Checks

```bash
npm run build && npm run lint
node src/lib/schedule.test.ts   # volunteer scheduler self-check
node src/lib/retry.test.ts      # Gemini retry/fallback self-check
```

## Credits

Fox mascot video, stills and the cast sheet are Higgsfield generations hotlinked from their CDN (never re-hosted); mp4box.js and Lenis load from jsDelivr at runtime.

## Demo accounts

- **Student:** `ananya.krishnan@example.com` / `Relay@2026` (or click "Use the demo student account" on `/student/login`). Checked in to HackRIT '26, so the certificate downloads.
- **Organiser desk:** `/admin/login` (or click "Open the desk") → enter the `ADMIN_PASSCODE` from `.env.local`.
