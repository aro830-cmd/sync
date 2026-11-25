# Architecture — PS-CA2: Multi-Agent Technical Club Event & Sponsorship Lifecycle Orchestrator

Product name: **Relay**. Synchronise 2026 (RIT, Dept. of ISE). Rule from the brief: **end-to-end automated workflows, not prompt wrappers.**
Every agent ends in a real side effect: a DB row, a sent email, a generated PDF. Gemini only *proposes* (JSON); our code *acts*.

## Stack

| Layer | Choice |
|---|---|
| App | Next.js 16 (App Router, Cache Components on) + TypeScript |
| Styling / motion | Tailwind v4, `motion` |
| LLM | Gemini (`@google/genai`), JSON output, model via `GEMINI_MODEL` (default `gemini-3.8-flash`); `src/lib/retry.ts` = timeout + retry + fallback models |
| DB | Supabase Postgres (project `synchronise`, ref `orzkpoknrjbvohqyqdct`, ap-south-1), accessed **only server-side** with the secret key `sb_secret_…` in `SUPABASE_SERVICE_ROLE_KEY` (RLS on, no policies) |
| Email | Nodemailer + Gmail SMTP app password |
| PDF | `pdf-lib` (certificates, sponsor report) |
| Auth | Organiser login page `/admin/login` (passcode = `ADMIN_PASSCODE`) sets signed cookie `relay_admin` (12h, `src/lib/token.ts`); `src/proxy.ts` redirects `/dashboard` to it (401 for `/api/report`); `requireAdmin()` re-checks the cookie in every organiser Server Action |
| Student auth | Own accounts in `students` (scrypt hash, `node:crypto`), HMAC-signed httpOnly cookie `relay_student` (30 days, `SESSION_SECRET`). No email verification yet |

## Pipeline

```
"Hackathon, 15 Dec, ₹50k, 200 people"  (+ optional sponsor leads, volunteers)
        │ createEvent()
        ▼
EventDesk (client) calls runAgent(event, name) for each agent IN ORDER, UI updates live after each
        │
  Planner ──▶ Sponsorship ──▶ Logistics ──▶ Comms ──▶ Reporting
     │            │               │            │           │
 events.plan   sponsors →      tasks rows   plan.comms   events.summary
 (budget,      "drafted"       via assign() (announce,   + report PDF
  tiers,       + pitch         = 0 clashes   reminder)
  timeline)       │                             │
                  ▼ HUMAN GATE                  ▼
           "Approve & send" → SMTP      register page /e/[id], reminders,
           status → contacted           certificates (PDF) to checked-in
```

Every run is logged to `agent_runs` → activity feed + pipeline card status. Planner failure stops the chain.
The composer picks which agents run (`?run=planner,comms`); any agent can also run alone from its page.
**Free events:** the Planner sets `plan.kind = "free"` (seminars, talks, no budget) → budget 0, no tiers, Sponsorship skipped, report addressed to the club.
**Edit details:** organiser edits (brief, name, date, venue, budget, seats, funded/free) are pinned in `plan.fixed`; a Planner re-run plans around them. The edit dialog can re-run any chosen agents.
**Voice:** the composer's mic uses the browser Web Speech API (en-IN) — hidden where unsupported.
**Recommended sponsors:** Sponsorship asks Gemini for 8 real companies → `plan.suggestions` (no emails); the organiser adds a contact to turn one into a lead.
Agents with no input (no leads / no volunteers) skip with a message instead of failing.

## Files

