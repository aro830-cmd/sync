-- Demo data for the finale: one fully-run event so every desk tab has content.
-- Safe to re-run: deletes the demo event (cascades) and inserts it fresh.
-- Fictional companies, all emails @example.com so nothing reaches a real inbox.

delete from events where id = 'de000000-0000-4000-a000-000000000001';

insert into events (id, brief, name, theme, date, budget, expected_attendees, venue, plan, summary, created_at) values (
  'de000000-0000-4000-a000-000000000001',
  'Hackathon, 15 Dec, ₹50k, 200 people',
  'HackRIT ''26',
  '24-hour build sprint on tools for campus life',
  '2026-12-15', 50000, 200, 'Apex Block Seminar Hall',
  $${
    "budget_split": [
      {"head": "Food & refreshments", "amount": 18000},
      {"head": "Prizes", "amount": 15000},
      {"head": "Swag & printing", "amount": 7000},
      {"head": "AV & venue", "amount": 6000},
      {"head": "Contingency", "amount": 4000}
    ],
    "tiers": [
      {"name": "Title", "amount": 25000, "perks": ["Event named 'presented by'", "Keynote slot", "Logo on all swag"]},
      {"name": "Gold", "amount": 15000, "perks": ["Booth in the main hall", "Judge seat", "Logo on banner"]},
      {"name": "Silver", "amount": 8000, "perks": ["Logo on banner", "Resume book access"]},
      {"name": "Community", "amount": 0, "perks": ["Social media shout-out", "Swag table"]}
    ],
    "timeline": [
      {"date": "2026-11-26", "milestone": "Sponsor outreach starts"},
      {"date": "2026-11-30", "milestone": "Registration opens"},
      {"date": "2026-12-05", "milestone": "Sponsors confirmed, swag ordered"},
      {"date": "2026-12-10", "milestone": "Volunteer briefing, shifts sent"},
      {"date": "2026-12-13", "milestone": "Reminder email to attendees"},
      {"date": "2026-12-15", "milestone": "Event day"}
    ],
    "comms": {
      "announcement": "HackRIT '26 is here! 24 hours, 200 builders, one goal: tools that make campus life better. Food, mentors and ₹15,000 in prizes. 15 Dec, Apex Block Seminar Hall. Teams of 2-4, all branches welcome. Register: {link}",
      "reminder_subject": "HackRIT '26 is this Monday — what to bring",
      "reminder_body": "Hi there,\n\nHackRIT '26 starts Monday, 15 Dec at 9:00 AM in the Apex Block Seminar Hall. Check-in opens at 8:00 — bring your college ID and a charged laptop. We'll handle food, Wi-Fi and coffee for all 24 hours.\n\nSee you there!\nTeam HackRIT '26"
    }
  }$$::jsonb,
  'HackRIT ''26 brought 14 student builders to the Apex Block Seminar Hall on 15 December for a 24-hour sprint on tools for campus life, out of 18 who registered. Thank you to Northwind Cloud, our Title partner, and Kestrel Labs, our Gold partner — the event ran because of you. As promised, Northwind Cloud was credited as presenting partner across every announcement and delivered the opening keynote, with its logo on all swag. Kestrel Labs hosted a booth in the main hall, held a seat on the judging panel, and appeared on the event banner. Teams shipped working prototypes for attendance, canteen queues and lab booking. We would be glad to build the next edition with you.',
  now() - interval '2 hours'
);

