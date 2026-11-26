import { Suspense } from "react";
import { notFound } from "next/navigation";
import { db } from "@/lib/server";
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

async function Desk({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  let data;
  try {
    const d = db();
    const q = (t: string) => d.from(t).select("*").eq("event_id", id);
    const [ev, sponsors, volunteers, tasks, attendees, runs, past] = await Promise.all([
      d.from("events").select("*").eq("id", id).maybeSingle(),
      q("sponsors").order("created_at"),
      q("volunteers"),
      q("tasks").order("starts_at"),
      q("attendees").order("created_at", { ascending: false }),
      q("agent_runs").order("created_at", { ascending: false }).limit(40),
      // Companies that said yes to other events — candidates to invite back.
      d.from("sponsors").select("company, contact_email, tier, events(name, date)").eq("status", "confirmed").neq("event_id", id),
    ]);
    const err = [ev, sponsors, volunteers, tasks, attendees, runs, past].find((r) => r.error)?.error;
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
