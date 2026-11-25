# Contributing to Relay

Onboarding for collaborators. Read this once, then `ARCHITECTURE.md` (how it works) and `PROGRESS.md` (what's done and what's next).

## 1. Get access

This repository is **private**.

1. Send the owner your **GitHub username**.
2. The owner adds you: repo **Settings → Collaborators → Add people**.
3. Accept the invitation from the email GitHub sends you (or from https://github.com/notifications).

## 2. Clone

```bash
git clone https://github.com/aro830-cmd/sync.git
cd sync
```

Because the repo is private, Git asks you to sign in. On Windows/macOS the Git Credential Manager opens a browser login. Otherwise use a GitHub [personal access token](https://github.com/settings/tokens) as the password, or clone with GitHub Desktop.

> Don't keep the project inside a OneDrive/Dropbox-synced folder — syncing `node_modules` crashes the dev server.

## 3. Install

Requires **Node.js 20+** (developed on Node 24) and npm.

```bash
npm install
```

## 4. Environment variables

**Nothing to do — the repo already contains `.env.local` with the team's shared keys** (committed on purpose; the repo is private). Cloning gives you a working setup.

These are live keys for the shared database, Gmail account and Gemini quota, so:

- never copy them into issues, PRs, chats, screenshots or another repo;
- don't commit changes to `.env.local` unless the owner asks — if you need different values locally, tell Git to ignore your edits: `git update-index --skip-worktree .env.local`;
- if the repo is ever made public or someone leaves, the owner must rotate every key.

Prefer your own keys instead? Create free accounts and put the values in `.env.local` (skip-worktree as above) —
  - Gemini key: https://aistudio.google.com/apikey
  - Supabase project: create one, then run `supabase/schema.sql` and (optional) `supabase/seed.sql` in its SQL editor
  - Gmail app password for a test Gmail account
  - any `ADMIN_PASSCODE` and a random `SESSION_SECRET`

## 5. Run

```bash
npm run dev
```

Open http://localhost:3000.

| Page | URL | Login |
|---|---|---|
| Landing | `/` | — |
| Organiser desk | `/admin/login` → `/dashboard` | `ADMIN_PASSCODE` |
| Student portal | `/student/login` | demo: `ananya.krishnan@example.com` / `Relay@2026` (seed data) |
| Public registration | `/e/de000000-0000-4000-a000-000000000001` | — |

The fox animation and the cast images load from external CDNs, so they need an internet connection.

## 6. Making changes

1. Pull first: `git pull`
2. Branch off `main`: `git checkout -b your-name/short-description`
3. Make the change. This project uses **Next.js 16**, which differs from older versions — check `node_modules/next/dist/docs/` before using an unfamiliar API (see `AGENTS.md`).
4. Run the checks — all must pass:
   ```bash
   npx tsc --noEmit
   npm run lint
   node src/lib/schedule.test.ts
   node src/lib/retry.test.ts
   npm run build
   ```
5. Commit and push your branch, then open a **pull request** into `main`. Describe what changed and how you tested it; add a screenshot for UI changes.
6. Don't push directly to `main`.

## 7. Where things live

| Area | Files |
|---|---|
| The 5 agents + all server actions | `src/app/actions.ts` |
| Gemini, Supabase, Gmail helpers | `src/lib/server.ts`, `src/lib/retry.ts` |
| Organiser dashboard | `src/app/dashboard/`, `src/components/desk/` |
| Student portal | `src/app/student/`, `src/components/student/` |
| Landing + fox animation | `src/components/landing/RelayLanding.tsx`, `src/app/landing.css`, `src/lib/fox.ts`, `src/components/FoxCanvas.tsx` |
| Database | `supabase/schema.sql`, `supabase/seed.sql` |

## 8. Rules

- **Never commit new secrets.** `.env.local` is shared on purpose; every other `.env*` file is git-ignored, and `.env.example` must stay value-free.
- Keep `PROGRESS.md` current when you finish a piece of work.
- Database changes: add them to `supabase/schema.sql` so others can reproduce them, and tell the team if the shared project needs a migration.
- Emails go to real inboxes — use `@example.com` addresses for test data.

## Troubleshooting

| Problem | Fix |
|---|---|
| "X is missing — add it to .env.local" | A variable is empty; fill it and restart `npm run dev` |
| Agents fail with "Gemini: …high demand" | Temporary; the app retries and falls back automatically — run the agent again |
| A CSS change doesn't show | Restart `npm run dev` (or save `src/app/globals.css` again) |
| "Another next dev server is already running" | Stop the other one, or use the URL it prints |
| Can't clone / 404 on the repo | You haven't accepted the collaborator invite yet, or you're signed into a different GitHub account |
