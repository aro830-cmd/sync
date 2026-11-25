// Demo history on top of seed.sql: six past events and two upcoming ones, with fictional sponsors (all @example.com).
// Safe to re-run — deletes these fixed ids (cascades) and inserts them fresh.
// Run: node --env-file=.env.local supabase/seed-history.mjs
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const id = (n) => `de000000-0000-4000-a000-0000000000${String(n).padStart(2, "0")}`;
const must = async (p) => {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
};
const day = (d, h = 10) => new Date(`${d}T${String(h).padStart(2, "0")}:00:00+05:30`);
const iso = (t) => t.toISOString();

const NAMES = [
  "Ananya Krishnan", "Vikram Shetty", "Priya Hegde", "Arjun Kulkarni", "Divya Bhat", "Rohan Pai", "Kavya Reddy", "Siddharth Joshi",
  "Nisha Gowda", "Aman Verma", "Ishita Das", "Varun Prasad", "Pooja Murthy", "Nikhil Rao", "Shreya Kamath", "Harsh Patil",
  "Lakshmi Iyer", "Tejas Naik", "Aditya Menon", "Sana Sheikh", "Rahul Bhandari", "Meghana Rao", "Kiran Kumar", "Neha Kapoor",
  "Pranav Desai", "Ritika Jain", "Sameer Khan", "Tanvi Shah", "Yash Agarwal", "Zoya Mirza", "Gautam Nair", "Bhavana Shetty",
];

const tiers = (title, gold, silver) => [
  { name: "Title", amount: title, perks: ["'Presented by' naming", "Keynote slot", "Logo on all swag"] },
  { name: "Gold", amount: gold, perks: ["Booth in the main hall", "Judge seat", "Logo on banner"] },
  { name: "Silver", amount: silver, perks: ["Logo on banner", "Resume book access"] },
  { name: "Community", amount: 0, perks: ["Social shout-out", "Swag table"] },
];

// [n, name, theme, date, budget|0 (free), expected, venue, registered, checked, sponsors[[company, tier, fit, status]], summary]
const EVENTS = [
  [8, "HackRIT '25", "24-hour hackathon on tools for the city", "2025-12-13", 45000, 180, "Apex Block Seminar Hall", 154, 121,
    [["Northwind Cloud", "Title", 91, "confirmed"], ["Kestrel Labs", "Gold", 83, "confirmed"], ["Bluebird Bank", "Silver", 66, "confirmed"], ["Quill Analytics", "Silver", 49, "declined"]],
    "HackRIT '25 hosted 121 builders of 154 registered on 13 December. Northwind Cloud (Title), Kestrel Labs (Gold) and Bluebird Bank (Silver) made it possible; every promised perk was delivered, from the keynote to banner placement. 29 teams demoed civic tools."],
  [9, "Design Sprint: Campus Apps", "A one-day product design sprint", "2026-03-14", 15000, 70, "ISE Seminar Room", 66, 58,
    [["Copperleaf Studio", "Gold", 88, "confirmed"], ["Orbit Pay", "Silver", 70, "confirmed"], ["Ferrum Systems", "Silver", 61, "declined"]],
    "Design Sprint: Campus Apps brought 58 students of 66 registered into the ISE Seminar Room on 14 March. Copperleaf Studio (Gold) ran portfolio reviews and Orbit Pay (Silver) judged the payments challenge. Twelve teams shipped clickable prototypes."],
  [2, "CloudCraft Workshop", "Hands-on deploys on serverless and containers", "2026-08-22", 20000, 90, "ISE Lab 3, Main Block", 76, 64,
    [["Northwind Cloud", "Gold", 90, "confirmed"], ["Ferrum Systems", "Silver", 72, "confirmed"], ["Tidepool Data", "Silver", 58, "declined"]],
    "CloudCraft Workshop brought 64 students into ISE Lab 3 on 22 August, out of 76 who registered. Northwind Cloud (Gold) ran the deploy lab and Ferrum Systems (Silver) sponsored credits; both logos appeared on every banner. Every attendee shipped a container to production by lunch."],
  [3, "AI Ethics Seminar", "Bias, consent and open models — a panel and Q&A", "2026-09-12", 0, 120, "APJ Abdul Kalam Seminar Hall", 104, 88, [],
    "The AI Ethics Seminar filled the Kalam Seminar Hall with 88 attendees of 104 registered on 12 September. The panel on bias and consent ran 20 minutes over on audience questions. Next time: a bigger hall and a live poll."],
  [4, "DevSprint 2026", "A 24-hour hackathon on developer tooling", "2026-10-04", 60000, 180, "Apex Block Seminar Hall", 162, 131,
    [["Northwind Cloud", "Title", 94, "confirmed"], ["Kestrel Labs", "Gold", 86, "confirmed"], ["Lumen Devices", "Silver", 70, "confirmed"], ["Orbit Pay", "Silver", 68, "confirmed"], ["Quill Analytics", "Silver", 52, "declined"]],
    "DevSprint 2026 hosted 131 builders of 162 registered for 24 hours on 4 October. Thank you to Northwind Cloud (Title), Kestrel Labs (Gold), Lumen Devices and Orbit Pay (Silver). Every promised perk was delivered: keynote, booth, judging seats and banner placement. 38 teams demoed."],
  [5, "Open Source Saturday", "Your first pull request, live", "2026-11-08", 0, 60, "Library Seminar Room", 58, 47, [],
    "Open Source Saturday on 8 November had 47 attendees of 58 registered; 31 opened their first pull request before the session ended. Next time: pre-picked good-first-issues per table."],
  [6, "Byte Bash '27", "Inter-college coding fest with three tracks", "2027-01-24", 80000, 300, "Main Auditorium", 23, 0,
    [["Northwind Cloud", "Title", 93, "replied"], ["Kestrel Labs", "Gold", 84, "contacted"], ["Orbit Pay", "Gold", 77, "drafted"], ["Ferrum Systems", "Silver", 71, "drafted"], ["Sundial Robotics", "Silver", 64, "lead"], ["Peregrine Games", "Silver", 60, "lead"]], null],
  [7, "Intro to LLMs Seminar", "How large language models work, without the maths", "2026-12-12", 0, 150, "APJ Abdul Kalam Seminar Hall", 41, 0, [], null],
];

