"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, ADMIN_MAX_AGE, makeToken, sameSecret } from "@/lib/token";
import { db, llm, requireAdmin, sendMail } from "@/lib/server";
import { currentStudent, endSession, hashPassword, startSession, verifyPassword } from "@/lib/student";
import { certificatePdf } from "@/lib/pdf";
import { buildReport, reportStats } from "@/lib/report";
import { assignExplained } from "@/lib/schedule";
import { appUrl, posterEvent, posterPng } from "@/lib/poster";
import { DEMO_MEMBERS, joinSkills, parseSkills } from "@/lib/roster";
import { DEFAULT_WEIGHTS } from "@/lib/fit";
import { ROLE_WINDOWS, UNPOPULAR, suggest, type Load } from "@/lib/match";
import { CONTRIBUTIONS, PAYMENT_STATUSES } from "@/lib/types";
import { offlineComms, offlinePitch, offlinePlan, offlineReport, offlineSuggestions, offlineTasks } from "@/lib/offline";

import type { AgentName } from "@/lib/agents";
import type { Alerted, Decision, DiffLine, Disruption, Reroute } from "@/lib/types";

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

// ───────────────────────── decision trail ─────────────────────────
// Every automated outcome is stored with the rules/scores behind it, and every status change is logged (append-only).

type NewDecision = Pick<Decision, "kind" | "subject" | "outcome" | "decided_by" | "why"> & { subject_id?: string | null };