insert into sponsors (event_id, company, contact_email, tier, fit_score, pitch_subject, pitch_body, status) values
  ('de000000-0000-4000-a000-000000000001', 'Northwind Cloud', 'partners@northwind.example.com', 'Title', 92,
   'Put Northwind Cloud in front of 200 student builders',
   E'Hi Northwind Cloud team,\n\nHackRIT ''26 is a 24-hour hackathon on 15 Dec at RIT, with around 200 students building tools for campus life — most of them deploying to the cloud for the first time.\n\nAs our Title partner (₹25,000) you would be named "presented by" on every announcement, give the opening keynote, and have your logo on all swag. Free credits for teams would put your platform in every demo.\n\nCan we set up a 15-minute call this week?\n\nTeam HackRIT ''26', 'confirmed'),
  ('de000000-0000-4000-a000-000000000001', 'Kestrel Labs', 'hello@kestrel.example.com', 'Gold', 86,
   'Meet the developers you will hire next year',
   E'Hi Kestrel Labs team,\n\nOn 15 Dec, 200 students will spend 24 hours building at HackRIT ''26. A Gold partnership (₹15,000) gives you a booth in the main hall, a seat on the judging panel and your logo on our banner — a direct line to your next intern cohort.\n\nWould you like to join us?\n\nTeam HackRIT ''26', 'confirmed'),
  ('de000000-0000-4000-a000-000000000001', 'Byteforge', 'events@byteforge.example.com', 'Silver', 74,
   'HackRIT ''26 — Silver partnership',
   E'Hi Byteforge team,\n\nHackRIT ''26 brings 200 student developers together on 15 Dec. As a Silver partner (₹8,000) your logo goes on our banner and you get access to the participant resume book.\n\nHappy to share more details.\n\nTeam HackRIT ''26', 'replied'),
  ('de000000-0000-4000-a000-000000000001', 'Tandem Pay', 'devrel@tandempay.example.com', 'Gold', 81,
   'Payments APIs + 200 hackers = demos built on Tandem Pay',
   E'Hi Tandem Pay team,\n\nMany HackRIT ''26 projects will need payments — canteen pre-orders, event tickets, club dues. As a Gold partner (₹15,000) you get a booth, a judge seat and a natural reason for teams to build on your APIs.\n\nCan we talk this week?\n\nTeam HackRIT ''26', 'contacted'),
  ('de000000-0000-4000-a000-000000000001', 'Lumen Devices', 'marketing@lumen.example.com', 'Silver', 63,
   'Hardware track sponsor for HackRIT ''26?',
   E'Hi Lumen Devices team,\n\nWe are running HackRIT ''26 on 15 Dec with 200 students, and a few teams will build hardware. A Silver partnership (₹8,000) puts your logo on the banner and gives you the resume book.\n\nWould this interest you?\n\nTeam HackRIT ''26', 'drafted'),
  ('de000000-0000-4000-a000-000000000001', 'Quill Analytics', 'team@quill.example.com', 'Silver', 55,
   'Data track at HackRIT ''26',
   E'Hi Quill Analytics team,\n\nHackRIT ''26 on 15 Dec will have a data track. As a Silver partner you get banner placement and the resume book.\n\nTeam HackRIT ''26', 'declined');

insert into volunteers (id, event_id, name, email, skills) values
  ('de000000-0000-4000-b000-000000000001', 'de000000-0000-4000-a000-000000000001', 'Aditi Rao', 'aditi@example.com', 'registration, design'),
  ('de000000-0000-4000-b000-000000000002', 'de000000-0000-4000-a000-000000000001', 'Rahul Menon', 'rahul@example.com', 'av'),
  ('de000000-0000-4000-b000-000000000003', 'de000000-0000-4000-a000-000000000001', 'Sneha Iyer', 'sneha@example.com', 'logistics'),
  ('de000000-0000-4000-b000-000000000004', 'de000000-0000-4000-a000-000000000001', 'Karthik S', 'karthik@example.com', 'av, tech'),
  ('de000000-0000-4000-b000-000000000005', 'de000000-0000-4000-a000-000000000001', 'Meera Nair', 'meera@example.com', 'social, design');

-- No volunteer has overlapping shifts; Photography is deliberately left open.
insert into tasks (event_id, title, skill, starts_at, ends_at, volunteer_id) values
  ('de000000-0000-4000-a000-000000000001', 'Venue setup & signage', null, '2026-12-15T07:30:00+05:30', '2026-12-15T09:00:00+05:30', 'de000000-0000-4000-b000-000000000003'),
  ('de000000-0000-4000-a000-000000000001', 'Registration desk', 'registration', '2026-12-15T08:00:00+05:30', '2026-12-15T10:00:00+05:30', 'de000000-0000-4000-b000-000000000001'),
  ('de000000-0000-4000-a000-000000000001', 'AV & projector check', 'av', '2026-12-15T08:00:00+05:30', '2026-12-15T09:30:00+05:30', 'de000000-0000-4000-b000-000000000002'),
  ('de000000-0000-4000-a000-000000000001', 'Social media coverage', 'social', '2026-12-15T09:00:00+05:30', '2026-12-15T12:00:00+05:30', 'de000000-0000-4000-b000-000000000005'),
  ('de000000-0000-4000-a000-000000000001', 'Opening ceremony stage', 'av', '2026-12-15T09:30:00+05:30', '2026-12-15T10:30:00+05:30', 'de000000-0000-4000-b000-000000000004'),
  ('de000000-0000-4000-a000-000000000001', 'Mentor coordination', null, '2026-12-15T10:00:00+05:30', '2026-12-15T13:00:00+05:30', 'de000000-0000-4000-b000-000000000003'),
  ('de000000-0000-4000-a000-000000000001', 'Wi-Fi & power helpdesk', 'tech', '2026-12-15T11:00:00+05:30', '2026-12-15T13:00:00+05:30', 'de000000-0000-4000-b000-000000000004'),
  ('de000000-0000-4000-a000-000000000001', 'Lunch distribution', null, '2026-12-15T12:30:00+05:30', '2026-12-15T14:00:00+05:30', 'de000000-0000-4000-b000-000000000001'),
  ('de000000-0000-4000-a000-000000000001', 'Sponsor booth support', null, '2026-12-15T14:00:00+05:30', '2026-12-15T17:00:00+05:30', 'de000000-0000-4000-b000-000000000005'),
  ('de000000-0000-4000-a000-000000000001', 'Photography', 'design', '2026-12-15T15:00:00+05:30', '2026-12-15T17:00:00+05:30', null),
  ('de000000-0000-4000-a000-000000000001', 'Judging & demo AV', 'av', '2026-12-15T17:00:00+05:30', '2026-12-15T19:00:00+05:30', 'de000000-0000-4000-b000-000000000002'),
  ('de000000-0000-4000-a000-000000000001', 'Closing & cleanup', null, '2026-12-15T18:30:00+05:30', '2026-12-15T20:00:00+05:30', 'de000000-0000-4000-b000-000000000003');

