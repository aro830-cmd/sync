// Offline backup for every agent: when Gemini is unreachable or out of quota, build the same JSON from the
// brief and templates so the demo never stops. Plain module with no imports, so `node src/lib/offline.test.ts` runs it.
// Output is deliberately plainer than the model's and every run says "offline mode".

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const TYPES: [RegExp, string][] = [
  [/hack(athon)?|akathon/i, "Hackathon"],
  [/workshop|bootcamp|hands[- ]on/i, "Workshop"],
  [/seminar|panel/i, "Seminar"],
  [/talk|lecture|session/i, "Talk"],
  [/fest|festival/i, "Fest"],
  [/meetup|meet-up/i, "Meetup"],
  [/sprint|design jam|game jam|jam/i, "Sprint"],
];
const VENUES: Record<string, string> = {
  Hackathon: "Apex Block Seminar Hall",
  Workshop: "ISE Lab 3, Main Block",
  Seminar: "APJ Abdul Kalam Seminar Hall",
  Talk: "Library Seminar Room",
  Fest: "Main Auditorium",
  Meetup: "Library Seminar Room",
  Sprint: "ISE Seminar Room",
  Event: "APJ Abdul Kalam Seminar Hall",
};

const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const r500 = (n: number) => Math.round(n / 500) * 500;
const title = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