async function record(eventId: string, rows: NewDecision[]) {
  if (!rows.length) return [] as string[];
  const ins = await must(db().from("decisions").insert(rows.map((r) => ({ ...r, event_id: eventId }))).select("id, decided_by"));
  await must(
    db().from("decision_log").insert(ins.map((d) => ({ decision_id: d.id, event_id: eventId, from_status: null, to_status: "auto", actor: d.decided_by, note: "Decided automatically" }))),
  );
  return ins.map((d) => d.id as string);
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
  kind_reason?: string;
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
Return JSON: {"kind": "funded"|"free", "kind_reason": string (one sentence: why free or funded), "name": string, "theme": string, "date": "YYYY-MM-DD" (future date), "budget": integer INR (0 if free),
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
  const brief = ev.brief.toLowerCase();
  const hasBudget = /₹|\brs\.?|\d+\s*k\b|lakh|budget/.test(brief);
  await record(eventId, [{
    kind: "plan",
    subject_id: eventId,
    subject: p.name,
    outcome: free ? "Planned as a free event — no budget, no sponsors" : `Planned as a funded event — ${inr(p.budget)}, ${p.tiers.length} sponsor tiers`,
    decided_by: off ? "Planner (offline rules)" : "Planner (Gemini)",
    why: {
      rules: [
        { rule: "Budget given in the brief", ok: hasBudget, detail: hasBudget ? "The brief names an amount" : "No amount in the brief" },
        { rule: "Brief reads as a free event (free / seminar / talk / workshop / meetup / ₹0)", ok: /free|seminar|talk|workshop|meetup|₹\s*0\b/.test(brief), detail: `Brief: “${ev.brief.slice(0, 120)}”` },
        { rule: "Organiser overrides respected", ok: true, detail: Object.keys(fixed).length ? `Kept as typed: ${Object.keys(fixed).join(", ")}` : "None set" },
      ],
      scores: { budget: inr(free ? 0 : p.budget), expected: p.expected_attendees },
      notes: p.kind_reason ? [p.kind_reason] : [],
    },
  }]);
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
  const { v: r, off: off2 } = await smart<{ pitches: { n: number; tier: string; fit_score: number; why?: string; subject: string; body: string }[] }>(
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
Also give "why": one sentence on the fit score and tier, specific to this company and audience.
Return JSON: {"pitches": [{"n": integer (same n), "tier": string, "fit_score": integer, "why": string, "subject": string, "body": string}]}`,
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
  await record(eventId, pitches.map((p) => {
    const t = tiers.find((x) => x.name === p.tier);
    const score = Math.round(p.fit_score);
    return {
      kind: "sponsor" as const,
      subject_id: leads[p.n].id,
      subject: leads[p.n].company,
      outcome: `${p.tier} tier · fit ${score}/100`,
      decided_by: off2 ? "Sponsorship agent (offline template)" : "Sponsorship agent (Gemini)",
      why: {
        rules: [
          { rule: `Tier “${p.tier}” exists in the event plan`, ok: !!t, detail: t ? `Ask ${inr(t.amount)} · perks: ${t.perks.join(", ")}` : "Not one of the planned tiers — check before sending" },
          { rule: "Fit score ≥ 60 to be worth pitching", ok: score >= 60, detail: score >= 60 ? `${score}/100 clears the bar` : `${score}/100 — weak fit` },
          { rule: "Nothing is sent without the organiser", ok: true, detail: "Saved as a draft; sending is a manual click" },
        ],
        scores: { fit: score, ask: t ? inr(t.amount) : "—", audience: ev.expected_attendees ?? "—" },
        notes: p.why ? [p.why] : off2 ? ["Offline template: tier kept from the lead, or by position among the planned tiers"] : [],
      },
    };
  }));
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
  const { who, why } = assignExplained(slots, vols);
  await must(db().from("tasks").delete().eq("event_id", eventId));
  const ins = await must(db().from("tasks").insert(slots.map((s, i) => ({ ...s, event_id: eventId, volunteer_id: who[i] }))).select("id"));
  await record(eventId, slots.map((s, i) => ({
    kind: "shift" as const,
    subject_id: ins[i]?.id,
    subject: `${s.title} · ${span(s)}`,
    outcome: who[i] ? `Assigned to ${vols.find((v) => v.id === who[i])?.name}` : "Left open — nobody free",
    decided_by: "Logistics scheduler",
    why: why[i],
  })));
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

// ───────────────────────── sponsor deals: terms, payments, deliverables (migration 002) ─────────────────────────

const TERM_KEYS = ["obligations", "exclusivity", "data_sharing", "branding", "payment_terms", "reporting", "deadline"] as const;

async function sponsorOf(eventId: string, sponsorId: string) {
  return must(db().from("sponsors").select("id, company, tier, status, terms").eq("id", sponsorId).eq("event_id", eventId).single());
}

export async function saveDeal(eventId: string, sponsorId: string, d: { value: number | null; contribution_type: string | null; terms: Record<string, string> }) {
  return attempt(eventId, "sponsorship", async () => {
    const s = await sponsorOf(eventId, sponsorId);
    const value = d.value == null || Number.isNaN(d.value) ? null : Math.round(d.value);
    if (value != null && (value < 0 || value > 10_000_000)) throw new Error("Value must be between ₹0 and ₹1 crore.");
    if (d.contribution_type && !(CONTRIBUTIONS as readonly string[]).includes(d.contribution_type)) throw new Error("Unknown contribution type.");
    const terms = Object.fromEntries(TERM_KEYS.map((k) => [k, String(d.terms[k] ?? "").trim().slice(0, 500)]).filter(([, v]) => v));
    await must(db().from("sponsors").update({ value, contribution_type: d.contribution_type || null, terms }).eq("id", sponsorId));
    await audit("sponsor", sponsorId, "deal_terms_saved", { company: s.company, value, terms }, eventId);
    return `Deal terms saved for ${s.company}`;
  });
}

export async function addPayment(eventId: string, sponsorId: string, p: { label: string; amount: number; due_date: string }) {
  return attempt(eventId, "sponsorship", async () => {
    const s = await sponsorOf(eventId, sponsorId);
    const label = p.label.trim().slice(0, 120);
    const amount = Math.round(Number(p.amount));
    if (!label) throw new Error("Name the milestone, e.g. “50% on signing”.");
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be more than ₹0.");
    if (p.due_date && !/^\d{4}-\d{2}-\d{2}$/.test(p.due_date)) throw new Error("Pick a due date.");
    const r = await must(db().from("sponsor_payments").insert({ sponsor_id: sponsorId, label, amount, due_date: p.due_date || null }).select("id").single());
    await audit("payment", r.id, "milestone_added", { company: s.company, label, amount }, eventId);
    return `Payment milestone added for ${s.company}`;
  });
}

export async function updatePayment(eventId: string, paymentId: string, status: string, received: number) {
  return attempt(eventId, "sponsorship", async () => {
    if (!(PAYMENT_STATUSES as readonly string[]).includes(status)) throw new Error("Unknown payment status.");
    const p = await must(db().from("sponsor_payments").select("id, amount, label, sponsors!inner(event_id, company)").eq("id", paymentId).eq("sponsors.event_id", eventId).single());
    const got = status === "received" ? p.amount : Math.max(0, Math.min(p.amount, Math.round(Number(received) || 0)));
    if (status === "partially_received" && (got <= 0 || got >= p.amount)) throw new Error("For a partial payment, enter how much arrived (less than the full amount).");
    await must(db().from("sponsor_payments").update({ status, received_amount: got, updated_at: new Date().toISOString() }).eq("id", paymentId));
    const company = (p.sponsors as unknown as { company: string }).company;
    await audit("payment", paymentId, "status_changed", { company, label: p.label, status, received: got }, eventId);
    return `${company} · ${p.label}: ${status.replace(/_/g, " ")}`;
  });
}

export async function deletePayment(eventId: string, paymentId: string) {
  return attempt(eventId, "sponsorship", async () => {
    const p = await must(db().from("sponsor_payments").select("id, label, sponsors!inner(event_id)").eq("id", paymentId).eq("sponsors.event_id", eventId).single());
    await must(db().from("sponsor_payments").delete().eq("id", paymentId));
    await audit("payment", paymentId, "milestone_deleted", { label: p.label }, eventId);
    return "Milestone removed";
  });
}

/** Turn the sponsor's tier perks plus the standard publicity plan into a checklist. */
export async function generateDeliverables(eventId: string, sponsorId: string) {
  return attempt(eventId, "sponsorship", async () => {
    const s = await sponsorOf(eventId, sponsorId);
    const ev = await getEvent(eventId);
    const perks: string[] = (ev.plan?.tiers ?? []).find((t: { name: string }) => t.name === s.tier)?.perks ?? [];
    const items = [...perks, "Logo on posters, standees and stage backdrop", "3 social posts on Instagram and LinkedIn", "Thank-you mention on stage", "Logo and link on the registration page", "Post-event partner report sent"];
    const have = new Set((await must(db().from("sponsor_deliverables").select("item").eq("sponsor_id", sponsorId))).map((d) => d.item));
    const add = items.filter((i) => !have.has(i)).map((item) => ({ sponsor_id: sponsorId, item, due_date: ev.date }));
    if (add.length) await must(db().from("sponsor_deliverables").insert(add));
    await audit("sponsor", sponsorId, "deliverables_generated", { company: s.company, count: add.length }, eventId);
    return add.length ? `Added ${add.length} deliverables for ${s.company}` : "Checklist is already complete";
  });
}

export async function addDeliverable(eventId: string, sponsorId: string, item: string) {
  return attempt(eventId, "sponsorship", async () => {
    await sponsorOf(eventId, sponsorId);
    const it = item.trim().slice(0, 200);
    if (!it) throw new Error("Describe the deliverable.");
    await must(db().from("sponsor_deliverables").insert({ sponsor_id: sponsorId, item: it }));
    return "Deliverable added";
  });
}

export async function setDeliverable(eventId: string, id: string, done: boolean, evidence: string) {
  return attempt(eventId, "sponsorship", async () => {
    const ev = evidence.trim();
    if (ev && !/^https?:\/\/\S+$/i.test(ev)) throw new Error("Evidence must be a link (http/https), e.g. a photo or post.");
    const d = await must(db().from("sponsor_deliverables").select("id, item, sponsors!inner(event_id, company)").eq("id", id).eq("sponsors.event_id", eventId).single());
    await must(db().from("sponsor_deliverables").update({ done, evidence_url: ev || null, done_at: done ? new Date().toISOString() : null }).eq("id", id));
    await audit("deliverable", id, done ? "delivered" : "reopened", { item: d.item, evidence: ev || null }, eventId);
    return `${d.item}: ${done ? "delivered" : "reopened"}`;
  });
}

export async function markProposalSent(eventId: string, sponsorId: string) {
  return attempt(eventId, "sponsorship", async () => {
    const s = await sponsorOf(eventId, sponsorId);
    await must(db().from("sponsors").update({ proposal_sent_at: new Date().toISOString() }).eq("id", sponsorId));
    await audit("sponsor", sponsorId, "proposal_sent", { company: s.company }, eventId);
    return `Proposal marked as sent to ${s.company}`;
  });
}

/** Event-level numbers for sponsor reports. Stored in events.plan.metrics, so this works before migration 002. */
export async function saveMetrics(eventId: string, m: { social_reach: string; challenge_participants: string; photos: string }) {
  return attempt(eventId, "reporting", async () => {
    const ev = await getEvent(eventId);
    const num = (s: string) => (s.trim() === "" ? null : Math.max(0, Math.round(Number(s))));
    const photos = m.photos.split(/\s+/).map((u) => u.trim()).filter(Boolean);
    if (photos.some((u) => !/^https?:\/\/\S+$/i.test(u))) throw new Error("Photo links must start with http:// or https://");
    const metrics = { social_reach: num(m.social_reach), challenge_participants: num(m.challenge_participants), photos: photos.slice(0, 12) };
    if ([metrics.social_reach, metrics.challenge_participants].some((n) => n != null && Number.isNaN(n))) throw new Error("Reach and participants must be numbers.");
    await must(db().from("events").update({ plan: { ...ev.plan, metrics } }).eq("id", eventId));
    return "Event numbers saved";
  });
}

// ───────────────────────── volunteer profiles, mission roles, rewards, incidents (migration 002) ─────────────────────────

const SLOT = /^\d{2}:\d{2}$/;
type ProfileInput = {
  name: string;
  email: string;
  skills: string[];
  preferred_roles: string[];
  availability: { date?: string; weekday?: number; from: string; to: string }[];
  available: boolean;
  learning_goals: string;
  reward_prefs: string[];
  languages: string[];
  accessibility_needs: string;
  opted_in: boolean;
};

/** Validate and normalise a profile. Only the fields matching uses — nothing sensitive is asked or stored. */
function cleanProfile(p: ProfileInput) {
  const name = p.name.trim().slice(0, 100);
  const email = p.email.trim().toLowerCase().slice(0, 200);
  if (!name || !EMAIL.test(email)) throw new Error("Enter a name and a valid email.");
  const list = (xs: string[], max = 12) => [...new Set(xs.map((x) => x.trim().toLowerCase()).filter(Boolean))].slice(0, max);
  const availability = (p.availability ?? []).slice(0, 20).map((s) => {
    if (!SLOT.test(s.from) || !SLOT.test(s.to) || s.from >= s.to) throw new Error("Each availability slot needs a start time before its end time.");
    if (s.date && !/^\d{4}-\d{2}-\d{2}$/.test(s.date)) throw new Error("Availability dates must be dates.");
    if (!s.date && !(Number.isInteger(s.weekday) && s.weekday! >= 0 && s.weekday! <= 6)) throw new Error("Pick a date or a weekday for each slot.");
    return s.date ? { date: s.date, from: s.from, to: s.to } : { weekday: s.weekday, from: s.from, to: s.to };
  });
  const rewards = list(p.reward_prefs).filter((r) => ["certificate", "meal", "merch", "reimbursement", "recommendation", "mentor_session", "priority_access"].includes(r));
  return {
    name,
    email,
    skills: list(p.skills),
    preferred_roles: list(p.preferred_roles),
    availability,
    available: !!p.available,
    learning_goals: p.learning_goals.trim().slice(0, 300) || null,
    reward_prefs: rewards,
    languages: list(p.languages, 8),
    accessibility_needs: p.accessibility_needs.trim().slice(0, 300) || null,
    opted_in: !!p.opted_in,
    updated_at: new Date().toISOString(),
  };
}

async function volAction(fn: () => Promise<string>, paths = ["/dashboard/volunteers"]): Promise<Result> {
  try {
    await requireAdmin();
    return { ok: true, message: await fn() };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  } finally {
    for (const p of paths) revalidatePath(p);
  }
}

/** Organiser edits a profile (e.g. to fix a typo). The volunteer stays in control of opt-in from the student portal. */
export async function saveProfile(id: string | null, p: ProfileInput) {
  return volAction(async () => {
    const row = cleanProfile(p);
    const r = id ? await must(db().from("volunteer_profiles").update(row).eq("id", id).select("id").single()) : await must(db().from("volunteer_profiles").insert(row).select("id").single());
    await audit("volunteer_profile", r.id, id ? "edited_by_organiser" : "created_by_organiser", { name: row.name });
    return `${row.name}'s profile saved`;
  });
}