const AGENT_ORDER = ["planner", "sponsorship", "logistics", "comms", "reporting"];

await must(db.from("events").delete().in("id", EVENTS.map((e) => id(e[0]))));

for (const [n, name, theme, date, budget, expected, venue, reg, checked, sponsors, summary] of EVENTS) {
  const free = !budget;
  const past = !!summary;
  const r500 = (x) => Math.round(x / 500) * 500;
  const t = tiers(r500(budget * 0.45), r500(budget * 0.25), r500(budget * 0.12));
  const start = day(date);
  await must(db.from("events").insert({
    id: id(n),
    brief: free ? `${name}, free, ${expected} people` : `${name}, ₹${budget / 1000}k, ${expected} people`,
    name, theme, date, budget, expected_attendees: expected, venue, summary,
    created_at: iso(new Date(start - 40 * 86_400_000)),
    plan: {
      kind: free ? "free" : "funded",
      budget_split: free ? [] : [
        { head: "Food & refreshments", amount: Math.round(budget * 0.35) },
        { head: "Prizes", amount: Math.round(budget * 0.3) },
        { head: "Swag & printing", amount: Math.round(budget * 0.15) },
        { head: "AV & venue", amount: Math.round(budget * 0.12) },
        { head: "Contingency", amount: budget - Math.round(budget * 0.35) - Math.round(budget * 0.3) - Math.round(budget * 0.15) - Math.round(budget * 0.12) },
      ],
      tiers: free ? [] : t,
      timeline: [
        [-35, "Plan locked"], [-28, free ? "Speakers confirmed" : "Sponsor outreach starts"], [-21, "Registration opens"],
        [-7, "Volunteer briefing, shifts sent"], [-2, "Reminder email to attendees"], [0, "Event day"],
      ].map(([d, milestone]) => ({ date: iso(new Date(start.getTime() + d * 86_400_000)).slice(0, 10), milestone })),
      comms: {
        announcement: `${name} — ${theme}. ${venue}, ${date}. ${free ? "Free entry." : ""} Register: {link}`,
        reminder_subject: `${name} is almost here`,
        reminder_body: `Hi there,\n\n${name} is on ${date} at ${venue}. Bring your college ID.\n\nSee you there!\nTeam ${name}`,
      },
    },
  }));

  if (sponsors.length) {
    await must(db.from("sponsors").insert(sponsors.map(([company, tier, fit, status]) => ({
      event_id: id(n), company, tier, fit_score: fit, status,
      contact_email: `partners@${company.split(" ")[0].toLowerCase()}.example.com`,
      pitch_subject: status === "lead" ? null : `Partner with ${name}`,
      pitch_body: status === "lead" ? null : `Hi ${company} team,\n\n${name} (${theme}) on ${date} at ${venue} will bring ~${expected} students together. As a ${tier} partner you'd get: ${t.find((x) => x.name === tier)?.perks.join(", ")}.\n\nWould you like to partner with us?\n\nTeam ${name}`,
      created_at: iso(new Date(start - 30 * 86_400_000)),
    }))));
  }

  // Registrations ramp up over the 3 weeks before the event (or until now for upcoming ones); first `checked` attend.
  const open = start.getTime() - 21 * 86_400_000;
  const end = Math.min(start.getTime() - 3_600_000, Date.now());
  await must(db.from("attendees").insert(Array.from({ length: reg }, (_, i) => {
    const nm = i < NAMES.length ? NAMES[i] : `${NAMES[i % NAMES.length].split(" ")[0]} ${String.fromCharCode(65 + ((i / NAMES.length) | 0))}.`;
    const f = Math.sqrt((i + 1) / reg); // front-loaded launch spike, long tail
    return {
      event_id: id(n), name: nm, usn: `1MS23IS${String(100 + i).padStart(3, "0")}`,
      email: i < NAMES.length ? `${nm.toLowerCase().replace(/ /g, ".")}@example.com` : `student${n}${i}@example.com`,
      checked_in: past && i < checked,
      certificate_sent: past && i < checked,
      created_at: iso(new Date(open + (end - open) * f)),
    };
  })));

  if (past) {
    const team = [["Aditi Rao", "registration, design"], ["Rahul Menon", "av"], ["Sneha Iyer", "logistics"], ["Karthik S", "av, tech"], ["Meera Nair", "social, design"]];
    const vols = await must(db.from("volunteers").insert(team.map(([nm, skills]) => ({ event_id: id(n), name: nm, skills, email: `${nm.split(" ")[0].toLowerCase()}@example.com` }))).select("id"));
    const at = (h, m = 0) => `${date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+05:30`;
    const plan = [["Venue setup & signage", null, 7, 30, 9, 0, 2], ["Registration desk", "registration", 8, 0, 10, 0, 0], ["AV & projector check", "av", 8, 0, 9, 30, 1],
      ["Social media coverage", "social", 9, 0, 12, 0, 4], ["Opening session stage", "av", 9, 30, 10, 30, 3], ["Lunch distribution", null, 12, 30, 14, 0, 0],
      ["Speaker & mentor desk", null, 10, 0, 13, 0, 2], ["Closing & cleanup", null, 17, 0, 18, 30, 2]];
    await must(db.from("tasks").insert(plan.map(([title, skill, h1, m1, h2, m2, v]) => ({ event_id: id(n), title, skill, starts_at: at(h1, m1), ends_at: at(h2, m2), volunteer_id: vols[v].id }))));
  }

  const ran = past ? AGENT_ORDER : ["planner", "sponsorship", "comms"];
  await must(db.from("agent_runs").insert(ran.filter((a) => !(free && a === "sponsorship")).map((agent, i) => ({
    event_id: id(n), agent, ok: true,
    summary: { planner: `Planned ${name}`, sponsorship: `Drafted ${sponsors.length} pitches`, logistics: "Run-of-show scheduled — 0 clashes", comms: "Registration page live — announcement and reminder drafted", reporting: `Report ready — ${checked} attended` }[agent],
    // Upcoming events were planned recently, so cap run times at now — never in the future.
    created_at: iso(new Date(Math.min((agent === "reporting" ? start.getTime() + 86_400_000 : start.getTime() - 38 * 86_400_000) + i * 60_000, Date.now() - (6 - i) * 3 * 3_600_000))),
  }))));
  console.log(`seeded ${name}`);
}
