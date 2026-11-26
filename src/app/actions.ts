"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, ADMIN_MAX_AGE, makeToken, sameSecret } from "@/lib/token";
import { db, llm, requireAdmin, sendMail } from "@/lib/server";
import { currentStudent, endSession, hashPassword, startSession, verifyPassword } from "@/lib/student";
import { certificatePdf } from "@/lib/pdf";
import { buildReport, reportStats } from "@/lib/report";
import { assign } from "@/lib/schedule";
import { appUrl, posterEvent, posterPng } from "@/lib/poster";
import { DEMO_MEMBERS, joinSkills, parseSkills } from "@/lib/roster";
import { DEFAULT_WEIGHTS } from "@/lib/fit";
import { CONTRIBUTIONS } from "@/lib/types";
import { offlineComms, offlinePitch, offlinePlan, offlineReport, offlineSuggestions, offlineTasks } from "@/lib/offline";

import type { AgentName } from "@/lib/agents";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TODAY = () => new Date().toISOString().slice(0, 10);
const inr = (n: number | null) => `₹${(n ?? 0).toLocaleString("en-IN")}`;

async function getEvent(id: string) {
  const { data, error } = await db().from("events").select("*").eq("id", id).single();
  if (error) throw new Error(error.message);
  return data;
}

// Throws on DB error. Data is only meaningful for selects; writes without .select() return null.
async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>) {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data as NonNullable<T>;
}

/** "Company, email" or "Name, email, skills" per line; bad lines are dropped. */
function parseLines(text: string) {
  return text
    .split("\n")
    .map((l) => l.split(",").map((s) => s.trim()))
    .filter(([name, email]) => name && email && EMAIL.test(email));
}

// ───────────────────────── agents ─────────────────────────

/**
 * Ask Gemini; if it can't answer (out of quota, overloaded, timed out, bad JSON) build the result offline from
 * templates so the agent still finishes. RELAY_OFFLINE=1 skips Gemini entirely (safe demo mode).
 */
async function smart<T>(prompt: string, offline: () => T): Promise<{ v: T; off: boolean }> {
  if (process.env.RELAY_OFFLINE === "1") return { v: offline(), off: true };
  try {
    return { v: await llm<T>(prompt), off: false };
  } catch (e) {
    console.error("Gemini unavailable, using offline mode:", e instanceof Error ? e.message : e);
    return { v: offline(), off: true };
  }
}
const tag = (off: boolean) => (off ? " · offline mode" : "");

type Plan = {
  kind: "funded" | "free";
  name: string;
  theme: string;
  date: string;
  budget: number;
  expected_attendees: number;
  venue: string;
  budget_split: { head: string; amount: number }[];
  tiers: { name: string; amount: number; perks: string[] }[];
  timeline: { date: string; milestone: string }[];
};

async function planner(eventId: string) {
  const ev = await getEvent(eventId);
  const fixed: Partial<Plan> = ev.plan?.fixed ?? {};
  const { v: p, off } = await smart<Plan>(`You are the Planner agent for a college technical club in Bengaluru, India. Today is ${TODAY()}.
Turn this one-line brief into an event plan. Brief: """${ev.brief}"""
First decide "kind": "free" when the event needs no money and no sponsors (a seminar, talk, workshop or meetup with no budget given,
or the brief says free / ₹0 / no budget); otherwise "funded" (hackathons, fests, anything with a budget).
Return JSON: {"kind": "funded"|"free", "name": string, "theme": string, "date": "YYYY-MM-DD" (future date), "budget": integer INR (0 if free),
"expected_attendees": integer, "venue": string (a plausible campus hall),
"budget_split": [{"head": string, "amount": integer}] (funded: 4-6 heads summing to budget; free: []),
"tiers": [{"name": "Title"|"Gold"|"Silver"|"Community", "amount": integer INR, "perks": [string]}] (funded: 3-4 tiers; free: []),
"timeline": [{"date": "YYYY-MM-DD", "milestone": string}] (5-7 milestones from today to event day)}.
If the brief omits a value, choose a sensible one.${Object.keys(fixed).length ? `
The organiser has set these values by hand — use them exactly and plan around them: ${JSON.stringify(fixed)}` : ""}`, () => offlinePlan(ev.brief, TODAY()));
  Object.assign(p, fixed); // never let the model drift from what the organiser typed
  if (!p.name || !/^\d{4}-\d{2}-\d{2}$/.test(p.date)) throw new Error("Planner returned an incomplete plan.");
  const free = p.kind === "free";
  await must(
    db()
      .from("events")
      .update({
        name: p.name,
        theme: p.theme,
        date: p.date,
        budget: free ? 0 : Math.round(p.budget),
        expected_attendees: Math.round(p.expected_attendees),
        venue: p.venue,
        // Merge so a re-plan keeps what later agents wrote (e.g. comms).
        plan: { ...ev.plan, kind: free ? "free" : "funded", budget_split: free ? [] : p.budget_split, tiers: free ? [] : p.tiers, timeline: p.timeline },
      })
      .eq("id", eventId),
  );
  return {
    summary: (free
      ? `Planned ${p.name}: free event, ${p.timeline.length} milestones — no budget or sponsors needed`
      : `Planned ${p.name}: ${inr(p.budget)} across ${p.budget_split.length} heads, ${p.tiers.length} sponsor tiers`) + tag(off),
    output: p,
  };
}

type Suggestion = { company: string; why: string; fit_score: number; tier: string };