const REWARD_WORDS: [RegExp, string][] = [
  [/certificate/i, "certificate"], [/meal/i, "meal"], [/merch|swag/i, "merch"], [/reimburse/i, "reimbursement"],
  [/recommendation/i, "recommendation"], [/mentor/i, "mentor_session"], [/priority/i, "priority_access"],
];

/** A completed role earns the rewards its role card promises (as "promised" until the organiser marks them delivered). */
async function promiseRewards(eventId: string, profileId: string, roleKey: string) {
  const role = await must(db().from("roles").select("reward").eq("key", roleKey).single());
  const kinds = REWARD_WORDS.filter(([re]) => re.test(role.reward)).map(([, k]) => k);
  const have = new Set((await must(db().from("rewards").select("kind").eq("profile_id", profileId).eq("event_id", eventId))).map((r) => r.kind));
  const add = kinds.filter((k) => !have.has(k)).map((kind) => ({ profile_id: profileId, event_id: eventId, kind, note: `For ${roleKey.replace(/_/g, " ")}` }));
  if (add.length) await must(db().from("rewards").insert(add));
}

/** Run the fair matcher for every mission role that isn't filled yet. Replaces old suggestions; keeps requests and acceptances. */
export async function suggestRoles(eventId: string) {
  return attempt(eventId, "logistics", async () => {
    const ev = await getEvent(eventId);
    if (!ev.date) throw new Error("Set the event date first (run the Planner or Edit details).");
    const since = new Date(Date.now() - 120 * 86_400_000).toISOString();
    const [roles, profiles, mine, history] = await Promise.all([
      must(db().from("roles").select("*").order("sort")),
      must(db().from("volunteer_profiles").select("*")),
      must(db().from("role_requests").select("*").eq("event_id", eventId)),
      must(db().from("role_requests").select("profile_id, role_key").in("status", ["accepted", "completed"]).gte("updated_at", since)),
    ]);
    const live = mine.filter((r) => r.status !== "suggested" && r.status !== "declined");
    const filled = new Set(live.map((r) => r.role_key));
    const taken = new Set(live.map((r) => r.profile_id));
    const declinedPairs = new Set(mine.filter((r) => r.status === "declined").map((r) => `${r.role_key}:${r.profile_id}`));
    const load: Record<string, Load> = {};
    for (const h of history) {
      load[h.profile_id] ??= { recent: 0, unpopular: 0 };
      load[h.profile_id].recent++;
      if (UNPOPULAR.has(h.role_key)) load[h.profile_id].unpopular++;
    }
    const open = roles.filter((r) => !filled.has(r.key)).map((r) => ({ key: r.key, name: r.name, skills: r.skills, from: ROLE_WINDOWS[r.key]?.[0] ?? "09:00", to: ROLE_WINDOWS[r.key]?.[1] ?? "17:00" }));
    const out = suggest(open, profiles, load, ev.date, taken).filter((s) => s.profileId && !declinedPairs.has(`${s.roleKey}:${s.profileId}`));
    await must(db().from("role_requests").delete().eq("event_id", eventId).eq("status", "suggested"));
    if (out.length) {
      const rows = await must(db().from("role_requests").insert(out.map((s) => ({ event_id: eventId, role_key: s.roleKey, profile_id: s.profileId, status: "suggested", reason: s.reason }))).select("id, role_key"));
      await record(eventId, out.map((s) => {
        const role = open.find((r) => r.key === s.roleKey)!;
        return {
          kind: "role" as const,
          subject_id: rows.find((x) => x.role_key === s.roleKey)?.id,
          subject: `${role.name} · ${role.from}–${role.to}`,
          outcome: `Suggested ${profiles.find((p) => p.id === s.profileId)?.name}`,
          decided_by: "Fair role matcher",
          why: { ...s.why, notes: [s.reason] },
        };
      }));
    }
    await audit("role_requests", null, "suggested", { count: out.length, open: open.length }, eventId);
    return `${out.length} of ${open.length} open roles have a suggestion — review, then send requests`;
  });
}

