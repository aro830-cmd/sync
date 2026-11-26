-- Relay migration 002: sponsor intelligence & CRM, volunteer profiles, mission roles, rewards, incidents, audit log.
--
-- HOW TO RUN (project owner, once):
--   Supabase dashboard → your project → SQL Editor → New query → paste this whole file → Run.
-- Safe to run more than once: every statement is "if not exists" / "on conflict do nothing".
-- Only adds tables and columns; nothing existing is dropped or renamed.
-- All tables have RLS on with no policies: only the server (secret key) can read or write them.

-- ───────────────────────── sponsor intelligence (company level) ─────────────────────────

create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  industry text,
  city text,
  website text,
  -- Official, public contact route only (partnerships page, published email). Never private contacts.
  contact_route text,
  contribution_types text[] not null default '{}'
    check (contribution_types <@ array['cash','credits','prizes','hardware','food','venue','mentors','hiring','marketing']),
  est_value int check (est_value >= 0),
  notes text,
  created_at timestamptz default now()
);

-- Every web-derived claim keeps its evidence: URL, date seen, confidence. No source → not stored as a fact.
create table if not exists company_sources (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies on delete cascade,
  claim text not null,
  kind text not null default 'history' check (kind in ('history','profile','contact','news')),
  url text not null check (url ~* '^https?://'),
  source_date date,
  confidence text not null default 'medium' check (confidence in ('high','medium','low')),
  added_at timestamptz default now()
);
create index if not exists company_sources_company on company_sources (company_id);

-- Organisation-wide settings, e.g. the sponsor-fit score weights.
create table if not exists settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);
insert into settings (key, value) values ('fit_weights', '{
  "theme": 25, "local": 15, "student_history": 15, "value": 15, "timeline": 10, "evidence": 10, "relationship": 10
}'::jsonb) on conflict (key) do nothing;

-- ───────────────────────── sponsor deals (event level) ─────────────────────────

alter table sponsors add column if not exists company_id uuid references companies on delete set null;
alter table sponsors add column if not exists contribution_type text
  check (contribution_type in ('cash','credits','prizes','hardware','food','venue','mentors','hiring','marketing'));
alter table sponsors add column if not exists value int check (value >= 0);
-- Deal terms: obligations, exclusivity, data_sharing, branding, payment_terms, reporting, deadline (all text/date).
alter table sponsors add column if not exists terms jsonb not null default '{}'::jsonb;
alter table sponsors add column if not exists proposal_sent_at timestamptz;
create index if not exists sponsors_company on sponsors (company_id);

-- Payment reliability comes only from what we record here — never inferred from the web.
create table if not exists sponsor_payments (
  id uuid primary key default gen_random_uuid(),
  sponsor_id uuid not null references sponsors on delete cascade,
  label text not null,
  amount int not null check (amount >= 0),
  received_amount int not null default 0 check (received_amount >= 0),
  due_date date,
  status text not null default 'planned'
    check (status in ('planned','invoice_sent','committed','partially_received','received','overdue','disputed')),
  note text,
  updated_at timestamptz default now()
);
create index if not exists sponsor_payments_sponsor on sponsor_payments (sponsor_id);

create table if not exists sponsor_deliverables (
  id uuid primary key default gen_random_uuid(),
  sponsor_id uuid not null references sponsors on delete cascade,
  item text not null,
  due_date date,
  done boolean not null default false,
  evidence_url text,
  done_at timestamptz
);
create index if not exists sponsor_deliverables_sponsor on sponsor_deliverables (sponsor_id);

-- ───────────────────────── volunteers ─────────────────────────