async function sponsorship(eventId: string) {
  const ev = await getEvent(eventId);
  if (ev.plan?.kind === "free") return { summary: "Skipped — free event, no sponsors needed", output: null };
  const all = await must(db().from("sponsors").select("id, company, status, tier, fit_score").eq("event_id", eventId));
  const leads = all.filter((s) => s.status === "lead");

  // Recommend real companies the club hasn't approached yet. No contact emails: the organiser adds one on accept.
  const known = new Set(all.map((s) => s.company.toLowerCase()));
  const tiers: { name: string; amount: number; perks: string[] }[] = ev.plan?.tiers ?? [];
  const { v: rec, off: off1 } = await smart<{ suggestions: Suggestion[] }>(
    `You are the Sponsorship agent for "${ev.name}" (${ev.theme}), on ${ev.date} at ${ev.venue}, Bengaluru, ~${ev.expected_attendees} student attendees.
Sponsor tiers: ${JSON.stringify(ev.plan?.tiers ?? [])}
Recommend 8 real companies that plausibly sponsor college tech events in India and fit this theme and audience
(developer tools, cloud, startups, edtech, local tech firms). Skip these, already approached: ${JSON.stringify([...known])}.
For each: a one-sentence reason specific to this event, a fit score 0-100, and the best-fit tier name.
Return JSON: {"suggestions": [{"company": string, "why": string, "fit_score": integer, "tier": string}]}`,
    () => ({ suggestions: offlineSuggestions(`${ev.brief} ${ev.name} ${ev.theme}`, tiers.map((t) => t.name), known) }),
  );
  const suggestions = (rec.suggestions ?? [])
    .filter((s) => s.company && !known.has(s.company.toLowerCase()))
    .map((s) => ({ ...s, fit_score: Math.round(s.fit_score) }))
    .sort((a, b) => b.fit_score - a.fit_score)
    .slice(0, 8);
  await must(db().from("events").update({ plan: { ...ev.plan, suggestions } }).eq("id", eventId));
  if (!leads.length) return { summary: `Recommended ${suggestions.length} sponsors — add a contact email to pitch one` + tag(off1), output: { suggestions } };

  // Small integer keys instead of UUIDs: the model echoes them back reliably.
  const { v: r, off: off2 } = await smart<{ pitches: { n: number; tier: string; fit_score: number; subject: string; body: string }[] }>(
    `You are the Sponsorship agent for "${ev.name}" (${ev.theme}), on ${ev.date} at ${ev.venue}, ~${ev.expected_attendees} student attendees.
Sponsor tiers: ${JSON.stringify(ev.plan?.tiers ?? [])}
For each company below, pick the best-fit tier, score fit 0-100 for this audience, and write a funding-request email
(180-260 words, plain text, no placeholders like [Name], sign off as "Team ${ev.name}") with, in this order:
1) who we are and the event: name, theme, date, venue, ~${ev.expected_attendees} students;
2) the ask: the tier name and its exact rupee amount, and what the money pays for;
3) the publicity they get, as "- " bullet lines: the tier perks, logo on posters/standees/stage backdrop, 3 social posts on the club's
Instagram and LinkedIn, a thank-you mention on stage, logo on the public registration page, and a post-event report with real numbers;
4) a reply-by date 10 days before the event and an offer of a short call.
The subject line names the tier and the event.
Companies: ${JSON.stringify(leads.map((l, n) => ({ n, company: l.company })))}
Return JSON: {"pitches": [{"n": integer (same n), "tier": string, "fit_score": integer, "subject": string, "body": string}]}`,
    () => ({
      pitches: leads.map((l, n) => {
        const t = tiers.find((x) => x.name === l.tier) ?? tiers[Math.min(n, Math.max(0, tiers.length - 2))];
        return { n, tier: t?.name ?? "Silver", fit_score: l.fit_score ?? 70, ...offlinePitch(ev, l.company, t) };
      }),
    }),
  );
  const pitches = (r.pitches ?? []).filter((p) => leads[p.n] && p.subject && p.body);
  for (const p of pitches) {
    await must(
      db()
        .from("sponsors")
        .update({ tier: p.tier, fit_score: Math.round(p.fit_score), pitch_subject: p.subject, pitch_body: p.body, status: "drafted" })
        .eq("id", leads[p.n].id),
    );
  }
  return { summary: `Drafted ${pitches.length} pitches — waiting for your approval to send · ${suggestions.length} new sponsors recommended` + tag(off1 || off2), output: { pitches, suggestions } };
}

/** Copy available club members (roster rows, no event) onto this event. Returns how many joined. */
async function staffFromRoster(eventId: string) {
  const [roster, have] = await Promise.all([
    must(db().from("volunteers").select("name, email, skills").is("event_id", null)),
    must(db().from("volunteers").select("email").eq("event_id", eventId)),
  ]);
  const taken = new Set(have.map((v) => v.email));
  const rows = roster
    .filter((m) => parseSkills(m.skills).available && !taken.has(m.email))
    .map((m) => ({ event_id: eventId, name: m.name, email: m.email, skills: parseSkills(m.skills).skills.join(", ") }));
  if (rows.length) await must(db().from("volunteers").insert(rows));
  return rows.length;
}