export async function setRoleStatus(eventId: string, requestId: string, status: "requested" | "accepted" | "declined" | "completed") {
  return attempt(eventId, "logistics", async () => {
    if (!["requested", "accepted", "declined", "completed"].includes(status)) throw new Error("Unknown status.");
    const r = await must(db().from("role_requests").update({ status, updated_at: new Date().toISOString() }).eq("id", requestId).eq("event_id", eventId).select("profile_id, role_key").single());
    if (status === "completed") {
      await promiseRewards(eventId, r.profile_id, r.role_key);
      await must(db().from("volunteer_feedback").insert({ profile_id: r.profile_id, event_id: eventId, kind: "completed", note: `Completed ${r.role_key.replace(/_/g, " ")}` }));
    }
    await audit("role_request", requestId, status, { role: r.role_key, profile: r.profile_id }, eventId);
    return status === "requested" ? "Request sent — it shows in their volunteer page" : `Marked ${status}`;
  });
}

/** Organiser picks someone else. Recorded as an override so the matcher's suggestion and the human decision stay distinct. */
export async function overrideRole(eventId: string, requestId: string, profileId: string) {
  return attempt(eventId, "logistics", async () => {
    const p = await must(db().from("volunteer_profiles").select("name").eq("id", profileId).single());
    const clash = await must(db().from("role_requests").select("id").eq("event_id", eventId).eq("profile_id", profileId).neq("id", requestId).not("status", "in", "(declined,suggested)"));
    if (clash.length) throw new Error(`${p.name} already has a role at this event.`);
    const r = await must(db().from("role_requests").update({ profile_id: profileId, overridden: true, status: "requested", reason: `Chosen by the organiser (manual override).`, updated_at: new Date().toISOString() }).eq("id", requestId).eq("event_id", eventId).select("role_key").single());
    await audit("role_request", requestId, "overridden", { role: r.role_key, profile: profileId }, eventId);
    // A direct organiser override is a decision status change too. During an appeal, resolveAppeal records it instead.
    const dec = await must(db().from("decisions").select("id, status").eq("subject_id", requestId).order("created_at", { ascending: false }).limit(1));
    if (dec[0] && dec[0].status !== "appealed" && dec[0].status !== "overridden") await transition(dec[0].id, "overridden", "Organiser", `Manual override → ${p.name}`, { outcome: `Overridden → ${p.name}` });
    return `${p.name} requested for ${r.role_key.replace(/_/g, " ")}`;
  });
}

export async function removeRoleRequest(eventId: string, requestId: string) {
  return attempt(eventId, "logistics", async () => {
    await must(db().from("role_requests").delete().eq("id", requestId).eq("event_id", eventId));
    await audit("role_request", requestId, "removed", {}, eventId);
    return "Removed";
  });
}

export async function addFeedback(eventId: string, profileId: string, kind: string, note: string, visible: boolean) {
  return attempt(eventId, "logistics", async () => {
    if (!["completed", "no_show", "late", "kudos", "note"].includes(kind)) throw new Error("Unknown feedback type.");
    await must(db().from("volunteer_feedback").insert({ profile_id: profileId, event_id: eventId, kind, note: note.trim().slice(0, 300) || null, visible_to_volunteer: visible }));
    await audit("volunteer_feedback", profileId, kind, { note }, eventId);
    return "Feedback recorded";
  });
}

/** Mark a reliability record as wrong. It stays in history (audited) but stops counting. */
export async function correctFeedback(id: string, corrected: boolean) {
  return volAction(async () => {
    const f = await must(db().from("volunteer_feedback").update({ corrected }).eq("id", id).select("event_id, kind").single());
    await audit("volunteer_feedback", id, corrected ? "corrected" : "restored", { kind: f.kind }, f.event_id);
    return corrected ? "Marked as corrected — it no longer counts" : "Restored";
  });
}

export async function setRewardDelivered(id: string, delivered: boolean) {
  return volAction(async () => {
    const r = await must(db().from("rewards").update({ status: delivered ? "delivered" : "promised", delivered_at: delivered ? new Date().toISOString() : null }).eq("id", id).select("kind, event_id").single());
    await audit("reward", id, delivered ? "delivered" : "undelivered", { kind: r.kind }, r.event_id);
    return delivered ? "Reward marked delivered" : "Reward marked promised";
  });
}

export async function addIncident(eventId: string, title: string, severity: string, note: string) {
  return attempt(eventId, "logistics", async () => {
    const t = title.trim().slice(0, 160);
    if (!t) throw new Error("Describe the incident.");
    if (!["low", "medium", "high"].includes(severity)) throw new Error("Pick a severity.");
    const r = await must(db().from("incidents").insert({ event_id: eventId, title: t, severity, note: note.trim().slice(0, 1000) || null }).select("id").single());
    await audit("incident", r.id, "opened", { title: t, severity }, eventId);
    return "Incident logged";
  });
}

export async function resolveIncident(eventId: string, id: string) {
  return attempt(eventId, "logistics", async () => {
    const r = await must(db().from("incidents").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("id", id).eq("event_id", eventId).select("title").single());
    await audit("incident", id, "resolved", { title: r.title }, eventId);
    return `Resolved: ${r.title}`;
  });
}