-- 18 registered, first 14 checked in.
insert into attendees (event_id, name, email, usn, checked_in, created_at)
select 'de000000-0000-4000-a000-000000000001', n,
       lower(replace(n, ' ', '.')) || '@example.com',
       '1MS23IS' || lpad(i::text, 3, '0'),
       i <= 14,
       now() - (19 - i) * interval '3 hours'
from unnest(array[
  'Ananya Krishnan','Vikram Shetty','Priya Hegde','Arjun Kulkarni','Divya Bhat','Rohan Pai',
  'Kavya Reddy','Siddharth Joshi','Nisha Gowda','Aman Verma','Ishita Das','Varun Prasad',
  'Pooja Murthy','Nikhil Rao','Shreya Kamath','Harsh Patil','Lakshmi Iyer','Tejas Naik'
]) with ordinality as t(n, i);

insert into agent_runs (event_id, agent, summary, ok, created_at) values
  ('de000000-0000-4000-a000-000000000001', 'planner', 'Planned HackRIT ''26: ₹50,000 across 5 heads, 4 sponsor tiers', true, now() - interval '3 days'),
  ('de000000-0000-4000-a000-000000000001', 'sponsorship', 'Drafted 6 pitches — waiting for your approval to send', true, now() - interval '3 days' + interval '1 minute'),
  ('de000000-0000-4000-a000-000000000001', 'logistics', '12 tasks scheduled for 5 volunteers — 0 clashes, 1 need more hands', true, now() - interval '3 days' + interval '2 minutes'),
  ('de000000-0000-4000-a000-000000000001', 'comms', 'Registration page live at /e/de000000… — announcement and reminder drafted', true, now() - interval '3 days' + interval '3 minutes'),
  ('de000000-0000-4000-a000-000000000001', 'sponsorship', 'Sent 5 pitch emails', true, now() - interval '2 days'),
  ('de000000-0000-4000-a000-000000000001', 'logistics', 'Emailed shifts to 5 volunteers', true, now() - interval '2 days' + interval '5 minutes'),
  ('de000000-0000-4000-a000-000000000001', 'sponsorship', 'Northwind Cloud marked confirmed', true, now() - interval '1 day'),
  ('de000000-0000-4000-a000-000000000001', 'sponsorship', 'Kestrel Labs marked confirmed', true, now() - interval '1 day' + interval '1 hour'),
  ('de000000-0000-4000-a000-000000000001', 'reporting', 'Sponsor report ready — 14 attended, 2 partners', true, now() - interval '2 hours');

-- Demo student login: ananya.krishnan@example.com / Relay@2026 (checked in above, so the certificate is downloadable).
insert into students (name, email, usn, password_hash) values
  ('Ananya Krishnan', 'ananya.krishnan@example.com', '1MS23IS001', '8c07027fb911f3d4fb125b96e3e876c8:c5e46b83bbb3afff6c335edb9c4f552b10138442e3080e668022da046ac04bebe4aeff5ff8a60acec359f58d643809070b5cf5baf2feea819b8c8627e4ec72b0')
on conflict (email) do update set password_hash = excluded.password_hash;
