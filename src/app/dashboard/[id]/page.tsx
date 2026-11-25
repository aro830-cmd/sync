import { Suspense } from "react";
import { notFound } from "next/navigation";
import { db } from "@/lib/server";
import { EventDesk } from "@/components/desk/EventDesk";
import { SetupNotice } from "@/components/desk/SetupNotice";

async function Desk({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  let data;
  try {
    const d = db();
    const q = (t: string) => d.from(t).select("*").eq("event_id", id);
    const [ev, sponsors, volunteers, tasks, attendees, runs] = await Promise.all([
      d.from("events").select("*").eq("id", id).maybeSingle(),
      q("sponsors").order("created_at"),
      q("volunteers"),
      q("tasks").order("starts_at"),
      q("attendees").order("created_at", { ascending: false }),
      q("agent_runs").order("created_at", { ascending: false }).limit(40),
    ]);
    const err = [ev, sponsors, volunteers, tasks, attendees, runs].find((r) => r.error)?.error;
    if (err) throw new Error(err.message);
    data = ev.data && {
      event: ev.data,
      sponsors: sponsors.data!,
      volunteers: volunteers.data!,
      tasks: tasks.data!,
      attendees: attendees.data!,
      runs: runs.data!,
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