-- Opt-in profiles. Matching uses skills, roles, availability and load only — no sensitive attributes or proxies.
create table if not exists volunteer_profiles (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  student_id uuid references students on delete set null,
  skills text[] not null default '{}',
  preferred_roles text[] not null default '{}',
  -- [{"date":"2026-12-15","from":"08:00","to":"14:00"}] or [{"weekday":6,"from":"09:00","to":"18:00"}]
  availability jsonb not null default '[]'::jsonb,
  available boolean not null default true,
  learning_goals text,
  reward_prefs text[] not null default '{}',
  languages text[] not null default '{}',
  accessibility_needs text,
  opted_in boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Mission-style roles with everything a volunteer needs to know before saying yes.
create table if not exists roles (
  key text primary key,
  name text not null,
  responsibilities text not null,
  expected_hours numeric not null check (expected_hours > 0),
  skills text[] not null default '{}',
  learning_outcomes text not null,
  supervisor text not null,
  reward text not null,
  escalation text not null,
  sort int not null default 0
);
insert into roles (key, name, responsibilities, expected_hours, skills, learning_outcomes, supervisor, reward, escalation, sort) values
  ('sponsor_liaison','Sponsor liaison','Greet partners, run their booth schedule, make sure every promised branding item is delivered and photographed.',6,'{hospitality,communication}','Client management, delivering on commitments','Sponsorship lead','Recommendation letter + certificate','Sponsorship lead, then event head',1),
  ('hacker_concierge','Hacker concierge','Help teams with Wi-Fi, power, rooms and rules; route technical questions to mentors.',5,'{tech,communication}','Support triage, staying calm under pressure','Operations lead','Meals + merch + certificate','Operations lead',2),
  ('demo_floor_captain','Demo-floor captain','Run the judging floor: queue teams, keep time, guide judges between tables.',4,'{logistics,av}','Running a schedule live, coordinating people','Judging lead','Priority access to next event + certificate','Judging lead, then event head',3),
  ('mentor_coordinator','Mentor coordinator','Match mentors to teams that ask for help and keep the mentor rota moving.',5,'{hospitality,tech}','Matching needs to expertise, networking','Programme lead','Mentor session + certificate','Programme lead',4),
  ('community_storyteller','Community storyteller','Capture photos, short videos and quotes; post updates on the club channels.',6,'{social,design}','Content creation, writing for social media','Comms lead','Portfolio credit + merch + certificate','Comms lead',5),
  ('accessibility_ambassador','Accessibility ambassador','Check routes, seating and materials are accessible; be the go-to person for access requests.',5,'{hospitality}','Inclusive event design','Event head','Recommendation letter + certificate','Event head',6),
  ('check_in_lead','Check-in lead','Run the registration desk and the check-in list; hand out badges and swag.',4,'{registration}','Process ownership, crowd handling','Operations lead','Meals + certificate','Operations lead',7),
  ('livestream_producer','Social/livestream producer','Run the stream and stage AV: mics, slides, recording.',6,'{av,social}','Live production, AV setup','AV lead','Merch + certificate','AV lead, then event head',8),
  ('sustainability_lead','Sustainability lead','Plan waste sorting, reusable serving and leftover-food handover.',4,'{logistics}','Sustainable operations planning','Operations lead','Certificate + recognition on stage','Operations lead',9)
on conflict (key) do nothing;

-- Requests flow: suggested (by the matcher, with a reason) → requested → accepted/declined → completed.
create table if not exists role_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events on delete cascade,
  role_key text not null references roles on delete cascade,
  profile_id uuid not null references volunteer_profiles on delete cascade,
  status text not null default 'suggested' check (status in ('suggested','requested','accepted','declined','completed')),
  reason text,
  overridden boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (event_id, role_key, profile_id)
);
create index if not exists role_requests_event on role_requests (event_id);
create index if not exists role_requests_profile on role_requests (profile_id);

-- Only actionable signals; organisers can correct them and volunteers can see the ones marked visible.
create table if not exists volunteer_feedback (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references volunteer_profiles on delete cascade,
  event_id uuid references events on delete set null,
  kind text not null check (kind in ('completed','no_show','late','kudos','note')),
  note text,
  visible_to_volunteer boolean not null default true,
  corrected boolean not null default false,
  created_at timestamptz default now()
);
create index if not exists volunteer_feedback_profile on volunteer_feedback (profile_id);

create table if not exists rewards (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references volunteer_profiles on delete cascade,
  event_id uuid references events on delete set null,
  kind text not null check (kind in ('certificate','meal','merch','reimbursement','recommendation','mentor_session','priority_access')),
  status text not null default 'promised' check (status in ('promised','delivered')),
  note text,
  delivered_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists rewards_profile on rewards (profile_id);

-- ───────────────────────── command centre ─────────────────────────

create table if not exists incidents (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events on delete cascade,
  title text not null,
  severity text not null default 'medium' check (severity in ('low','medium','high')),
  status text not null default 'open' check (status in ('open','resolved')),
  note text,
  created_at timestamptz default now(),
  resolved_at timestamptz
);
create index if not exists incidents_event on incidents (event_id);

-- Who did what: sponsor status changes, outreach, payments, task assignments, reward delivery.
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  actor text not null default 'organiser',
  event_id uuid references events on delete set null,
  entity text not null,
  entity_id uuid,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);
create index if not exists audit_log_event on audit_log (event_id, created_at desc);

-- ───────────────────────── security ─────────────────────────

alter table companies enable row level security;
alter table company_sources enable row level security;
alter table settings enable row level security;
alter table sponsor_payments enable row level security;
alter table sponsor_deliverables enable row level security;
alter table volunteer_profiles enable row level security;
alter table roles enable row level security;
alter table role_requests enable row level security;
alter table volunteer_feedback enable row level security;
alter table rewards enable row level security;
alter table incidents enable row level security;
alter table audit_log enable row level security;

-- ───────────────────────── backfill from what already exists ─────────────────────────

-- Every sponsor company becomes a company record, and sponsors link to it.
insert into companies (name) select distinct company from sponsors on conflict (name) do nothing;
update sponsors s set company_id = c.id from companies c where s.company_id is null and c.name = s.company;

-- The club roster (volunteers with no event) becomes opt-in profiles; "away" in skills means not available.
insert into volunteer_profiles (email, name, skills, available)
select distinct on (email) email, name,
       coalesce(array_remove(string_to_array(regexp_replace(coalesce(skills, ''), '\s', '', 'g'), ','), 'away'), '{}'),
       position('away' in coalesce(skills, '')) = 0
from volunteers where event_id is null
on conflict (email) do nothing;