async function logistics(eventId: string) {
  const ev = await getEvent(eventId);
  let vols = await must(db().from("volunteers").select("id, name, skills").eq("event_id", eventId));
  // No team yet: staff the day from club members marked available on the Volunteers page.
  const staffed = vols.length ? 0 : await staffFromRoster(eventId);
  if (staffed) vols = await must(db().from("volunteers").select("id, name, skills").eq("event_id", eventId));
  if (!vols.length) return { summary: "Skipped — no volunteers. Mark club members available on the Volunteers page, or add some on the Logistics tab.", output: null };

  const { v: r, off } = await smart<{ tasks: { title: string; skill: string | null; start: string; end: string }[] }>(
    `You are the Logistics agent for "${ev.name}" on ${ev.date} at ${ev.venue}, ~${ev.expected_attendees} attendees.
Volunteers and skills: ${JSON.stringify(vols.map((v) => ({ name: v.name, skills: v.skills })))}
Write the day's run-of-show as 8-14 volunteer tasks between 07:30 and 20:00. Some tasks should run in parallel.
Give every task a "skill" from this list when it fits, else null: registration, av, social, design, logistics, tech, hospitality.
Return JSON: {"tasks": [{"title": string, "skill": string|null, "start": "HH:MM", "end": "HH:MM"}]}`,
    () => ({ tasks: offlineTasks(vols.map((v) => v.skills)) }),
  );
  const slots = (r.tasks ?? [])
    .filter((t) => /^\d{2}:\d{2}$/.test(t.start) && /^\d{2}:\d{2}$/.test(t.end) && t.start < t.end)
    .map((t) => ({
      title: t.title,
      skill: t.skill,
      starts_at: `${ev.date}T${t.start}:00+05:30`,
      ends_at: `${ev.date}T${t.end}:00+05:30`,
    }));
  const who = assign(slots, vols);
  await must(db().from("tasks").delete().eq("event_id", eventId));
  await must(db().from("tasks").insert(slots.map((s, i) => ({ ...s, event_id: eventId, volunteer_id: who[i] }))));
  const open = who.filter((w) => !w).length;
  return {
    summary: `${staffed ? `Staffed ${staffed} club members from the roster · ` : ""}${slots.length} tasks scheduled for ${vols.length} volunteers — 0 clashes${open ? `, ${open} need more hands` : ""}` + tag(off),
    output: slots,
  };
}

async function comms(eventId: string) {
  const ev = await getEvent(eventId);
  const { v: r, off } = await smart<{ announcement: string; reminder_subject: string; reminder_body: string }>(
    `You are the Comms agent for "${ev.name}" (${ev.theme}) on ${ev.date} at ${ev.venue}.
Write (1) a WhatsApp/Instagram announcement under 90 words ending with "Register: {link}",
and (2) a reminder email for registered attendees (plain text, under 120 words, no placeholders).
Return JSON: {"announcement": string, "reminder_subject": string, "reminder_body": string}`,
    () => offlineComms(ev, ev.plan?.kind === "free"),
  );
  await must(db().from("events").update({ plan: { ...ev.plan, comms: r } }).eq("id", eventId));
  return { summary: `Registration page live at /e/${eventId.slice(0, 8)}… — poster, announcement and reminder ready` + tag(off), output: r };
}

async function reporting(eventId: string) {
  const ev = await getEvent(eventId);
  const s = await reportStats(eventId);
  const free = ev.plan?.kind === "free";
  const { v: r, off } = await smart<{ summary: string }>(
    free
      ? `You are the Reporting agent. Write a 120-160 word post-event summary for the club and department of "${ev.name}" (${ev.theme}),
held ${ev.date} at ${ev.venue}. It was a free event with no sponsors. Registered: ${s.registered}. Attended: ${s.attended}.
Thank attendees and volunteers, state the reach honestly using only these numbers, and suggest one thing for next time. Plain prose.
Return JSON: {"summary": string}`
      : `You are the Reporting agent. Write a 120-180 word post-event summary for sponsors of "${ev.name}" (${ev.theme}),
held ${ev.date} at ${ev.venue}. Registered: ${s.registered}. Attended: ${s.attended}.
Confirmed partners: ${JSON.stringify(s.confirmed)}. Tier perks promised: ${JSON.stringify(ev.plan?.tiers ?? [])}.
Thank partners, state the reach honestly using only these numbers, and list delivered perks. Plain prose.
Return JSON: {"summary": string}`,
    () => ({ summary: offlineReport(ev, s, free) }),
  );
  await must(db().from("events").update({ summary: r.summary }).eq("id", eventId));
  return { summary: (free ? `Event report ready — ${s.attended} attended of ${s.registered} registered` : `Sponsor report ready — ${s.attended} attended, ${s.confirmed.length} partners`) + tag(off), output: r };
}

const RUNNERS: Record<AgentName, (id: string) => Promise<{ summary: string; output: unknown }>> = {
  planner,
  sponsorship,
  logistics,
  comms,
  reporting,
};

async function log(eventId: string, agent: string, summary: string, output: unknown, ok = true) {
  await db().from("agent_runs").insert({ event_id: eventId, agent, summary, output, ok });
}

export async function runAgent(eventId: string, agent: AgentName) {
  await requireAdmin();
  if (!Object.hasOwn(RUNNERS, agent)) return { ok: false, summary: "Unknown agent" };
  try {
    const r = await RUNNERS[agent](eventId);
    await log(eventId, agent, r.summary, r.output);
    return { ok: true, summary: r.summary };
  } catch (e) {
    const summary = e instanceof Error ? e.message : String(e);
    await log(eventId, agent, summary, null, false).catch(() => {});
    return { ok: false, summary };
  } finally {
    revalidatePath(`/dashboard/${eventId}`);
  }
}

// ───────────────────────── organiser actions ─────────────────────────

