# Progress — PS-CA2 build

Claude's working memory for this project. Read this first when resuming. See `ARCHITECTURE.md` for design.

**Deadline:** Finale 26 Nov 2026, 9:00 AM – 1:00 PM. Build day: 25 Nov.

## Decisions (from user, 25 Nov)

- Problem: PS-CA2 (Campus Automation) — the PDF has only the title, no detailed brief.
- Stack: Next.js + TypeScript · LLM: Gemini only · Storage: Supabase · Email: Gmail SMTP
- Real actions (all four): sponsor emails, registration + certificates, sponsor tracker + report, schedule & task assignment
- Landing hero: big editorial type + floating product mock, scroll animations
- UI: premium / niche, Emil Kowalski style, no "AI slop" (no emilkowalski skill installed — principles applied by hand)

## Status

- [x] Architecture + progress docs
- [x] Scaffold (Next 16.4, Tailwind v4, motion, fonts)
- [x] Landing page — verified in browser
- [x] Supabase schema (`supabase/schema.sql`) + server-only DB client
- [x] Gemini `llm()` helper
- [x] 5 agents + runAgent (sequential, live UI) — `src/app/actions.ts`
- [x] Dashboard: new event, events list, event desk (pipeline, Overview/Sponsors/Schedule/People/Report tabs) — desk verified visually with mock data
- [x] Public registration page `/e/[id]`
- [x] Email: pitches (after approval), volunteer shifts, confirmation, reminders, certificates, report
- [x] Certificate + sponsor report PDFs — verified rendered
- [x] Scheduler self-check `node src/lib/schedule.test.ts` passes
- [x] `npm run build`, tsc, eslint all clean
- [x] Supabase project `synchronise` (ref orzkpoknrjbvohqyqdct, ap-south-1) created, schema applied, URL in `.env.local`
- [x] Supabase key in `.env.local`, insert/delete verified 25 Nov
- [x] Gmail working — registration confirmation email received 25 Nov
- [x] Live end-to-end run 26 Nov: all 5 agents OK on a fresh event (Planner → Sponsorship 3/3 pitches → Logistics 14 tasks/0 clashes → Comms → Reporting)
- [x] Mobile layout check — landing OK at 390px (closing headline slides in on scroll, ends in view). `/e/[id]` OK at 390px. Dashboard not yet checked on mobile
- [x] Seed data: `supabase/seed.sql` (HackRIT '26, id de000000-0000-4000-a000-000000000001, fictional sponsors, all @example.com) — loaded into Supabase
- [x] Student portal (signup/login/portal/certificate) — verified 25 Nov: signup, register, check-in → PDF download, wrong password rejected, forged cookie 401, mobile OK
- [x] Premium login/signup: split layout, route group `student/(auth)` with shared `AuthLayout` (animated pill switch, ticket), floating labels, show/hide, strength meter, demo-account button; fields kept after errors — verified 26 Nov
- [x] Demo student `ananya.krishnan@example.com` / `Relay@2026` (in seed.sql + live DB)
- [x] Organiser UX: Next-step bar, edit drafted pitches, check-in search, student-login link on /e/[id], tabs scroll on mobile (dashboard mobile OK) — verified 26 Nov
- [x] Organiser login page `/admin/login` replaces the browser Basic-auth popup — verified 26 Nov: redirect with ?next, wrong passcode rejected, actions + report PDF work, forged cookie rejected, logout, mobile OK
- [x] Premium dark dashboard (26 Nov): sidebar with a button per agent, per-agent pages with charts (budget split, timeline, sponsor funnel, fit scores, shift Gantt, hours per volunteer, registrations line, check-in/attendance meters, partner contributions). Chart palette validated with dataviz validator on #141416. Verified all 5 pages desktop + mobile (no overflow), tooltips, live Comms run
- [x] Fox + unified dark-orange theme (26 Nov): new landing (scroll-scrubbed fox per the Novu brief, adapted to Relay), fox card in desk sidebar, fox backdrop on login pages, global tokens flipped to warm dark (#0c0907 / #f5ede5 / #ff5a1f), desk palette orange-first (validated). Verified landing desktop (first frame ~1–2s, orbit + panels + cast) and phone (stills, no overflow), all pages restyled
- [ ] Demo script for finale

## Notes / log

- 25 Nov: landing done. Dashboard + agents + PDFs + registration done. Everything that needs keys is untested live.
- 25 Nov (later): Supabase project created via MCP in ap-south-1, `supabase/schema.sql` applied as migration `initial_schema`. Security advisor only flags "RLS enabled, no policy" — intended. Secret key (`sb_secret_`) works with supabase-js 2.119 in `SUPABASE_SERVICE_ROLE_KEY`; verified by insert+delete on `events`. README rewritten from the create-next-app boilerplate.
- Next 16: read `node_modules/next/dist/docs/` before unfamiliar APIs. Cache Components on → DB reads go inside `<Suspense>`; `/dashboard` list uses `connection()`.
- `"use server"` files may only export async functions — shared consts live in `src/lib/agents.ts`.
- Global `:focus-visible` style is in `@layer base` so Tailwind utilities can override it.
- 25 Nov (evening): dev server on :3123 died with "Jest worker encountered 2 child process exceptions" after ~4h — OneDrive syncing node_modules. Fix = restart `npm run dev`. Consider pausing OneDrive sync during the finale.
- 25 Nov (night): student portal added. `students` table applied as migration `students`. `SESSION_SECRET` generated into `.env.local`. Known gaps: no email verification (anyone can sign up with any email and see that email's registrations/certificates), no login rate limit, login form clears email on wrong password.
- 26 Nov: **gemini-2.5-flash is retired for new keys (404)** → default + `.env.local` now `gemini-3.8-flash`. It often returns 503 "high demand", so `src/lib/retry.ts` adds: 35s per-call timeout, 1 retry, then fallback to `gemini-3.6-flash` → `gemini-3.5-flash` (only on 429/500/503/504; bad key etc. fail fast). Self-check `node src/lib/retry.test.ts`. A full pipeline takes ~2–3 min when the main model is busy.
- 26 Nov: Planner re-run now merges into `plan` (used to wipe `plan.comms`). Sponsorship maps pitches by small index, not UUID.
- Testing the desk with Playwright: log in via `http://admin:<pass>@localhost:3000/dashboard` once, then navigate to the plain URL (fetch refuses URLs with credentials).

- 26 Nov: Turbopack sometimes misses edits to `globals.css` (OneDrive). If a style change doesn't show, append a newline to the file or restart `npm run dev`.

- 26 Nov (late): Dashboard v2 in phases — (1) Planner free/funded (`plan.kind`), Sponsorship recommends 8 real companies (`plan.suggestions`, accept with an email / dismiss), free report copy, `supabase/seed-history.mjs` demo history; (2) new home, past events, per-agent pages with run-alone, animated charts in `fx.tsx`, palette s1 #ec6426 / s4 #c08304 re-validated; (3) event desk deep links `?s=`, composer agent picker `?run=`, free-event views; (4) student portal upcoming / past / certificates; (5) landing: cast carousel replaced by scroll-revealed "How it works". No schema change (all new fields live in `events.plan`). Gemini quota was exhausted at the end of the session, so recommendation output wasn't verified live (UI was).
- 26 Nov (morning): llm() now tries every model × key (best model on both keys first), skips a quota-limited option without retrying, and if all are out of quota waits 20s and tries once more before a clear error. Fixes Planner failing with "exceeded your current quota" while the fallback key still had room.
- 26 Nov (dawn): Phase 2 batch — detailed multi-page report PDF; voice input in the composer (Web Speech API); Edit details dialog (values pinned in `plan.fixed`, re-run chosen agents); fox mascot as app icon + logo; sponsor directory `/dashboard/sponsors` with fictional profiles and "Partnered before" one-click leads on each event; seed now has 6 past events with shifts. Gemini fallback key switches immediately on quota errors. Verified: create-from-brief lands in Coming up, edit budget saves + pins, PDFs render (funded 3 pages, free 2 pages).
