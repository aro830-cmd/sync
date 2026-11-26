// Demo event for the Campus Chaos Re-Router: a full upcoming event with volunteer profiles, shifts, sponsors and registrations.
// Also gives the HackRIT '26 volunteers (seed.sql) profiles. All people and companies are fictional (@example.com).
// Re-run to reset after a demo — deletes this event (cascades) and inserts it fresh.
// Run: node --env-file=.env.local supabase/seed-chaos.mjs
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { assignExplained } from "../src/lib/schedule.ts";

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const must = async (p) => {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
};

const EVENT = "de000000-0000-4000-a000-0000000000c1"; // outside seed-history ids (1–99)
const DATE = "2026-12-05";
const vid = (n) => `de000000-0000-4000-c000-0000000000c${(n - 1).toString(16)}`;
const at = (hm) => `${DATE}T${hm}:00+05:30`;

// Optional real inboxes for the live demo (DEMO_VOLUNTEER_EMAILS in .env.local, comma-separated):
// 1st → Nikhil Rao (takes Karthik's shifts), 2nd → Rahul Menon (roster backup). Unset = fictional @example.com.
const [NIKHIL_EMAIL = "nikhil.rao.vol@example.com", RAHUL_EMAIL = "rahul@example.com"] = (process.env.DEMO_VOLUNTEER_EMAILS ?? "")
  .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

// [name, email, skills, dept, year, phone, events_helped, availability, bio]
// Emails match the club roster (seed-history.mjs) so these are the same people. Rahul Menon (AV) and Ishita Das stay
// on the roster only: they're the bench the Re-Router pulls from when Karthik drops out.
const VOLUNTEERS = [
  ["Karthik S", "karthik@example.com", "av, tech, stage", "ISE", 4, "+91 98450 11202", 9, "Full day", "Final-year ISE, two years on the tech crew. Sets up Wi-Fi bridges and stage mics."],
  ["Nikhil Rao", NIKHIL_EMAIL, "tech, av", "CSE", 3, "+91 98450 11208", 5, "After 11 AM", "Backup AV and helpdesk. Has lab exams in the morning."],
  ["Aditi Rao", "aditi@example.com", "registration, design", "ISE", 2, "+91 98450 11203", 4, "Until 4 PM", "Designs the club's posters; fastest at the registration desk with the QR scanner."],
  ["Sneha Iyer", "sneha@example.com", "logistics, hospitality", "CSE", 3, "+91 98450 11204", 7, "Full day", "Owns venue setup and vendor calls. Keeps the run-of-show spreadsheet honest."],
  ["Meera Nair", "meera@example.com", "social, design", "AIML", 2, "+91 98450 11205", 3, "Full day", "Handles live Instagram coverage and reels. Brings her own camera."],
  ["Farhan Ali", "farhan@example.com", "tech, logistics", "ME", 2, "+91 98450 11206", 2, "Until 2 PM", "Second-year mechanical, joined the club this semester. Great with crowds."],
  ["Divya Bhat", "divya.bhat.vol@example.com", "hospitality", "ISE", 1, "+91 98450 11207", 1, "Full day", "First-year volunteer; looks after guest speakers and sponsor reps."],
  ["Priya Kulkarni", "priya.kulkarni.vol@example.com", "registration, stage", "ECE", 2, "+91 98450 11211", 3, "Full day", "Emcee for club events; also runs the afternoon registration desk."],
  ["Tanvi Shah", "tanvi.shah.vol@example.com", "design, social", "ISE", 3, "+91 98450 11209", 4, "Full day", "Photographer and banner designer. Edits the post-event recap video."],
  ["Varun Prasad", "varun.prasad@example.com", "logistics, hospitality", "CIVIL", 4, "+91 98450 11210", 8, "Full day", "Final-year, ex-coordinator. Handles food vendors and lunch lines."],
];

// Profiles for the club roster (volunteers with no event), by email. Karthik is reset to available every run,
// because dropping him in the Re-Router marks him away.
const ROSTER = {
  "rahul@example.com": ["av", { dept: "ECE", year: 3, phone: "+91 98450 11201", events_helped: 6, availability: "Full day", bio: "Runs sound and projection for every club event. Knows where the spare HDMI cables are." }],
  "ishita.das@example.com": ["registration, hospitality", { dept: "ISE", year: 2, phone: "+91 98450 11212", events_helped: 2, availability: "Full day", bio: "Registration desk regular; good with VIP guests." }],
  "karthik@example.com": ["av, tech", null],
};

