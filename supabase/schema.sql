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
  skills text
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