| Path | What |
|---|---|
| `src/app/page.tsx`, `src/app/landing.css`, `src/components/landing/RelayLanding.tsx` | Landing: giant wordmark, scroll-scrubbed fox behind hero + pinned story, cast carousel (6 characters = 5 agents + you), menu, RELAYBAR/Space stepper, Lenis smooth scroll. Stills on phones / reduced motion |
| `src/lib/fox.ts`, `src/components/FoxCanvas.tsx`, `src/components/FoxBackdrop.tsx` | Fox engine: 241 pre-cut transparent WebP frames (`public/fox/NNN.webp`, matted offline from the Kling clip) fetched once → blobs → LRU ImageBitmaps → canvas with sub-frame blend. The fox is drawn in true colour over a hot gradient. Also in the desk sidebar (each section owns a slice of the orbit) and the login side panels |
| `src/app/actions.ts` | **All** Server Actions: 5 agents, `runAgent`, organiser actions (send pitches, set status, email shifts, reminders, certificates, report), public `register` |
| `src/lib/server.ts` | `db()`, `llm()`, `sendMail()`, `requireAdmin()` |
| `src/lib/schedule.ts` (+ `.test.ts`) | Deterministic volunteer assignment, no overlaps |
| `src/lib/pdf.ts`, `src/lib/report.ts` | Certificate + multi-page report PDF (cover with mascot, KPIs, summary, registrations chart, budget, sponsor funnel + partners, tiers, timeline, run-of-show) |
| `src/app/dashboard/sponsors/page.tsx`, `src/lib/partners.ts` | Sponsor directory; fictional company profiles (contact, notes) |
| `src/components/FoxMark.tsx`, `src/app/icon.png` | Fox mascot app icon (favicon + every Relay wordmark) |
| `src/lib/agents.ts`, `src/lib/types.ts` | Agent list, row types |
| `src/app/dashboard/page.tsx` | Organiser home: composer + agent picker, lifetime KPIs, "Needs you" inbox, health rings, upcoming cards, reach trend, activity heatmap |
| `src/app/dashboard/past/page.tsx`, `src/app/dashboard/agents/[agent]/page.tsx` | Past events archive; per-agent pages (about, run alone via `RunPanel`, history) |
| `src/lib/desk.ts` | `allEvents()` — every event with children, split upcoming/past |
| `src/components/desk/{fx,EventCard,RunPanel,nav}.tsx` | Animated charts (count-up, sparkline, area trend, rings, heatmap, paired bars), event card, single-agent runner, home sidebar |
| `src/app/dashboard/[id]/page.tsx`, `src/components/desk/EventDesk.tsx` | Event desk (dark): sidebar with Overview + one page per agent (Planner, Sponsorship, Logistics, Comms, Reporting), each with stat tiles + charts |
| `src/components/desk/{shell,charts,ui,icons}.tsx` | App shell (sidebar / mobile pills), SVG charts (segmented bar, bar list, line, shift timeline, milestones, meter — all with hover tooltips), dark UI kit |
| `src/app/e/[id]/page.tsx`, `src/components/RegisterForm.tsx` | Public registration |
| `src/app/api/report/[id]/route.ts` | Report PDF download |
| `src/lib/student.ts` | Password hashing, session cookie, `currentStudent()` |
| `src/app/student/*` (`(auth)/` group shares `AuthLayout`), `src/components/student/AuthForm.tsx`, `AuthLayout.tsx` | Student portal: `/student/signup`, `/student/login`, `/student` (my registrations, one-tap register, certificate) |
| `src/app/api/certificate/[id]/route.ts` | Signed-in, checked-in student downloads own certificate |
| `supabase/schema.sql`, `supabase/seed.sql` | Tables, demo event |

## Data model

`events` (`plan` jsonb also holds `kind` and `suggestions`), `sponsors` (status: lead → drafted → contacted → replied → confirmed | declined), `volunteers`, `tasks`, `attendees` (unique per event+email), `agent_runs`, `students` (portal accounts; linked to `attendees` by email). See `supabase/schema.sql`.

## UI direction

Emil Kowalski–style restraint: warm paper `#f3f0e8`, ink `#161513`, one accent `#d4441f`, hairlines, Instrument Serif + Geist + Geist Mono, ease `cubic-bezier(.23,1,.32,1)`, short durations, `prefers-reduced-motion` respected. No gradients, glass, emoji, purple.
