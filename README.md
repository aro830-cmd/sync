# Relay

Multi-agent technical club event & sponsorship orchestrator — Synchronise 2026, problem statement PS-CA2.

Type a one-line brief ("Hackathon, 15 Dec, ₹50k, 200 people"). Five agents — Planner, Sponsorship, Logistics, Comms, Reporting — run in order and each ends in a real side effect: database rows, sent emails, generated PDFs. Sponsor pitches wait for a human "Approve & send".

**New collaborator? Start with [`CONTRIBUTING.md`](CONTRIBUTING.md)** — access, setup, workflow.

Design: [`ARCHITECTURE.md`](ARCHITECTURE.md) · Build status: [`PROGRESS.md`](PROGRESS.md)

## Stack

Next.js 16 + TypeScript · Tailwind v4 + motion · Gemini · Supabase Postgres · Gmail SMTP (Nodemailer) · pdf-lib

## Setup

1. `npm install`
2. `cp .env.example .env.local` and fill in the keys (git-ignored; never commit them):

   | Variable | Where |
   |---|---|
   | `GEMINI_API_KEY`, `GEMINI_MODEL` (optional) | https://aistudio.google.com/apikey |
   | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API keys (use the **secret** key) |
   | `GMAIL_USER`, `GMAIL_APP_PASSWORD` | Google Account → Security → App passwords |
   | `ADMIN_PASSCODE` | Any password; guards `/dashboard` |
   | `GEMINI_API_KEY_FALLBACK` (optional) | Extra Gemini keys, comma-separated, used when the main key is out of quota |
   | `RELAY_OFFLINE` (optional) | `1` = agents never call Gemini and use offline templates (safe demo mode) |
   | `SESSION_SECRET` | Any long random string; signs student login cookies |

3. New Supabase project only: run `supabase/schema.sql` in the SQL editor, then optionally `supabase/seed.sql` for the demo event (open `/dashboard/de000000-0000-4000-a000-000000000001`). For demo history (6 past + 2 upcoming events, fictional sponsors, volunteer shifts): `node --env-file=.env.local supabase/seed-history.mjs` (re-runnable).
4. `npm run dev` → http://localhost:3000

## Routes

- `/` — landing
- `/admin/login` → `/dashboard` — organiser home: brief composer with agent picker, lifetime stats, "Needs you" inbox, upcoming events, charts
- `/dashboard/past` — past events, registered vs attended, loyal partners, "Run it again"
- `/dashboard/sponsors` — sponsor directory: every company pitched or partnered, contacts, notes, history per event
- `/dashboard/agents/[agent]` — one page per agent: what it does, run it alone on any event, its history
- `/dashboard/[id]` — event desk (`?s=<agent>` opens an agent page)
- `/e/[id]` — public event registration
- `/student/signup`, `/student/login`, `/student` — student portal: upcoming (registered + open), past events, my certificates

## Checks

```bash
npm run build && npm run lint
node src/lib/schedule.test.ts   # volunteer scheduler self-check
node src/lib/retry.test.ts      # Gemini retry/fallback self-check
node src/lib/offline.test.ts    # offline-mode brief parser self-check
```

## Credits

Fox mascot frames and stills are Higgsfield generations, background-removed offline (BiRefNet) into transparent WebPs in `public/fox/` so the fox keeps its true colours; the cast sheet is hotlinked from their CDN. Lenis loads from jsDelivr at runtime.

## Demo accounts

- **Student:** `ananya.krishnan@example.com` / `Relay@2026` (or click "Use the demo student account" on `/student/login`). Checked in to HackRIT '26, so the certificate downloads.
- **Organiser desk:** `/admin/login` (or click "Open the desk") → enter the `ADMIN_PASSCODE` from `.env.local`.