type Result = { ok: boolean; message: string };
async function attempt(eventId: string, agent: string, fn: () => Promise<string>): Promise<Result> {
  try {
    await requireAdmin();
    const message = await fn();
    await log(eventId, agent, message, null);
    return { ok: true, message };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  } finally {
    revalidatePath(`/dashboard/${eventId}`);
  }
}

export async function createEvent(brief: string, leads: string, volunteers: string) {
  await requireAdmin();
  if (brief.trim().length < 8) throw new Error("Describe the event in a few words.");
  const ev = await must(db().from("events").insert({ brief: brief.trim().slice(0, 500) }).select("id").single());
  const l = parseLines(leads);
  const v = parseLines(volunteers);
  if (l.length) await must(db().from("sponsors").insert(l.map(([company, contact_email]) => ({ event_id: ev.id, company, contact_email }))));
  if (v.length) await must(db().from("volunteers").insert(v.map(([name, email, ...s]) => ({ event_id: ev.id, name, email, skills: s.join(", ") }))));
  revalidatePath("/dashboard");
  return ev.id as string;
}

export async function addLeads(eventId: string, text: string) {
  return attempt(eventId, "sponsorship", async () => {
    const l = parseLines(text);
    if (!l.length) throw new Error('No valid lines. Use "Company, email" per line.');
    await must(db().from("sponsors").insert(l.map(([company, contact_email]) => ({ event_id: eventId, company, contact_email }))));
    return `Added ${l.length} sponsor lead${l.length > 1 ? "s" : ""}`;
  });
}

/** Turn an agent-recommended company into a lead (needs a real contact email), or drop it. */
export async function acceptSuggestion(eventId: string, company: string, email: string) {
  return attempt(eventId, "sponsorship", async () => {
    email = email.trim().toLowerCase();
    if (!EMAIL.test(email)) throw new Error("Enter a valid contact email for this company.");
    const ev = await getEvent(eventId);
    const s = (ev.plan?.suggestions ?? []).find((x: Suggestion) => x.company === company);
    if (!s) throw new Error("That suggestion is gone — run the Sponsorship agent again.");
    await must(db().from("sponsors").insert({ event_id: eventId, company, contact_email: email, tier: s.tier, fit_score: s.fit_score }));
    await must(db().from("events").update({ plan: { ...ev.plan, suggestions: ev.plan.suggestions.filter((x: Suggestion) => x !== s) } }).eq("id", eventId));
    return `${company} added as a lead — run Sponsorship to draft its pitch`;
  });
}

export async function dismissSuggestion(eventId: string, company: string) {
  return attempt(eventId, "sponsorship", async () => {
    const ev = await getEvent(eventId);
    await must(db().from("events").update({ plan: { ...ev.plan, suggestions: (ev.plan?.suggestions ?? []).filter((x: Suggestion) => x.company !== company) } }).eq("id", eventId));
    return `Dismissed ${company}`;
  });
}

export type EventEdit = { brief: string; name: string; date: string; venue: string; budget: number; expected_attendees: number; kind: "funded" | "free" };

