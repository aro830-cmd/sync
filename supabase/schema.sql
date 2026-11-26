-- Run once in Supabase → SQL Editor → New query → paste → Run.
-- RLS is on with no policies: only the server (service role key) can read/write.

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  brief text not null,
  name text,
  theme text,
  date date,
  budget int,
  expected_attendees int,
  venue text,
  plan jsonb,
  summary text,
  created_at timestamptz default now()
);

create table if not exists sponsors (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events on delete cascade,
  company text not null,
  contact_email text not null,
  tier text,
  fit_score int,
  pitch_subject text,
  pitch_body text,
  status text not null default 'lead'
    check (status in ('lead','drafted','contacted','replied','confirmed','declined')),
  created_at timestamptz default now()
);

create table if not exists volunteers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events on delete cascade,
  name text not null,
  email text not null,
  skills text,
  profile jsonb -- { dept, year, phone, bio, events_helped, availability }
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events on delete cascade,
  title text not null,
  skill text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  volunteer_id uuid references volunteers on delete set null
);

create table if not exists attendees (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events on delete cascade,
  name text not null,
  email text not null,
  usn text,
  checked_in boolean default false,
  certificate_sent boolean default false,
  created_at timestamptz default now(),
  unique (event_id, email)
);

create table if not exists agent_runs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events on delete cascade,
  agent text not null,
  summary text,
  output jsonb,
  ok boolean default true,
  created_at timestamptz default now()
);

alter table events enable row level security;
alter table sponsors enable row level security;
alter table volunteers enable row level security;
alter table tasks enable row level security;
alter table attendees enable row level security;
alter table agent_runs enable row level security;

-- Student portal accounts. Passwords are scrypt hashes (src/lib/student.ts). Registrations link to attendees by email.
create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  usn text,
  password_hash text not null,
  created_at timestamptz default now()
);
alter table students enable row level security;

-- Later additions live in supabase/migrations/ — run them in order after this file (002 adds the sponsor CRM, volunteer profiles, roles, rewards, incidents, audit log).

-- Added 26 Nov (migration volunteer_profiles) for databases created before it:
alter table volunteers add column if not exists profile jsonb;

-- Decision explainability & appeal trail (migration decisions_audit, 26 Nov).
create table if not exists decisions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events on delete cascade,
  kind text not null,              -- shift | reroute | sponsor | plan
  subject_id uuid,                 -- task / sponsor / event the outcome is about
  subject text not null,
  outcome text not null,
  decided_by text not null,
  why jsonb not null,              -- { rules: [{rule, ok, detail}], considered?: [], scores?: {}, notes?: [] }
  status text not null default 'auto' check (status in ('auto','appealed','upheld','overridden','rejected')),
  appeal jsonb,                    -- latest { type: dispute|override, by, message, proposal? }
  created_at timestamptz default now()
);
create index if not exists decisions_event on decisions (event_id, created_at desc);
create index if not exists decisions_subject on decisions (subject_id);
create table if not exists decision_log (  -- append-only: every status transition
  id uuid primary key default gen_random_uuid(),
  decision_id uuid references decisions on delete cascade,
  event_id uuid references events on delete cascade,
  from_status text,
  to_status text not null,
  actor text not null,
  note text,
  created_at timestamptz default now()
);
create index if not exists decision_log_decision on decision_log (decision_id, created_at);
alter table decisions enable row level security;
alter table decision_log enable row level security;