// ── volunteer side (signed-in student) ──

async function myProfile() {
  const me = await currentStudent();
  if (!me) throw new Error("Log in to your student account first.");
  const p = await must(db().from("volunteer_profiles").select("*").eq("email", me.email).maybeSingle());
  return { me, p };
}

async function studentAction(fn: () => Promise<string>): Promise<Result> {
  try {
    return { ok: true, message: await fn() };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  } finally {
    revalidatePath("/student/volunteer");
  }
}

/** Opt in (or update / opt out). The email always comes from the session, never from the form. */
export async function saveMyProfile(p: Omit<ProfileInput, "name" | "email">) {
  return studentAction(async () => {
    const { me } = await myProfile();
    const row = cleanProfile({ ...p, name: me.name, email: me.email });
    await must(db().from("volunteer_profiles").upsert({ ...row, student_id: me.id }, { onConflict: "email" }));
    return row.opted_in ? "Profile saved — organisers can now offer you roles" : "You've opted out — you won't be suggested for roles";
  });
}

export async function applyForRole(eventId: string, roleKey: string) {
  return studentAction(async () => {
    const { p } = await myProfile();
    if (!p?.opted_in) throw new Error("Opt in with your volunteer profile first.");
    const { error } = await db().from("role_requests").insert({ event_id: eventId, role_key: roleKey, profile_id: p.id, status: "requested", reason: `Applied by ${p.name}.` });
    if (error) throw new Error(error.code === "23505" ? "You've already applied for this role." : "Could not apply. Try again.");
    await audit("role_request", null, "applied", { role: roleKey, profile: p.id }, eventId);
    return "Applied — the organisers will confirm";
  });
}

/** Accept or decline a role an organiser offered. Applications you made yourself are confirmed by the organiser instead. */
export async function respondToRole(requestId: string, accept: boolean) {
  return studentAction(async () => {
    const { p } = await myProfile();
    if (!p) throw new Error("Create your volunteer profile first.");
    const r = await must(db().from("role_requests").select("id, status, reason, event_id, role_key").eq("id", requestId).eq("profile_id", p.id).single());
    if (r.status !== "requested" || r.reason?.startsWith("Applied by")) throw new Error("There's nothing to respond to on this one.");
    await must(db().from("role_requests").update({ status: accept ? "accepted" : "declined", updated_at: new Date().toISOString() }).eq("id", requestId));
    await audit("role_request", requestId, accept ? "accepted_by_volunteer" : "declined_by_volunteer", { role: r.role_key }, r.event_id);
    return accept ? "Accepted — see you there!" : "Declined. Thanks for letting us know.";
  });
}