/** Organiser edits the event by hand. Changed values are pinned in plan.fixed so a Planner re-run keeps them. */
export async function updateEvent(eventId: string, edit: EventEdit) {
  return attempt(eventId, "planner", async () => {
    const ev = await getEvent(eventId);
    const brief = edit.brief.trim().slice(0, 500);
    const name = edit.name.trim().slice(0, 120);
    const venue = edit.venue.trim().slice(0, 160);
    const kind = edit.kind === "free" ? "free" : "funded";
    const budget = kind === "free" ? 0 : Math.round(Number(edit.budget));
    const expected = Math.round(Number(edit.expected_attendees));
    if (brief.length < 8) throw new Error("Describe the event in a few words.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(edit.date)) throw new Error("Pick a date.");
    if (!Number.isFinite(budget) || budget < 0 || budget > 10_000_000) throw new Error("Budget must be between ₹0 and ₹1 crore.");
    if (!Number.isFinite(expected) || expected < 1 || expected > 100_000) throw new Error("Expected attendees must be at least 1.");

    const next = { name: name || ev.name, date: edit.date, venue: venue || ev.venue, budget, expected_attendees: expected, kind };
    const before = { name: ev.name, date: ev.date, venue: ev.venue, budget: ev.budget, expected_attendees: ev.expected_attendees, kind: ev.plan?.kind ?? "funded" };
    const changed = Object.fromEntries(Object.entries(next).filter(([k, v]) => v !== before[k as keyof typeof before]));
    if (!Object.keys(changed).length && brief === ev.brief) return "Nothing changed";
    await must(
      db()
        .from("events")
        .update({
          brief, name: next.name, date: next.date, venue: next.venue, budget, expected_attendees: expected,
          // Switching to free drops the money plan; switching to funded waits for a Planner run to rebuild it.
          plan: { ...ev.plan, kind, fixed: { ...ev.plan?.fixed, ...changed }, ...(kind === "free" ? { budget_split: [], tiers: [], suggestions: [] } : {}) },
        })
        .eq("id", eventId),
    );
    const what = Object.keys(changed).map((k) => (k === "budget" ? `budget ${inr(before.budget)} → ${inr(budget)}` : k.replace("_", " "))).join(", ");
    return `Details updated${what ? `: ${what}` : ""}`;
  });
}

// ───────────────────────── club volunteer roster (volunteers with no event) ─────────────────────────

async function rosterAction(fn: () => Promise<string>): Promise<Result> {
  try {
    await requireAdmin();
    return { ok: true, message: await fn() };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  } finally {
    revalidatePath("/dashboard/volunteers");
  }
}

export async function addMember(name: string, email: string, skills: string[]) {
  return rosterAction(async () => {
    name = name.trim().slice(0, 100);
    email = email.trim().toLowerCase().slice(0, 200);
    if (!name || !EMAIL.test(email)) throw new Error("Enter a name and a valid email.");
    const dupe = await must(db().from("volunteers").select("id").is("event_id", null).eq("email", email));
    if (dupe.length) throw new Error(`${email} is already on the roster.`);
    await must(db().from("volunteers").insert({ event_id: null, name, email, skills: joinSkills(skills, true) }));
    return `${name} joined the volunteer roster`;
  });
}

export async function setMemberAvailable(id: string, available: boolean) {
  return rosterAction(async () => {
    const m = await must(db().from("volunteers").select("name, skills").eq("id", id).is("event_id", null).single());
    await must(db().from("volunteers").update({ skills: joinSkills(parseSkills(m.skills).skills, available) }).eq("id", id));
    return `${m.name} is ${available ? "available" : "away"}`;
  });
}

export async function setMemberSkills(id: string, skills: string[]) {
  return rosterAction(async () => {
    const m = await must(db().from("volunteers").select("name, skills").eq("id", id).is("event_id", null).single());
    await must(db().from("volunteers").update({ skills: joinSkills(skills, parseSkills(m.skills).available) }).eq("id", id));
    return `Updated ${m.name}'s roles`;
  });
}

export async function removeMember(id: string) {
  return rosterAction(async () => {
    const m = await must(db().from("volunteers").delete().eq("id", id).is("event_id", null).select("name").single());
    return `${m.name} removed from the roster`;
  });
}

export async function addDemoMembers() {
  return rosterAction(async () => {
    const have = new Set((await must(db().from("volunteers").select("email").is("event_id", null))).map((v) => v.email));
    const rows = DEMO_MEMBERS.filter(([, email]) => !have.has(email)).map(([name, email, skills]) => ({ event_id: null, name, email, skills: joinSkills(skills, true) }));
    if (rows.length) await must(db().from("volunteers").insert(rows));
    return rows.length ? `Added ${rows.length} demo members` : "Demo members are already on the roster";
  });
}

export async function staffEvent(eventId: string) {
  return attempt(eventId, "logistics", async () => {
    const n = await staffFromRoster(eventId);
    if (!n) throw new Error("No more available club members — mark people available on the Volunteers page.");
    return `Added ${n} available club member${n > 1 ? "s" : ""} from the roster`;
  });
}

// ───────────────────────── sponsor research (migration 002) ─────────────────────────

/** Append-only audit trail for organiser actions on sponsors, payments, roles and rewards. Never blocks the action. */
async function audit(entity: string, entityId: string | null, action: string, detail: Record<string, unknown> = {}, eventId: string | null = null) {
  await db().from("audit_log").insert({ entity, entity_id: entityId, action, detail, event_id: eventId }).then(() => {}, () => {});
}

async function researchAction(fn: () => Promise<string>): Promise<Result> {
  try {
    await requireAdmin();
    return { ok: true, message: await fn() };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  } finally {
    revalidatePath("/dashboard/research");
  }
}

export type CompanyInput = { id?: string; name: string; industry: string; city: string; website: string; contact_route: string; contribution_types: string[]; est_value: number | null; notes: string };

export async function saveCompany(input: CompanyInput) {
  return researchAction(async () => {
    const name = input.name.trim().slice(0, 120);
    if (!name) throw new Error("Company name is required.");
    const website = input.website.trim();
    if (website && !/^https?:\/\/\S+$/i.test(website)) throw new Error("Website must start with http:// or https://");
    const route = input.contact_route.trim().slice(0, 300);
    if (route && !/^https?:\/\/\S+$/i.test(route) && !EMAIL.test(route)) throw new Error("Contact route must be an official URL or a published email.");
    const est = input.est_value == null || Number.isNaN(input.est_value) ? null : Math.round(input.est_value);
    if (est != null && (est < 0 || est > 10_000_000)) throw new Error("Estimated value must be between ₹0 and ₹1 crore.");
    const row = {
      name,
      industry: input.industry.trim().slice(0, 80) || null,
      city: input.city.trim().slice(0, 80) || null,
      website: website || null,
      contact_route: route || null,
      contribution_types: input.contribution_types.filter((c) => (CONTRIBUTIONS as readonly string[]).includes(c)),
      est_value: est,
      notes: input.notes.trim().slice(0, 2000) || null,
    };
    const saved = input.id
      ? await must(db().from("companies").update(row).eq("id", input.id).select("id").single())
      : await must(db().from("companies").insert(row).select("id").single());
    await audit("company", saved.id, input.id ? "updated" : "created", { name });
    return `${name} ${input.id ? "updated" : "added to research"}`;
  });
}

export async function addSource(companyId: string, s: { claim: string; url: string; source_date: string; confidence: string; kind: string }) {
  return researchAction(async () => {
    const claim = s.claim.trim().slice(0, 500);
    const url = s.url.trim();
    if (!claim) throw new Error("Write down what the source says.");
    if (!/^https?:\/\/\S+$/i.test(url)) throw new Error("Every claim needs a public source URL (http/https).");
    if (s.source_date && !/^\d{4}-\d{2}-\d{2}$/.test(s.source_date)) throw new Error("Source date must be a date.");
    if (!["high", "medium", "low"].includes(s.confidence)) throw new Error("Pick a confidence level.");
    if (!["history", "profile", "contact", "news"].includes(s.kind)) throw new Error("Pick what kind of source this is.");
    const r = await must(db().from("company_sources").insert({ company_id: companyId, claim, url, source_date: s.source_date || null, confidence: s.confidence, kind: s.kind }).select("id").single());
    await audit("company_source", r.id, "added", { companyId, url, confidence: s.confidence });
    return "Source added";
  });
}

export async function deleteSource(id: string) {
  return researchAction(async () => {
    const r = await must(db().from("company_sources").delete().eq("id", id).select("url").single());
    await audit("company_source", id, "deleted", { url: r.url });
    return "Source removed";
  });
}

export async function saveFitWeights(w: Record<string, number>) {
  return researchAction(async () => {
    const clean = Object.fromEntries(Object.keys(DEFAULT_WEIGHTS).map((k) => [k, Math.max(0, Math.min(100, Math.round(Number(w[k]) || 0)))]));
    if (!Object.values(clean).some((v) => v > 0)) throw new Error("At least one factor needs a weight above 0.");
    await must(db().from("settings").upsert({ key: "fit_weights", value: clean, updated_at: new Date().toISOString() }));
    await audit("settings", null, "fit_weights_changed", clean);
    return "Fit weights saved";
  });
}

/** Research proposes; the organiser decides. Adding a lead only stages it — pitches still need Review & send. */
export async function leadFromCompany(eventId: string, companyId: string) {
  return attempt(eventId, "sponsorship", async () => {
    const c = await must(db().from("companies").select("id, name, contact_route, contribution_types, est_value").eq("id", companyId).single());
    if (!c.contact_route || !EMAIL.test(c.contact_route)) throw new Error(`${c.name} has no published contact email — add one to its contact route first.`);
    const dupe = await must(db().from("sponsors").select("id").eq("event_id", eventId).eq("company", c.name));
    if (dupe.length) throw new Error(`${c.name} is already on this event.`);
    const r = await must(
      db().from("sponsors").insert({ event_id: eventId, company: c.name, contact_email: c.contact_route, company_id: c.id, contribution_type: c.contribution_types[0] ?? null, value: c.est_value }).select("id").single(),
    );
    await audit("sponsor", r.id, "lead_from_research", { company: c.name }, eventId);
    return `${c.name} added as a lead — run Sponsorship to draft the pitch`;
  });
}

export async function addVolunteers(eventId: string, text: string) {
  return attempt(eventId, "logistics", async () => {
    const v = parseLines(text);
    if (!v.length) throw new Error('No valid lines. Use "Name, email, skills" per line.');
    await must(db().from("volunteers").insert(v.map(([name, email, ...s]) => ({ event_id: eventId, name, email, skills: s.join(", ") }))));
    return `Added ${v.length} volunteer${v.length > 1 ? "s" : ""}`;
  });
}

export async function setSponsorStatus(eventId: string, id: string, status: string) {
  return attempt(eventId, "sponsorship", async () => {
    if (!["contacted", "replied", "confirmed", "declined"].includes(status)) throw new Error("Bad status");
    const s = await must(db().from("sponsors").update({ status }).eq("id", id).eq("event_id", eventId).select("company").single());
    return `${s.company} marked ${status}`;
  });
}

export async function updatePitch(eventId: string, id: string, subject: string, body: string) {
  return attempt(eventId, "sponsorship", async () => {
    subject = subject.trim().slice(0, 200);
    body = body.trim().slice(0, 5000);
    if (!subject || !body) throw new Error("Subject and message can't be empty.");
    // Only drafts are editable — a sent pitch should match what the sponsor received.
    const s = await must(
      db().from("sponsors").update({ pitch_subject: subject, pitch_body: body }).eq("id", id).eq("event_id", eventId).eq("status", "drafted").select("company").maybeSingle(),
    );
    if (!s) throw new Error("Only drafted pitches can be edited.");
    return `Pitch to ${s.company} updated`;
  });
}

/**
 * Fictional demo sponsors (@example.com) can't receive mail, so with DEMO_INBOX set their pitches land there instead,
 * labelled with the company they were written for. Real addresses are always used as-is.
 */
function pitchRecipient(email: string) {
  const inbox = process.env.DEMO_INBOX?.trim();
  return inbox && /@([\w-]+\.)*example\.com$/i.test(email) ? inbox : email;
}

async function deliverPitch(s: { id: string; company: string; contact_email: string; pitch_subject: string; pitch_body: string }) {
  const to = pitchRecipient(s.contact_email);
  const demo = to !== s.contact_email;
  await sendMail({
    to,
    subject: demo ? `[Demo → ${s.company}] ${s.pitch_subject}` : s.pitch_subject,
    text: demo ? `(Demo copy — this pitch is addressed to ${s.company} <${s.contact_email}>.)\n\n${s.pitch_body}` : s.pitch_body,
  });
  await must(db().from("sponsors").update({ status: "contacted" }).eq("id", s.id));
  return to;
}

/** Send one reviewed pitch. Only drafts can be sent, and only when the organiser clicks. */
export async function sendPitch(eventId: string, id: string) {
  return attempt(eventId, "sponsorship", async () => {
    const s = await must(db().from("sponsors").select("*").eq("id", id).eq("event_id", eventId).eq("status", "drafted").maybeSingle());
    if (!s) throw new Error("That pitch was already sent or isn't drafted yet.");
    const to = await deliverPitch(s);
    return `Pitch to ${s.company} sent to ${to}`;
  });
}

export async function sendPitches(eventId: string) {
  return attempt(eventId, "sponsorship", async () => {
    const drafts = await must(db().from("sponsors").select("*").eq("event_id", eventId).eq("status", "drafted"));
    if (!drafts.length) throw new Error("No drafted pitches to send. Run the Sponsorship agent first.");
    for (const s of drafts) await deliverPitch(s);
    return `Sent ${drafts.length} pitch email${drafts.length > 1 ? "s" : ""}`;
  });
}

export async function emailVolunteers(eventId: string) {
  return attempt(eventId, "logistics", async () => {
    const ev = await getEvent(eventId);
    const [vols, tasks] = await Promise.all([
      must(db().from("volunteers").select("*").eq("event_id", eventId)),
      must(db().from("tasks").select("*").eq("event_id", eventId).order("starts_at")),
    ]);
    const t = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
    let sent = 0;
    for (const v of vols) {
      const mine = tasks.filter((x) => x.volunteer_id === v.id);
      if (!mine.length) continue;
      await sendMail({
        to: v.email,
        subject: `Your shifts for ${ev.name}`,
        text: `Hi ${v.name},\n\nHere are your shifts for ${ev.name} on ${ev.date} at ${ev.venue}:\n\n${mine
          .map((x) => `${t(x.starts_at)}–${t(x.ends_at)}  ${x.title}`)
          .join("\n")}\n\nThanks!\nTeam ${ev.name}`,
      });
      sent++;
    }
    return `Emailed shifts to ${sent} volunteer${sent === 1 ? "" : "s"}`;
  });
}

export async function setCheckedIn(eventId: string, id: string, checked: boolean) {
  await requireAdmin();
  await must(db().from("attendees").update({ checked_in: checked }).eq("id", id).eq("event_id", eventId));
  revalidatePath(`/dashboard/${eventId}`);
}

export async function sendReminders(eventId: string) {
  return attempt(eventId, "comms", async () => {
    const ev = await getEvent(eventId);
    const c = ev.plan?.comms;
    if (!c) throw new Error("Run the Comms agent first to draft the reminder.");
    const att = await must(db().from("attendees").select("email").eq("event_id", eventId));
    for (const a of att) await sendMail({ to: a.email, subject: c.reminder_subject, text: c.reminder_body });
    return `Sent reminder to ${att.length} attendee${att.length === 1 ? "" : "s"}`;
  });
}

/**
 * Student accounts that aren't registered yet get the poster and an invite. Fictional demo students (@example.com) can't
 * receive mail, so with DEMO_STUDENT_INBOX set their invites go there — collapsed into one copy per run.
 */
export async function sendInvites(eventId: string) {
  return attempt(eventId, "comms", async () => {
    const ev = await getEvent(eventId);
    if (!ev.plan?.comms) throw new Error("Run the Comms agent first to write the invite.");
    const [students, registered] = await Promise.all([
      must(db().from("students").select("email")),
      must(db().from("attendees").select("email").eq("event_id", eventId)),
    ]);
    const have = new Set(registered.map((a) => a.email));
    const inbox = process.env.DEMO_STUDENT_INBOX?.trim();
    const to = [...new Set(students.map((s) => s.email).filter((e) => !have.has(e)).map((e) => (inbox && /@([\w-]+\.)*example\.com$/i.test(e) ? inbox : e)))];
    if (!to.length) throw new Error("Every student with an account is already registered.");

    const base = await appUrl();
    const link = `${base}/e/${eventId}`;
    const poster = await posterPng((await posterEvent(eventId))!, link);
    const day = new Date(ev.date).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
    const text = ev.plan.comms.announcement.replace("{link}", link);
    for (const email of to)
      await sendMail({
        to: email,
        subject: `You're invited: ${ev.name} — ${day}`,
        text: `${text}\n\nRegister: ${link}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#1a1310">
  <img src="cid:poster" alt="${ev.name} poster" style="width:100%;border-radius:12px" />
  <h1 style="font-size:24px;margin:24px 0 8px">${ev.name}</h1>
  <p style="margin:0 0 4px;color:#5a4d42">${day} · ${ev.venue}</p>
  <p style="font-size:15px;line-height:1.55">${text.replace(/Register:[\s\S]*$/, "").replace(/</g, "&lt;")}</p>
  <p><a href="${link}" style="display:inline-block;background:#ec6426;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:bold">Register now →</a></p>
  <p style="font-size:12px;color:#7a6d62">Sent by Relay on behalf of Team ${ev.name}.</p>
</div>`,
        attachments: [{ filename: "poster.png", content: poster, cid: "poster" }],
      });
    return `Invited ${to.length} student inbox${to.length === 1 ? "" : "es"} with the poster${inbox && to.includes(inbox) ? ` (demo copy → ${inbox})` : ""}`;
  });
}

export async function sendCertificates(eventId: string) {
  return attempt(eventId, "comms", async () => {
    const ev = await getEvent(eventId);
    const att = await must(
      db().from("attendees").select("*").eq("event_id", eventId).eq("checked_in", true).eq("certificate_sent", false),
    );
    if (!att.length) throw new Error("No checked-in attendees without a certificate.");
    for (const a of att) {
      const pdf = await certificatePdf({ name: a.name, event: ev.name, date: ev.date, club: `Team ${ev.name}` });
      await sendMail({
        to: a.email,
        subject: `Your certificate — ${ev.name}`,
        text: `Hi ${a.name},\n\nThanks for being at ${ev.name}. Your certificate of participation is attached.\n\nTeam ${ev.name}`,
        attachments: [{ filename: "certificate.pdf", content: pdf }],
      });
      await must(db().from("attendees").update({ certificate_sent: true }).eq("id", a.id));
    }
    return `Emailed ${att.length} certificate${att.length > 1 ? "s" : ""}`;
  });
}

export async function sendReport(eventId: string) {
  return attempt(eventId, "reporting", async () => {
    const ev = await getEvent(eventId);
    if (!ev.summary) throw new Error("Run the Reporting agent first.");
    const pdf = await buildReport(eventId);
    const confirmed = await must(db().from("sponsors").select("*").eq("event_id", eventId).eq("status", "confirmed"));
    if (!confirmed.length) throw new Error("No confirmed sponsors to send the report to.");
    for (const s of confirmed)
      await sendMail({
        to: s.contact_email,
        subject: `${ev.name} — partner report`,
        text: `Hi ${s.company} team,\n\nThank you for partnering with ${ev.name}. Our report is attached.\n\nTeam ${ev.name}`,
        attachments: [{ filename: "sponsor-report.pdf", content: pdf }],
      });
    return `Report emailed to ${confirmed.length} partner${confirmed.length > 1 ? "s" : ""}`;
  });
}

// ───────────────────────── public ─────────────────────────

export async function register(eventId: string, _prev: unknown, form: FormData) {
  const name = String(form.get("name") ?? "").trim().slice(0, 100);
  const email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 200);
  const usn = String(form.get("usn") ?? "").trim().slice(0, 20);
  if (!name || !EMAIL.test(email)) return { ok: false, message: "Enter your name and a valid email." };
  return enroll(eventId, name, email, usn);
}

