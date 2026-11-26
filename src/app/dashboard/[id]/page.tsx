import { Suspense } from "react";
import { notFound } from "next/navigation";
import { callsSaved, crmReady, db } from "@/lib/server";
import { EventDesk } from "@/components/desk/EventDesk";
import { SetupNotice } from "@/components/desk/SetupNotice";

type Alum = { company: string; contact_email: string; tier: string | null; events: { name: string | null; date: string | null } | null };

/** One row per company, keeping its latest confirmed event. */
function alumni(rows: Alum[]) {
  const by = new Map<string, { company: string; email: string; tier: string | null; event: string; times: number; date: string }>();
  for (const r of rows) {
    const prev = by.get(r.company);
    const date = r.events?.date ?? "";
    if (!prev || date > prev.date) by.set(r.company, { company: r.company, email: r.contact_email, tier: r.tier, event: r.events?.name ?? "", times: (prev?.times ?? 0) + 1, date });
    else prev.times++;
  }
  return [...by.values()].sort((a, b) => b.times - a.times);
}

/** Deals, mission roles, incidents and the audit trail for this event, or null until migration 002 has run. */
async function crm(eventId: string, sponsorIds: string[]) {
  if (!(await crmReady())) return null;
  const ids = sponsorIds.length ? sponsorIds : ["00000000-0000-0000-0000-000000000000"];
  const d = db();
  const [p, del, roles, reqs, profiles, inc, log] = await Promise.all([
    d.from("sponsor_payments").select("*").in("sponsor_id", ids).order("due_date"),
    d.from("sponsor_deliverables").select("*").in("sponsor_id", ids).order("due_date"),
    d.from("roles").select("*").order("sort"),
    d.from("role_requests").select("*").eq("event_id", eventId).order("created_at"),
    d.from("volunteer_profiles").select("id, name, email, skills, preferred_roles, opted_in, available"),
    d.from("incidents").select("*").eq("event_id", eventId).order("created_at", { ascending: false }),
    d.from("audit_log").select("*").eq("event_id", eventId).order("created_at", { ascending: false }).limit(200),
  ]);
  return {
    payments: p.data ?? [],
    deliverables: del.data ?? [],
    roles: roles.data ?? [],
    requests: reqs.data ?? [],
    profiles: profiles.data ?? [],
    incidents: inc.data ?? [],
    audit: log.data ?? [],
  };
}

async function Desk({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  let data;
  try {
    const d = db();
    const q = (t: string) => d.from(t).select("*").eq("event_id", id);
const [ev, sponsors, volunteers, tasks, attendees, runs, past, students, events, decisions, decisionLog] = await Promise.all([
      d.from("events").select("*").eq("id", id).maybeSingle(),
      q("sponsors").order("created_at"),
      q("volunteers"),
      q("tasks").order("starts_at"),
      q("attendees").order("created_at", { ascending: false }),
      q("agent_runs").order("created_at", { ascending: false }).limit(40),
      // Companies that said yes to other events — candidates to invite back.
      d.from("sponsors").select("company, contact_email, tier, events(name, date)").eq("status", "confirmed").neq("event_id", id),
      d.from("students").select("email"),
      // For the Re-Router's event picker.
      d.from("events").select("id, name, date").order("date", { ascending: false }),
      // Decision explainability & appeal trail.
      q("decisions").order("created_at", { ascending: false }).limit(300),
      q("decision_log").order("created_at").limit(1000),
    ]);
    const err = [ev, sponsors, volunteers, tasks, attendees, runs, past, students, events, decisions, decisionLog].find((r) => r.error)?.error;
    if (err) throw new Error(err.message);
    data = ev.data && {
      event: ev.data,
      sponsors: sponsors.data!,
      volunteers: volunteers.data!,
      tasks: tasks.data!,
      attendees: attendees.data!,
      runs: runs.data!,
      alumni: alumni(past.data as unknown as Alum[]),
      demoInbox: process.env.DEMO_INBOX?.trim() || null,
      // Students who could still be invited (have an account, not registered yet).
      invitable: students.data!.filter((s) => !attendees.data!.some((a) => a.email === s.email)).length,
      studentInbox: process.env.DEMO_STUDENT_INBOX?.trim() || null,
      crm: await crm(id, sponsors.data!.map((s) => s.id)),
      today: new Date().toISOString().slice(0, 10),
      events: events.data!,
      decisions: decisions.data!,
      decisionLog: decisionLog.data!,
      saved: await callsSaved(),
    };
  } catch (e) {
    return <SetupNotice message={e instanceof Error ? e.message : String(e)} />;
  }
  if (!data) notFound();
  return <EventDesk {...data} />;
}

export default function Page({ params }: PageProps<"/dashboard/[id]">) {
  return (
    <Suspense fallback={<div className="m-8 h-[70vh] animate-pulse rounded-2xl bg-white/[0.03]" />}>
      <Desk params={params} />
    </Suspense>
  );
}
