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

type Plan = {
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
  const p = await llm<Plan>(`You are the Planner agent for a college technical club in Bengaluru, India. Today is ${TODAY()}.
Turn this one-line brief into an event plan. Brief: """${ev.brief}"""
Return JSON: {"name": string, "theme": string, "date": "YYYY-MM-DD" (future date), "budget": integer INR,
"expected_attendees": integer, "venue": string (a plausible campus hall),
"budget_split": [{"head": string, "amount": integer}] (4-6 heads, sums to budget),
"tiers": [{"name": "Title"|"Gold"|"Silver"|"Community", "amount": integer INR, "perks": [string]}] (3-4 tiers),
"timeline": [{"date": "YYYY-MM-DD", "milestone": string}] (5-7 milestones from today to event day)}.
If the brief omits a value, choose a sensible one.`);
  if (!p.name || !/^\d{4}-\d{2}-\d{2}$/.test(p.date)) throw new Error("Planner returned an incomplete plan.");
  await must(
    db()
      .from("events")
      .update({
        name: p.name,
        theme: p.theme,
        date: p.date,
        budget: Math.round(p.budget),
        expected_attendees: Math.round(p.expected_attendees),
        venue: p.venue,
        // Merge so a re-plan keeps what later agents wrote (e.g. comms).
        plan: { ...ev.plan, budget_split: p.budget_split, tiers: p.tiers, timeline: p.timeline },
      })
      .eq("id", eventId),
  );
  return {
    summary: `Planned ${p.name}: ${inr(p.budget)} across ${p.budget_split.length} heads, ${p.tiers.length} sponsor tiers`,
    output: p,
  };
}

async function sponsorship(eventId: string) {
  const ev = await getEvent(eventId);
  const leads = await must(db().from("sponsors").select("id, company").eq("event_id", eventId).eq("status", "lead"));
  if (!leads.length) return { summary: "Skipped — no new sponsor leads. Add companies on the Sponsors tab.", output: null };

  // Small integer keys instead of UUIDs: the model echoes them back reliably.
  const r = await llm<{ pitches: { n: number; tier: string; fit_score: number; subject: string; body: string }[] }>(
    `You are the Sponsorship agent for "${ev.name}" (${ev.theme}), on ${ev.date} at ${ev.venue}, ~${ev.expected_attendees} student attendees.
Sponsor tiers: ${JSON.stringify(ev.plan?.tiers ?? [])}
For each company below, pick the best-fit tier, score fit 0-100 for this audience, and write a short, specific cold email
(under 160 words, plain text, no placeholders like [Name], sign off as "Team ${ev.name}"). Mention what the company gets.
Companies: ${JSON.stringify(leads.map((l, n) => ({ n, company: l.company })))}
Return JSON: {"pitches": [{"n": integer (same n), "tier": string, "fit_score": integer, "subject": string, "body": string}]}`,
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
  return { summary: `Drafted ${pitches.length} pitches — waiting for your approval to send`, output: pitches };
}

async function logistics(eventId: string) {
  const ev = await getEvent(eventId);
  const vols = await must(db().from("volunteers").select("id, name, skills").eq("event_id", eventId));
  if (!vols.length) return { summary: "Skipped — no volunteers yet. Add them on the Schedule tab.", output: null };

  const r = await llm<{ tasks: { title: string; skill: string | null; start: string; end: string }[] }>(
    `You are the Logistics agent for "${ev.name}" on ${ev.date} at ${ev.venue}, ~${ev.expected_attendees} attendees.
Volunteers and skills: ${JSON.stringify(vols.map((v) => ({ name: v.name, skills: v.skills })))}
Write the day's run-of-show as 8-14 volunteer tasks between 07:30 and 20:00. Some tasks should run in parallel.
Use "skill" only when a task really needs one of the listed skills (one word, e.g. "av", "design"), else null.
Return JSON: {"tasks": [{"title": string, "skill": string|null, "start": "HH:MM", "end": "HH:MM"}]}`,
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
    summary: `${slots.length} tasks scheduled for ${vols.length} volunteers — 0 clashes${open ? `, ${open} need more hands` : ""}`,
    output: slots,
  };
}

async function comms(eventId: string) {
  const ev = await getEvent(eventId);
  const r = await llm<{ announcement: string; reminder_subject: string; reminder_body: string }>(
    `You are the Comms agent for "${ev.name}" (${ev.theme}) on ${ev.date} at ${ev.venue}.
Write (1) a WhatsApp/Instagram announcement under 90 words ending with "Register: {link}",
and (2) a reminder email for registered attendees (plain text, under 120 words, no placeholders).
Return JSON: {"announcement": string, "reminder_subject": string, "reminder_body": string}`,
  );
  await must(db().from("events").update({ plan: { ...ev.plan, comms: r } }).eq("id", eventId));
  return { summary: `Registration page live at /e/${eventId.slice(0, 8)}… — announcement and reminder drafted`, output: r };
}

async function reporting(eventId: string) {
  const ev = await getEvent(eventId);
  const s = await reportStats(eventId);
  const r = await llm<{ summary: string }>(
    `You are the Reporting agent. Write a 120-180 word post-event summary for sponsors of "${ev.name}" (${ev.theme}),
held ${ev.date} at ${ev.venue}. Registered: ${s.registered}. Attended: ${s.attended}.
Confirmed partners: ${JSON.stringify(s.confirmed)}. Tier perks promised: ${JSON.stringify(ev.plan?.tiers ?? [])}.
Thank partners, state the reach honestly using only these numbers, and list delivered perks. Plain prose.
Return JSON: {"summary": string}`,
  );
  await must(db().from("events").update({ summary: r.summary }).eq("id", eventId));
  return { summary: `Sponsor report ready — ${s.attended} attended, ${s.confirmed.length} partners`, output: r };
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

export async function sendPitches(eventId: string) {
  return attempt(eventId, "sponsorship", async () => {
    const drafts = await must(db().from("sponsors").select("*").eq("event_id", eventId).eq("status", "drafted"));
    if (!drafts.length) throw new Error("No drafted pitches to send. Run the Sponsorship agent first.");
    let sent = 0;
    for (const s of drafts) {
      await sendMail({ to: s.contact_email, subject: s.pitch_subject, text: s.pitch_body });
      await must(db().from("sponsors").update({ status: "contacted" }).eq("id", s.id));
      sent++;
    }
    return `Sent ${sent} pitch email${sent > 1 ? "s" : ""}`;
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