// [title, skill, start, end]
const TASKS = [
  ["Venue setup & signage", "logistics", "07:30", "09:00"],
  ["Stage sound check", "av", "08:00", "09:00"],
  ["Registration desk (morning)", "registration", "08:00", "10:30"],
  ["Projector & livestream", "av", "09:00", "12:30"],
  ["Breakout room AV", "av", "10:00", "12:00"], // runs alongside the livestream, so both AV people are busy at once
  ["Opening keynote stage", "stage", "09:30", "10:30"],
  ["Guest & speaker hospitality", "hospitality", "09:00", "12:00"],
  ["Instagram live coverage", "social", "09:30", "12:30"],
  ["Wi-Fi & power helpdesk", "tech", "10:30", "13:30"],
  ["Mentor rounds coordination", "logistics", "11:00", "13:00"],
  ["Lunch distribution", "hospitality", "12:30", "14:00"],
  ["Sponsor booth support", null, "13:00", "16:00"],
  ["Workshop hall AV", "av", "14:00", "16:30"],
  ["Registration desk (afternoon)", "registration", "14:00", "15:30"],
  ["Photography", "design", "14:30", "17:00"],
  ["Demo & judging AV", "av", "16:30", "19:00"],
  ["Prize ceremony stage", "stage", "18:30", "19:30"],
  ["Closing & cleanup", null, "19:00", "20:30"],
];

const TIERS = [
  { name: "Title", amount: 25000, perks: ["'Presented by' naming", "Keynote slot", "Logo on all swag"] },
  { name: "Gold", amount: 12000, perks: ["Booth in the main hall", "Judge seat", "Logo on banner"] },
  { name: "Silver", amount: 6000, perks: ["Logo on banner", "Resume book access"] },
];
// [company, tier, fit, status]
const SPONSORS = [
  ["Northwind Cloud", "Title", 93, "confirmed"],
  ["Kestrel Labs", "Gold", 86, "confirmed"],
  ["Orbit Pay", "Silver", 74, "confirmed"],
  ["Lumen Devices", "Silver", 69, "contacted"],
  ["Sundial Robotics", "Gold", 63, "replied"],
];

const ATTENDEES = [
  "Ananya Krishnan", "Vikram Shetty", "Priya Hegde", "Arjun Kulkarni", "Rohan Pai", "Kavya Reddy", "Siddharth Joshi", "Nisha Gowda",
  "Aman Verma", "Ishita Das", "Pooja Murthy", "Shreya Kamath", "Harsh Patil", "Lakshmi Iyer", "Tejas Naik", "Aditya Menon",
  "Sana Sheikh", "Rahul Bhandari", "Meghana Rao", "Kiran Kumar", "Neha Kapoor", "Pranav Desai", "Ritika Jain", "Sameer Khan",
];

// HackRIT '26 (seed.sql) volunteers get profiles too.
const HACKRIT = {
  "de000000-0000-4000-b000-000000000001": { dept: "ISE", year: 2, phone: "+91 98450 22101", events_helped: 4, availability: "Full day", bio: "Poster designer and registration lead." },
  "de000000-0000-4000-b000-000000000002": { dept: "ECE", year: 3, phone: "+91 98450 22102", events_helped: 6, availability: "Full day", bio: "Sound, projection and stage AV." },
  "de000000-0000-4000-b000-000000000003": { dept: "CSE", year: 3, phone: "+91 98450 22103", events_helped: 7, availability: "Full day", bio: "Venue setup, vendors and mentor rounds." },
  "de000000-0000-4000-b000-000000000004": { dept: "ISE", year: 4, phone: "+91 98450 22104", events_helped: 9, availability: "Full day", bio: "Wi-Fi, power and backup AV." },
  "de000000-0000-4000-b000-000000000005": { dept: "AIML", year: 2, phone: "+91 98450 22105", events_helped: 3, availability: "Full day", bio: "Social media and live coverage." },
};

await must(db.from("events").delete().eq("id", EVENT));
await must(db.from("events").insert({
  id: EVENT,
  brief: "TechNova '26, ₹50k, 220 people, 1-day build-a-thon with workshops",
  name: "TechNova '26",
  theme: "A one-day build-a-thon with hands-on workshops",
  date: DATE,
  budget: 50000,
  expected_attendees: 220,
  venue: "Apex Block Seminar Hall",
  created_at: new Date(Date.now() - 20 * 86_400_000).toISOString(),
  plan: {
    kind: "funded",
    budget_split: [
      { head: "Food & refreshments", amount: 17500 },
      { head: "Prizes", amount: 15000 },
      { head: "Swag & printing", amount: 7500 },
      { head: "AV & venue", amount: 6000 },
      { head: "Contingency", amount: 4000 },
    ],
    tiers: TIERS,
    timeline: [
      ["2026-11-10", "Plan locked"], ["2026-11-14", "Sponsor outreach starts"], ["2026-11-18", "Registration opens"],
      ["2026-11-28", "Volunteer briefing, shifts sent"], ["2026-12-03", "Reminder email to attendees"], [DATE, "Event day"],
    ].map(([date, milestone]) => ({ date, milestone })),
    comms: {
      announcement: "TechNova '26 — build something in a day, learn from hands-on workshops. Apex Block Seminar Hall, 5 Dec. Register: {link}",
      reminder_subject: "TechNova '26 is this Saturday",
      reminder_body: "Hi there,\n\nTechNova '26 is on 5 Dec at the Apex Block Seminar Hall, 9 AM sharp. Bring your laptop and college ID.\n\nSee you there!\nTeam TechNova '26",
    },
  },
}));