/** Shared by the public form and the student portal: insert attendee, then best-effort confirmation mail. */
async function enroll(eventId: string, name: string, email: string, usn: string) {
  const { error } = await db().from("attendees").insert({ event_id: eventId, name, email, usn: usn || null });
  if (error) return { ok: false, message: error.code === "23505" ? "You're already registered." : "Could not register. Try again." };

  const ev = await getEvent(eventId);
  // Registration must succeed even if mail is down.
  await sendMail({
    to: email,
    subject: `You're in — ${ev.name}`,
    text: `Hi ${name},\n\nYou're registered for ${ev.name} on ${ev.date} at ${ev.venue}. See you there!\n\nTeam ${ev.name}`,
  }).catch((e) => console.error("confirmation mail failed", e));
  return { ok: true, message: `You're registered. A confirmation is on its way to ${email}.` };
}

// ───────────────────────── organiser login ─────────────────────────

export async function adminLogin(_prev: FormState, form: FormData): Promise<FormState> {
  const pass = process.env.ADMIN_PASSCODE;
  // shortcut: no rate limiting on passcode attempts, add one (and a long passcode) before real deployment.
  if (!pass || !sameSecret(String(form.get("passcode") ?? ""), pass)) return { ok: false, message: "That passcode isn't right." };
  (await cookies()).set(ADMIN_COOKIE, makeToken("admin", ADMIN_MAX_AGE), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_MAX_AGE,
  });
  const next = String(form.get("next") ?? "");
  // Only bounce back inside the desk — never to an arbitrary URL.
  redirect(/^\/dashboard(\/[\w-]*)?(\?[\w=&-]*)?$/.test(next) ? next : "/dashboard");
}