/** Pull budget, headcount, date, type and topic out of a one-line brief. Missing values get sensible defaults. */
export function parseBrief(brief: string, today: string) {
  const b = brief.replace(/,(?=\d{3}\b)/g, ""); // 50,000 → 50000
  const money = b.match(/(?:₹|rs\.?|inr)\s*(\d+(?:\.\d+)?)\s*(k|l|lakh|lakhs|lac)?\b/i) ?? b.match(/\b(\d+(?:\.\d+)?)\s*(k|l|lakh|lakhs)\b(?!\s*(?:people|students|attendees))/i);
  let budget = money ? Number(money[1]) * ({ k: 1e3, l: 1e5, lakh: 1e5, lakhs: 1e5, lac: 1e5 }[(money[2] ?? "").toLowerCase()] ?? 1) : 0;
  const people = Number(b.match(/(\d{2,5})\s*(?:\+\s*)?(?:people|students|attendees|participants|members|devs|builders)/i)?.[1] ?? 0);
  const type = TYPES.find(([re]) => re.test(b))?.[1] ?? "Event";
  const free = /\bfree\b|no budget|₹\s*0\b/i.test(b) || (!budget && /seminar|talk|meetup|panel|lecture/i.test(b));
  if (free) budget = 0;
  else if (!budget) budget = { Hackathon: 50000, Fest: 80000, Workshop: 20000, Sprint: 15000 }[type] ?? 20000;

  // "15 Dec", "Dec 15", "5th of December"
  const now = Date.parse(today);
  let date = "";
  const dm = b.match(/(\d{1,2})(?:st|nd|rd|th)?\s*(?:of\s*)?([a-z]{3})[a-z]*/i);
  const md = b.match(/\b([a-z]{3})[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?\b/i);
  const [d, m] = dm && MONTHS.includes(dm[2].toLowerCase()) ? [Number(dm[1]), dm[2]] : md && MONTHS.includes(md[1].toLowerCase()) ? [Number(md[2]), md[1]] : [0, ""];
  if (d && m) {
    let y = new Date(now).getUTCFullYear();
    const at = (yy: number) => Date.UTC(yy, MONTHS.indexOf(m.toLowerCase()), d);
    if (at(y) < now) y++;
    date = iso(at(y));
  } else date = iso(now + 21 * 86_400_000); // three weeks out

  // Topic: "on AI for campus", "about cloud careers", or the first words before the type keyword.
  const topic = (b.match(/\b(?:on|about)\s+([^,.;]+?)(?=\s+(?:for|in|at|with|on)\b|[,.;]|$)/i)?.[1] ?? b.split(/[,.;]/)[0].replace(new RegExp(type, "i"), "").replace(/\b(i want to plan|plan|a|an|the|which is|it will have)\b/gi, "")).trim();
  const short = topic.split(/\s+/).slice(0, 3).join(" ");
  return { budget, people: people || (type === "Hackathon" ? 150 : 100), type, free, date, topic: topic || "Technology", short: short ? title(short) : "" };
}

export function offlinePlan(brief: string, today: string) {
  const p = parseBrief(brief, today);
  const year = p.date.slice(0, 4);
  const name = `${p.short && !/^\d/.test(p.short) ? p.short + " " : ""}${p.type} ${year}`.replace(/\s+/g, " ").trim();
  const split = p.free
    ? []
    : (p.type === "Hackathon"
        ? [["Food & refreshments", 0.34], ["Prizes", 0.3], ["Swag & printing", 0.14], ["AV & venue", 0.12], ["Contingency", 0.1]]
        : [["Food & refreshments", 0.35], ["Speaker & mentor costs", 0.25], ["Swag & printing", 0.15], ["AV & venue", 0.15], ["Contingency", 0.1]]
      ).map(([head, f]) => ({ head: head as string, amount: r500(p.budget * (f as number)) }));
  if (split.length) split[split.length - 1].amount += p.budget - split.reduce((s, x) => s + x.amount, 0); // sums exactly to budget
  const tiers = p.free
    ? []
    : [
        { name: "Title", amount: r500(p.budget * 0.4), perks: ["'Presented by' naming", "Keynote slot", "Logo on all swag"] },
        { name: "Gold", amount: r500(p.budget * 0.25), perks: ["Booth in the main hall", "Judge or mentor seat", "Logo on banner"] },
        { name: "Silver", amount: r500(p.budget * 0.12), perks: ["Logo on banner", "Resume book access"] },
        { name: "Community", amount: 0, perks: ["Social media shout-out", "Swag table"] },
      ];
  const t0 = Date.parse(today), t1 = Date.parse(p.date), span = Math.max(7, (t1 - t0) / 86_400_000);
  const steps = p.free
    ? [[0, "Plan locked, speakers invited"], [0.25, "Speakers confirmed"], [0.4, "Registration opens"], [0.75, "Volunteer briefing, shifts sent"], [0.93, "Reminder email to attendees"], [1, "Event day"]]
    : [[0, "Plan locked, sponsor outreach starts"], [0.3, "Registration opens"], [0.55, "Sponsors confirmed, swag ordered"], [0.75, "Volunteer briefing, shifts sent"], [0.93, "Reminder email to attendees"], [1, "Event day"]];
  return {
    kind: (p.free ? "free" : "funded") as "free" | "funded",
    name,
    theme: `${p.type} on ${p.topic}`.slice(0, 120),
    date: p.date,
    budget: p.budget,
    expected_attendees: p.people,
    venue: VENUES[p.type],
    budget_split: split,
    tiers,
    timeline: steps.map(([f, milestone]) => ({ date: iso(t0 + Math.round(span * (f as number)) * 86_400_000), milestone: milestone as string })),
  };
}

// ── mock sponsor pool: real companies known for backing student tech events in India ──
export const SPONSOR_POOL: { company: string; tags: string[]; why: string }[] = [
  { company: "GitHub", tags: ["ai", "web", "open source", "general"], why: "runs GitHub Education and backs student hackathons with Copilot and credits" },
  { company: "Postman", tags: ["api", "web", "general"], why: "is Bengaluru-born and partners with campus events to teach API workflows" },
  { company: "Razorpay", tags: ["fintech", "payments", "web"], why: "sponsors student builders who integrate its payment APIs" },
  { company: "Devfolio", tags: ["hackathon", "web3", "general"], why: "is India's hackathon platform and supports college hackathons end to end" },
  { company: "DigitalOcean", tags: ["cloud", "devops", "web"], why: "gives cloud credits to every participant and judges deploy-ready projects" },
  { company: "MongoDB", tags: ["data", "ai", "web"], why: "offers Atlas credits and a 'best use of MongoDB' prize at student events" },
  { company: "Hasura", tags: ["api", "web", "data"], why: "is a Bengaluru dev-tools company that mentors student API projects" },
  { company: "Scaler", tags: ["career", "general", "ai"], why: "targets CS students and sponsors coding events to reach early-career talent" },
  { company: "GeeksforGeeks", tags: ["career", "general", "dsa"], why: "routinely sponsors college coding events with learning credits" },
  { company: "Unstop", tags: ["career", "general", "hackathon"], why: "hosts student competitions and promotes partner events to its community" },
  { company: "Zoho", tags: ["saas", "web", "general"], why: "backs Indian campus tech events and hires from them" },
  { company: "Freshworks", tags: ["saas", "ai", "web"], why: "sponsors developer events and runs AI product challenges" },
  { company: "Atlassian", tags: ["devops", "general", "design"], why: "has a large Bengaluru office and supports student developer communities" },
  { company: "JetBrains", tags: ["dev tools", "general"], why: "gives IDE licences to every participant through its education programme" },
  { company: "Polygon", tags: ["web3", "blockchain"], why: "funds web3 tracks with bounties at Indian student hackathons" },
  { company: "Replit", tags: ["ai", "web", "general"], why: "supports student builders with hosted environments and prizes" },
];

export function offlineSuggestions(theme: string, tierNames: string[], known: Set<string>) {
  const t = theme.toLowerCase();
  const tier = (i: number) => tierNames[Math.min(i < 2 ? 0 : i < 4 ? 1 : 2, tierNames.length - 1)] ?? "Silver";
  return SPONSOR_POOL.filter((s) => !known.has(s.company.toLowerCase()))
    .map((s) => ({ s, score: 60 + s.tags.filter((g) => g !== "general" && t.includes(g)).length * 12 + (s.tags.includes("general") ? 8 : 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ s, score }, i) => ({ company: s.company, why: `${s.company} ${s.why}.`, fit_score: Math.min(95, score + (8 - i)), tier: tier(i) }));
}

export function offlinePitch(ev: { name: string; theme: string; date: string; venue: string; expected_attendees: number }, company: string, tier: { name: string; amount: number; perks: string[] } | undefined) {
  return {
    subject: `Partner with ${ev.name} — ${ev.expected_attendees} student builders`,
    body: `Hi ${company} team,\n\nWe're running ${ev.name} (${ev.theme}) on ${ev.date} at ${ev.venue}, with around ${ev.expected_attendees} students from our college.\n\n${tier ? `As our ${tier.name} partner${tier.amount ? ` (₹${tier.amount.toLocaleString("en-IN")})` : ""} you'd get: ${tier.perks.join(", ")}.` : "We'd love to have you on board as a partner."}\n\nCould we set up a 15-minute call this week?\n\nTeam ${ev.name}`,
  };
}

export function offlineTasks(volunteerSkills: (string | null)[]) {
  const skills = volunteerSkills.join(" ").toLowerCase();
  const has = (s: string) => (skills.includes(s) ? s : null);
  return [
    { title: "Venue setup & signage", skill: null, start: "07:30", end: "09:00" },
    { title: "Registration desk", skill: has("registration"), start: "08:00", end: "10:00" },
    { title: "AV & projector check", skill: has("av"), start: "08:00", end: "09:30" },
    { title: "Opening session stage", skill: has("av"), start: "09:30", end: "10:30" },
    { title: "Social media coverage", skill: has("social"), start: "09:30", end: "12:30" },
    { title: "Speaker & mentor desk", skill: null, start: "10:00", end: "13:00" },
    { title: "Lunch distribution", skill: null, start: "12:30", end: "14:00" },
    { title: "Wi-Fi & power helpdesk", skill: has("tech"), start: "13:00", end: "16:00" },
    { title: "Photography", skill: has("design"), start: "15:00", end: "17:00" },
    { title: "Closing & cleanup", skill: null, start: "17:00", end: "18:30" },
  ];
}

export function offlineComms(ev: { name: string; theme: string; date: string; venue: string }, free: boolean) {
  const day = new Date(ev.date).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
  return {
    announcement: `${ev.name} is here! ${ev.theme}. ${day}, ${ev.venue}.${free ? " Free entry — seats are limited." : " Food, mentors and prizes."} All branches welcome. Register: {link}`,
    reminder_subject: `${ev.name} is almost here — what to bring`,
    reminder_body: `Hi there,\n\n${ev.name} is on ${day} at ${ev.venue}. Check-in opens 30 minutes before the start — bring your college ID${free ? "" : " and a charged laptop"}.\n\nSee you there!\nTeam ${ev.name}`,
  };
}

export function offlineReport(ev: { name: string; date: string; venue: string }, s: { registered: number; attended: number; confirmed: { company: string; tier: string | null }[] }, free: boolean) {
  const rate = s.registered ? Math.round((s.attended / s.registered) * 100) : 0;
  const partners = s.confirmed.map((c) => `${c.company}${c.tier ? ` (${c.tier})` : ""}`).join(", ");
  return free
    ? `${ev.name} took place on ${ev.date} at ${ev.venue}. ${s.attended} of ${s.registered} registered students attended — a ${rate}% turnout. Thank you to everyone who came and to the volunteers who ran the day. Next time we'll open registration earlier and send a second reminder the evening before to lift turnout further.`
    : `${ev.name} took place on ${ev.date} at ${ev.venue}. ${s.attended} of ${s.registered} registered students attended — a ${rate}% turnout.${partners ? ` Thank you to our partners ${partners}: every promised perk in your tier was delivered, from branding to on-stage time.` : ""} We'd be glad to build the next edition with you.`;
}