await must(db.from("volunteers").insert(VOLUNTEERS.map(([name, email, skills, dept, year, phone, events_helped, availability, bio], i) => ({
  id: vid(i + 1), event_id: EVENT, name, email, skills,
  profile: { dept, year, phone, events_helped, availability, bio },
}))));
// Roster members get profiles too (Karthik's comes from his TechNova row); skills reset so the demo starts clean.
const kp = VOLUNTEERS.find((v) => v[1] === "karthik@example.com");
// Rahul's roster row may carry a demo inbox: replace any old copy (either email) with exactly one row.
await must(db.from("volunteers").delete().is("event_id", null).in("email", ["rahul@example.com", RAHUL_EMAIL]));
await must(db.from("volunteers").insert({ event_id: null, name: "Rahul Menon", email: RAHUL_EMAIL, skills: "av" }));
ROSTER[RAHUL_EMAIL] = ROSTER["rahul@example.com"];
if (RAHUL_EMAIL !== "rahul@example.com") delete ROSTER["rahul@example.com"];
for (const [email, [skills, profile]] of Object.entries(ROSTER)) {
  const p = profile ?? { dept: kp[3], year: kp[4], phone: kp[5], events_helped: kp[6], availability: kp[7], bio: kp[8] };
  await must(db.from("volunteers").update({ skills, profile: p }).is("event_id", null).eq("email", email));
}

// Clash-free shifts from the app's own scheduler.
const slots = TASKS.map(([title, skill, s, e]) => ({ title, skill, starts_at: at(s), ends_at: at(e) }));
const { who, why } = assignExplained(slots, VOLUNTEERS.map(([name, , skills], i) => ({ id: vid(i + 1), name, skills })));
const taskRows = await must(db.from("tasks").insert(slots.map((s, i) => ({ ...s, event_id: EVENT, volunteer_id: who[i] }))).select("id"));
// The scheduler's reasons, as the Logistics agent would record them, so "Why?" works before any disruption.
const hhmm = (iso) => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });
const decided = await must(db.from("decisions").insert(slots.map((s, i) => ({
  event_id: EVENT, kind: "shift", subject_id: taskRows[i].id, subject: `${s.title} · ${hhmm(s.starts_at)}–${hhmm(s.ends_at)}`,
  outcome: `Assigned to ${VOLUNTEERS[VOLUNTEERS.findIndex((_, k) => vid(k + 1) === who[i])][0]}`, decided_by: "Logistics scheduler", why: why[i],
  created_at: new Date(Date.now() - 8 * 86_400_000).toISOString(),
}))).select("id, created_at"));
await must(db.from("decision_log").insert(decided.map((d) => ({ decision_id: d.id, event_id: EVENT, to_status: "auto", actor: "Logistics scheduler", note: "Decided automatically", created_at: d.created_at }))));
assert.ok(who.every(Boolean), "every demo shift should start covered");

await must(db.from("sponsors").insert(SPONSORS.map(([company, tier, fit_score, status]) => ({
  event_id: EVENT, company, tier, fit_score, status,
  contact_email: `partners@${company.split(" ")[0].toLowerCase()}.example.com`,
  pitch_subject: "Partner with TechNova '26",
  pitch_body: `Hi ${company} team,\n\nTechNova '26 on 5 Dec brings ~220 students to a one-day build-a-thon. As a ${tier} partner you'd get: ${TIERS.find((t) => t.name === tier).perks.join(", ")}.\n\nWould you like to partner with us?\n\nTeam TechNova '26`,
}))));

await must(db.from("attendees").insert(ATTENDEES.map((name, i) => ({
  event_id: EVENT, name, usn: `1MS23IS${String(200 + i).padStart(3, "0")}`,
  email: `${name.toLowerCase().replace(/ /g, ".")}@example.com`,
  created_at: new Date(Date.now() - (ATTENDEES.length - i) * 5 * 3_600_000).toISOString(),
}))));

await must(db.from("agent_runs").insert([
  ["planner", "Planned TechNova '26 — ₹50,000 across 5 heads, 3 tiers"],
  ["sponsorship", "Drafted 5 pitches — 3 confirmed"],
  ["logistics", `${slots.length} tasks scheduled for ${VOLUNTEERS.length} volunteers — 0 clashes`],
  ["comms", "Registration page live — announcement and reminder drafted"],
].map(([agent, summary], i) => ({ event_id: EVENT, agent, summary, ok: true, created_at: new Date(Date.now() - (10 - i) * 86_400_000).toISOString() }))));

for (const [id, profile] of Object.entries(HACKRIT)) await must(db.from("volunteers").update({ profile }).eq("id", id));

const open = who.filter((w) => !w).length;
console.log(`seeded TechNova '26: ${VOLUNTEERS.length} volunteers, ${slots.length} shifts (${open} open), ${SPONSORS.length} sponsors, ${ATTENDEES.length} attendees`);
console.log("demo: drop Karthik S → 2 shifts go to Nikhil, the overlapping Breakout room AV pulls Rahul Menon off the club roster");