export async function adminLogout() {
  (await cookies()).delete(ADMIN_COOKIE);
  redirect("/admin/login");
}

// ───────────────────────── student portal ─────────────────────────

// `values` refills the form after an error (React resets it); never includes the password.
type FormState = { ok: boolean; message: string; values?: Record<string, string> } | null;

export async function signup(_prev: FormState, form: FormData): Promise<FormState> {
  const name = String(form.get("name") ?? "").trim().slice(0, 100);
  const email = String(form.get("email") ?? "").trim().toLowerCase().slice(0, 200);
  const usn = String(form.get("usn") ?? "").trim().toUpperCase().slice(0, 20);
  const password = String(form.get("password") ?? "");
  const values = { name, email, usn };
  if (!name || !EMAIL.test(email)) return { ok: false, message: "Enter your name and a valid email.", values };
  if (password.length < 8 || password.length > 200) return { ok: false, message: "Password must be at least 8 characters.", values };

  const { data, error } = await db()
    .from("students")
    .insert({ name, email, usn: usn || null, password_hash: await hashPassword(password) })
    .select("id")
    .single();
  if (error)
    return { ok: false, message: error.code === "23505" ? "An account with this email exists. Log in instead." : "Could not sign up. Try again.", values };
  await startSession(data.id);
  redirect("/student");
}

export async function login(_prev: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  // shortcut: no rate limiting on login attempts, add one before real deployment.
  const { data } = await db().from("students").select("id, password_hash").eq("email", email).maybeSingle();
  if (!data || !(await verifyPassword(password, data.password_hash))) return { ok: false, message: "Wrong email or password.", values: { email } };
  await startSession(data.id);
  redirect("/student");
}

export async function logout() {
  await endSession();
  redirect("/");
}

export async function registerMe(eventId: string): Promise<FormState> {
  const me = await currentStudent();
  if (!me) return { ok: false, message: "Log in again to register." };
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) return { ok: false, message: "Unknown event." };
  const r = await enroll(eventId, me.name, me.email, me.usn ?? "");
  revalidatePath("/student");
  return r;
}