export async function confirmCompletion(requestId: string) {
  return studentAction(async () => {
    const { p } = await myProfile();
    if (!p) throw new Error("Create your volunteer profile first.");
    const r = await must(db().from("role_requests").select("id, status, event_id, role_key").eq("id", requestId).eq("profile_id", p.id).single());
    if (r.status !== "accepted") throw new Error("Only accepted roles can be marked complete.");
    await must(db().from("role_requests").update({ status: "completed", updated_at: new Date().toISOString() }).eq("id", requestId));
    await promiseRewards(r.event_id, p.id, r.role_key);
    await audit("role_request", requestId, "completed_by_volunteer", { role: r.role_key }, r.event_id);
    return "Marked complete — your rewards are listed below";
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
    await audit("sponsor", id, "status_changed", { company: s.company, status }, eventId);
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

async function deliverPitch(s: { id: string; event_id: string; company: string; contact_email: string; pitch_subject: string; pitch_body: string }) {
  const to = pitchRecipient(s.contact_email);
  const demo = to !== s.contact_email;
  await sendMail({
    to,
    subject: demo ? `[Demo → ${s.company}] ${s.pitch_subject}` : s.pitch_subject,
    text: demo ? `(Demo copy — this pitch is addressed to ${s.company} <${s.contact_email}>.)\n\n${s.pitch_body}` : s.pitch_body,
  });
  await must(db().from("sponsors").update({ status: "contacted" }).eq("id", s.id));
  await audit("sponsor", s.id, "pitch_sent", { company: s.company, to }, s.event_id);
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
        to: alertRecipient({ email: v.email, role: "volunteer" }),
        subject: `${FICTIONAL.test(v.email) ? `[Demo → ${v.name}] ` : ""}Your shifts for ${ev.name}`,
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
    const att = await must(db().from("attendees").select("name, email").eq("event_id", eventId));
    for (const a of att) {
      const to = pitchRecipient(a.email);
      await sendMail({ to, subject: `${to !== a.email ? `[Demo → ${a.name}] ` : ""}${c.reminder_subject}`, text: c.reminder_body });
    }
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
        to: pitchRecipient(a.email),
        subject: `${pitchRecipient(a.email) !== a.email ? `[Demo → ${a.name}] ` : ""}Your certificate — ${ev.name}`,
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
        to: pitchRecipient(s.contact_email),
        subject: `${pitchRecipient(s.contact_email) !== s.contact_email ? `[Demo → ${s.company}] ` : ""}${ev.name} — partner report`,
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

// ───────────────────────── campus chaos re-router ─────────────────────────
// A live change hits the event; recompute only the records it touches, write them, and tell exactly the people affected.

const hm = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });
const span = (t: { starts_at: string; ends_at: string }) => `${hm(t.starts_at)}–${hm(t.ends_at)}`;

const FICTIONAL = /@([\w-]+\.)*example\.com$/i;
/**
 * Where a disruption alert actually goes. Fictional @example.com volunteers → one of DEMO_VOLUNTEER_EMAILS (same
 * person always lands in the same inbox), so a live demo reaches real phones. Everyone else follows the pitch rule
 * (fictional → DEMO_INBOX, real → as-is).
 */
function alertRecipient(a: Pick<Alerted, "email" | "role">) {
  const demo = (process.env.DEMO_VOLUNTEER_EMAILS ?? "").split(",").map((e) => e.trim()).filter(Boolean);
  if (a.role === "volunteer" && demo.length && FICTIONAL.test(a.email)) {
    const h = [...a.email.toLowerCase()].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
    return demo[h % demo.length];
  }
  return pitchRecipient(a.email);
}

async function reroute(eventId: string, d: Disruption): Promise<Reroute> {
  const ev = await getEvent(eventId);
  const [vols, tasks, att, sps] = await Promise.all([
    must(db().from("volunteers").select("*").eq("event_id", eventId)),
    must(db().from("tasks").select("*").eq("event_id", eventId).order("starts_at")),
    must(db().from("attendees").select("name, email").eq("event_id", eventId)),
    must(db().from("sponsors").select("*").eq("event_id", eventId)),
  ]);
  const changes: DiffLine[] = [];
  const alerts = new Map<string, Alerted>();
  const tell = (name: string, email: string, role: Alerted["role"], line: DiffLine) => {
    const a = alerts.get(email) ?? { name, email, role, lines: [] };
    a.lines.push(line);
    alerts.set(email, a);
  };
  let headline: string, scope: string, total: number;

  if (d.kind === "volunteer_out") {
    const out = vols.find((v) => v.id === d.volunteerId);
    if (!out) throw new Error("Pick a volunteer.");
    const hit = tasks.filter((t) => t.volunteer_id === out.id);
    const has = (v: { skills: string | null } | undefined, skill: string | null) => !skill || !!v?.skills?.toLowerCase().includes(skill.toLowerCase().trim());

    // Pass 1: only the dropped shifts go back through the scheduler, around the event team's existing shifts.
    const team = vols.filter((v) => v.id !== out.id);
    const p1 = assignExplained(hit, team, tasks.filter((t) => t.volunteer_id !== out.id));
    const first = p1.who;
    // Pass 2: shifts nobody on the team can do properly (no one free, or only someone without the skill)
    // go to available club roster members who aren't on this event yet.
    const gap = hit.map((t, i) => (first[i] && has(team.find((v) => v.id === first[i]), t.skill) ? -1 : i)).filter((i) => i >= 0);
    const onEvent = new Set(vols.map((v) => v.email.toLowerCase()));
    const bench = gap.length
      ? (await must(db().from("volunteers").select("id, name, email, skills, profile").is("event_id", null)))
          .filter((m) => parseSkills(m.skills).available && !onEvent.has(m.email.toLowerCase()))
          .map((m) => ({ ...m, skills: parseSkills(m.skills).skills.join(", ") }))
      : [];
    const p2 = assignExplained(gap.map((i) => hit[i]), bench);
    const second = p2.who;
    const who = [...first];
    const viaRoster = new Map<number, number>(); // hit index → position in gap
    const joined = new Map<string, { id: string; name: string; email: string }>(); // roster id → new event volunteer
    for (const [k, i] of gap.entries()) {
      const m = bench.find((b) => b.id === second[k]);
      if (!m || (!has(m, hit[i].skill) && first[i])) continue; // a roster member without the skill is no better than pass 1
      if (!joined.has(m.id)) {
        const row = await must(db().from("volunteers").insert({ event_id: eventId, name: m.name, email: m.email, skills: m.skills, profile: m.profile }).select("id, name, email").single());
        joined.set(m.id, row);
      }
      who[i] = joined.get(m.id)!.id;
      viaRoster.set(i, k);
    }
    const people = [...team, ...joined.values()];

    const lead = { rule: `${out.name} is unavailable`, ok: true, detail: "Only their shifts were recomputed; everyone else's stay as they were" };
    const ids = await record(eventId, hit.map((t, i) => {
      const next = people.find((v) => v.id === who[i]);
      const k = viaRoster.get(i);
      const base = k !== undefined ? p2.why[k] : p1.why[i];
      const roster = k !== undefined
        ? [
            { rule: "Event team couldn't cover it properly", ok: true, detail: first[i] ? `Only ${team.find((v) => v.id === first[i])?.name} was free, without “${t.skill}”` : "Everyone on the event team was busy" },
            { rule: "Backfill from the club roster", ok: true, detail: "Available members not already on this event were considered" },
          ]
        : [];
      return {
        kind: "reroute" as const,
        subject_id: t.id,
        subject: `${t.title} · ${span(t)}`,
        outcome: next ? `Re-assigned ${out.name} → ${next.name}${k !== undefined ? " (club roster)" : ""}` : "Left open — nobody free",
        decided_by: "Chaos Re-Router",
        why: { ...base, rules: [lead, ...roster, ...base.rules] },
      };
    }));

    for (const [i, t] of hit.entries()) {
      await must(db().from("tasks").update({ volunteer_id: who[i] }).eq("id", t.id));
      const next = people.find((v) => v.id === who[i]);
      const fromRoster = [...joined.values()].some((j) => j.id === who[i]);
      const line = { record: `${t.title} · ${span(t)}`, before: out.name, after: next ? `${next.name}${fromRoster ? " (from club roster)" : ""}` : "Unassigned — needs hands", decision: ids[i] };
      changes.push(line);
      tell(out.name, out.email, "volunteer", line);
      if (next) tell(next.name, next.email, "volunteer", line);
    }
    // Keep them off auto-staffing until someone marks them available again on the Volunteers page.
    const member = await must(db().from("volunteers").select("id, skills").is("event_id", null).eq("email", out.email.toLowerCase()));
    for (const m of member) await must(db().from("volunteers").update({ skills: joinSkills(parseSkills(m.skills).skills, false) }).eq("id", m.id));

    headline = `${out.name} is unavailable — ${hit.length} shift${hit.length === 1 ? "" : "s"} re-routed${joined.size ? ` · ${joined.size} backfilled from club roster` : ""}`;
    scope = "shifts";
    total = tasks.length;
  } else if (d.kind === "venue_change") {
    const venue = d.venue?.trim().slice(0, 120);
    const minutes = Math.round(Number(d.minutes) || 0);
    if (Math.abs(minutes) > 720) throw new Error("Delay must be within 12 hours.");
    if (!venue && !minutes) throw new Error("Give a new venue, a delay, or both.");
    if (minutes && d.from && !/^\d{2}:\d{2}$/.test(d.from)) throw new Error("Time must be HH:MM.");
    if (minutes && d.from && !ev.date) throw new Error("The event has no date yet.");
    const from = minutes && d.from ? Date.parse(`${ev.date}T${d.from}:00+05:30`) : -Infinity;
    const audience: DiffLine[] = [];
    const moved = venue && venue !== ev.venue;

    if (moved) {
      await must(db().from("events").update({ venue }).eq("id", eventId));
      const line = { record: "Venue", before: ev.venue ?? "TBA", after: venue };
      changes.push(line);
      audience.push(line);
    }
    // Every task from `from` on moves by the same amount, so clash-freedom is preserved.
    const hit = minutes ? tasks.filter((t) => Date.parse(t.starts_at) >= from) : [];
    const shift = (iso: string) => new Date(Date.parse(iso) + minutes * 60_000).toISOString();
    for (const t of hit) {
      const next = { starts_at: shift(t.starts_at), ends_at: shift(t.ends_at) };
      await must(db().from("tasks").update(next).eq("id", t.id));
      const v = vols.find((x) => x.id === t.volunteer_id);
      const [decision] = await record(eventId, [{
        kind: "reroute",
        subject_id: t.id,
        subject: `${t.title}${v ? ` (${v.name})` : ""}`,
        outcome: `Moved ${span(t)} → ${span(next)}`,
        decided_by: "Chaos Re-Router",
        why: {
          rules: [
            { rule: d.from ? `Starts at or after ${d.from}` : "Whole day shifts", ok: true, detail: `This shift started at ${hm(t.starts_at)}` },
            { rule: `Every later shift moves by ${minutes} min`, ok: true, detail: "Same offset for all of them, so no new clashes" },
            { rule: "Volunteer kept", ok: true, detail: v ? `${v.name} stays on it` : "Was unassigned" },
          ],
        },
      }]);
      const line = { record: `${t.title}${v ? ` (${v.name})` : ""}`, before: span(t), after: span(next), decision };
      changes.push(line);
      if (v) tell(v.name, v.email, "volunteer", line);
    }
    if (hit.length) audience.push({ record: "Programme from", before: hm(hit[0].starts_at), after: hm(shift(hit[0].starts_at)) });
    // Venue/time affect everyone on site: attendees, and volunteers who hold any shift.
    const onShift = vols.filter((v) => tasks.some((t) => t.volunteer_id === v.id));
    for (const line of audience) {
      for (const a of att) tell(a.name, a.email, "attendee", line);
      for (const v of onShift) tell(v.name, v.email, "volunteer", line);
    }
    const parts = [moved ? `Moved to ${venue}` : "", hit.length ? `${hit.length} shift${hit.length === 1 ? "" : "s"} ${minutes > 0 ? "pushed" : "pulled"} ${Math.abs(minutes)} min` : ""];
    headline = parts.filter(Boolean).join(" · ") || "Nothing needed to change";
    scope = "shifts";
    total = tasks.length;
  } else if (d.kind === "sponsor_out") {
    const s = sps.find((x) => x.id === d.sponsorId);
    if (!s || s.status === "declined") throw new Error("Pick a sponsor that hasn't already declined.");
    const amount = (tier: string | null) => ev.plan?.tiers?.find((t: { name: string; amount: number }) => t.name === tier)?.amount ?? 0;
    const confirmed = sps.filter((x) => x.status === "confirmed").reduce((sum, x) => sum + amount(x.tier), 0);
    await must(db().from("sponsors").update({ status: "declined" }).eq("id", s.id));
    changes.push({ record: s.company, before: s.status, after: "declined" });
    if (s.status === "confirmed") changes.push({ record: "Confirmed sponsorship", before: inr(confirmed), after: inr(confirmed - amount(s.tier)) });
    headline = `${s.company} pulled out${s.status === "confirmed" ? ` — ${inr(amount(s.tier))} gap` : ""}`;
    scope = "sponsors";
    total = sps.length;
  } else {
    throw new Error("Unknown disruption.");
  }

  // The organiser always gets the full diff.
  const org = process.env.GMAIL_USER;
  if (org) for (const c of changes) tell("Organiser", org, "organiser", c);

  const list = [...alerts.values()];
  let emailed = 0;
  // shortcut: 10 mails at a time is fine for a club event; move to a queue past a few hundred recipients.
  for (let i = 0; i < list.length; i += 10) {
    const res = await Promise.allSettled(
      list.slice(i, i + 10).map((a) => {
        const to = alertRecipient(a);
        const demo = to !== a.email;
        const lines = a.lines.map((l) => `• ${l.record}\n    was: ${l.before}\n    now: ${l.after}`);
        return sendMail({
          to,
          subject: `${demo ? `[Demo → ${a.name}] ` : ""}Change to ${ev.name}: ${headline}`,
          text: `${demo ? `(Demo copy — this alert is addressed to ${a.name} <${a.email}>.)\n\n` : ""}Hi ${a.name},\n\nSomething just changed for ${ev.name}${ev.date ? ` on ${ev.date}` : ""}. Here's what it means for you:\n\n${lines.join("\n\n")}\n\nEverything else stays as it was.\nTeam ${ev.name}`,
        });
      }),
    );
    emailed += res.filter((r) => r.status === "fulfilled").length;
  }
  return { headline, changes, alerts: list, scope, total, emailed, failed: list.length - emailed };
}

async function disrupt(eventId: string, get: () => Promise<Disruption>) {
  try {
    await requireAdmin();
    const r = await reroute(eventId, await get());
    await log(eventId, "rerouter", r.headline, r);
    return { ok: true, message: `${r.headline} · ${r.alerts.length} people alerted` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  } finally {
    revalidatePath(`/dashboard/${eventId}`);
  }
}

export async function triggerDisruption(eventId: string, d: Disruption) {
  return disrupt(eventId, async () => d);
}

/** Free text → Gemini picks the trigger and its inputs; the recompute itself stays deterministic. */
export async function describeDisruption(eventId: string, text: string) {
  return disrupt(eventId, async (): Promise<Disruption> => {
    const said = text.trim().slice(0, 500);
    if (!said) throw new Error("Describe what happened.");
    if (process.env.RELAY_OFFLINE === "1") throw new Error("Offline mode is on — use the trigger buttons instead.");
    const ev = await getEvent(eventId);
    const [vols, sps] = await Promise.all([
      must(db().from("volunteers").select("id, name").eq("event_id", eventId)),
      must(db().from("sponsors").select("id, company").eq("event_id", eventId).neq("status", "declined")),
    ]);
    const r = await llm<{ kind: string; volunteer?: string; venue?: string; from?: string; minutes?: number; sponsor?: string }>(
      `You route last-minute changes for "${ev.name}" on ${ev.date} at ${ev.venue}.
Volunteers: ${JSON.stringify(vols.map((v) => v.name))}
Sponsors: ${JSON.stringify(sps.map((s) => s.company))}
The organiser says: """${said}"""
Classify it as exactly one of:
- "volunteer_out": a volunteer can't make it. Give "volunteer" (a name from the list).
- "venue_change": the venue is unavailable and/or the programme shifts. Give "venue" (new venue; omit if unchanged),
  "from" (HH:MM 24h, when the shift starts; omit for the whole day) and "minutes" (delay; negative = earlier; 0 if none).
- "sponsor_out": a sponsor pulled out. Give "sponsor" (a company from the list).
Return JSON: {"kind": string, "volunteer"?: string, "venue"?: string, "from"?: string, "minutes"?: number, "sponsor"?: string}`,
    );
    const match = (names: string[], q?: string) => {
      const s = q?.toLowerCase().trim();
      return s ? Math.max(names.findIndex((n) => n.toLowerCase() === s), names.findIndex((n) => n.toLowerCase().includes(s))) : -1;
    };
    if (r.kind === "volunteer_out") {
      const i = match(vols.map((v) => v.name), r.volunteer);
      if (i < 0) throw new Error(`Couldn't match a volunteer in "${said}".`);
      return { kind: "volunteer_out", volunteerId: vols[i].id };
    }
    if (r.kind === "sponsor_out") {
      const i = match(sps.map((s) => s.company), r.sponsor);
      if (i < 0) throw new Error(`Couldn't match a sponsor in "${said}".`);
      return { kind: "sponsor_out", sponsorId: sps[i].id };
    }
    if (r.kind === "venue_change") return { kind: "venue_change", venue: r.venue, from: r.from, minutes: r.minutes };
    throw new Error("Couldn't tell what changed — use one of the triggers above.");
  });
}

// ───────────────────────── appeals (decision explainability & appeal trail) ─────────────────────────

const NEXT: Record<string, string[]> = {
  auto: ["appealed", "overridden"],
  appealed: ["upheld", "overridden", "rejected"],
  upheld: ["appealed"],
  rejected: ["appealed"],
  overridden: ["appealed"],
};

/** The only way a decision's status changes: checks the transition and appends it to the audit log. */
async function transition(id: string, to: Decision["status"], actor: string, note: string, patch: Partial<Pick<Decision, "appeal" | "outcome">> = {}) {
  const d = await must(db().from("decisions").select("*").eq("id", id).maybeSingle());
  if (!d) throw new Error("That decision no longer exists.");
  if (!NEXT[d.status]?.includes(to)) throw new Error(`Can't go from “${d.status}” to “${to}”.`);
  // Conditional update: if two people act at once, only the first wins.
  const done = await must(db().from("decisions").update({ status: to, ...patch }).eq("id", id).eq("status", d.status).select("id"));
  if (!done.length) throw new Error("Someone else just changed this decision — refresh.");
  await must(db().from("decision_log").insert({ decision_id: id, event_id: d.event_id, from_status: d.status, to_status: to, actor, note }));
  revalidatePath(`/dashboard/${d.event_id}`);
  return d as Decision;
}

function cleanAppeal(type: string, message: string, proposal?: string) {
  const msg = message.trim().slice(0, 500);
  if (msg.length < 3) throw new Error("Say briefly why.");
  return { type: type === "override" ? ("override" as const) : ("dispute" as const), message: msg, proposal: proposal?.trim().slice(0, 120) || undefined };
}

/** Organiser flags a decision from the desk. */
export async function appealDecision(id: string, type: string, message: string, proposal?: string): Promise<Result> {
  try {
    await requireAdmin();
    const a = cleanAppeal(type, message, proposal);
    await transition(id, "appealed", "Organiser", `${a.type === "override" ? "Override requested" : "Disputed"}: ${a.message}`, { appeal: { ...a, by: "Organiser" } });
    return { ok: true, message: "Flagged for review" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** Organiser resolves an appeal. Overriding a shift re-assigns it (clash-checked) and tells both people. */
export async function resolveAppeal(id: string, verdict: "upheld" | "overridden" | "rejected", note: string, assignTo?: string): Promise<Result> {
  try {
    await requireAdmin();
    if (!["upheld", "overridden", "rejected"].includes(verdict)) throw new Error("Unknown verdict.");
    const why = note.trim().slice(0, 500);
    if (!why) throw new Error("Add a short note — it goes in the audit log.");
    const d = await must(db().from("decisions").select("*").eq("id", id).maybeSingle());
    if (!d) throw new Error("That decision no longer exists.");

    let outcome: string | undefined;
    if (verdict === "overridden" && assignTo && d.subject_id && d.kind === "role") {
      const r = await overrideRole(d.event_id, d.subject_id, assignTo);
      if (!r.ok) throw new Error(r.message);
      const p = await must(db().from("volunteer_profiles").select("name").eq("id", assignTo).single());
      outcome = `Overridden → ${p.name}`;
    }
    if (verdict === "overridden" && assignTo && d.subject_id && (d.kind === "shift" || d.kind === "reroute")) {
      const task = await must(db().from("tasks").select("*").eq("id", d.subject_id).maybeSingle());
      if (!task) throw new Error("That shift no longer exists.");
      const [to, mine, ev] = await Promise.all([
        must(db().from("volunteers").select("*").eq("id", assignTo).eq("event_id", task.event_id).maybeSingle()),
        must(db().from("tasks").select("title, starts_at, ends_at").eq("volunteer_id", assignTo).neq("id", task.id)),
        getEvent(task.event_id),
      ]);
      if (!to) throw new Error("Pick someone on this event's team.");
      const clash = mine.find((m) => Date.parse(m.starts_at) < Date.parse(task.ends_at) && Date.parse(task.starts_at) < Date.parse(m.ends_at));
      if (clash) throw new Error(`${to.name} is already on “${clash.title}” at that time.`);
      const prev = task.volunteer_id ? await must(db().from("volunteers").select("name, email").eq("id", task.volunteer_id).maybeSingle()) : null;
      await must(db().from("tasks").update({ volunteer_id: to.id }).eq("id", task.id));
      outcome = `Overridden → ${to.name}`;
      const line = `• ${task.title} · ${span(task)}\n    was: ${prev?.name ?? "Unassigned"}\n    now: ${to.name}`;
      const people = [...(prev ? [{ name: prev.name, email: prev.email }] : []), { name: to.name, email: to.email }];
      await Promise.allSettled(people.map((p) => sendMail({
        to: alertRecipient({ email: p.email, role: "volunteer" }),
        subject: `Appeal decided — ${task.title} (${ev.name})`,
        text: `Hi ${p.name},\n\nThe organiser reviewed an appeal and changed this shift:\n\n${line}\n\nOrganiser's note: ${why}\n\nTeam ${ev.name}`,
      })));
    }
    await transition(id, verdict, "Organiser", `${verdict[0].toUpperCase()}${verdict.slice(1)}: ${why}`, outcome ? { outcome } : {});
    return { ok: true, message: verdict === "upheld" ? "Decision upheld" : verdict === "rejected" ? "Appeal rejected" : outcome ?? "Decision overridden" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
