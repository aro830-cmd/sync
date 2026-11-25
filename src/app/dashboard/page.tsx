import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { db } from "@/lib/server";
import { AGENTS } from "@/lib/agents";
import type { EventRow } from "@/lib/types";
import { NewEvent } from "@/components/desk/NewEvent";
import { SetupNotice } from "@/components/desk/SetupNotice";
import { Shell } from "@/components/desk/shell";
import { Icon } from "@/components/desk/icons";

type Row = EventRow & { sponsors: { status: string }[]; attendees: { checked_in: boolean }[]; agent_runs: { agent: string; ok: boolean }[] };

// Request-time page (connection() below), so reading the clock here is intended.
const daysUntil = (date: string | null) => (date ? Math.ceil((Date.parse(date) - Date.now()) / 86_400_000) : null);

async function EventList() {
  await connection(); // always read fresh from the DB, never prerender
  let events: Row[];
  try {
    const { data, error } = await db()
      .from("events")
      .select("*, sponsors(status), attendees(checked_in), agent_runs(agent, ok)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    events = data;
  } catch (e) {
    return <SetupNotice message={e instanceof Error ? e.message : String(e)} />;
  }

  if (!events.length) return <p className="rounded-2xl border border-dashed border-d-line py-14 text-center text-[13px] text-d-ink3">No events yet — describe your first one above.</p>;

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {events.map((e) => {
        const done = new Set(e.agent_runs.filter((r) => r.ok).map((r) => r.agent));
        const confirmed = e.sponsors.filter((s) => s.status === "confirmed").length;
        const checked = e.attendees.filter((a) => a.checked_in).length;
        const days = daysUntil(e.date);
        return (
          <Link
            key={e.id}
            href={`/dashboard/${e.id}`}
            className="group relative flex flex-col overflow-hidden rounded-2xl border border-d-line bg-d-panel p-5 transition-[border-color,transform] duration-200 ease-out hover:-translate-y-0.5 hover:border-white/20"
          >
            <div className="flex items-center justify-between text-[12px] text-d-ink3">
              <span>{e.date ? new Date(e.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Date TBA"}</span>
              {days != null && <span className="rounded-md border border-d-line px-1.5 py-0.5 text-[11px]">{days < 0 ? "Completed" : days === 0 ? "Today" : `In ${days} days`}</span>}
            </div>
            <div className="mt-4 text-[18px] leading-snug font-semibold tracking-[-0.01em]">{e.name ?? <span className="text-d-ink3">Planning…</span>}</div>
            <div className="mt-1 truncate text-[12.5px] text-d-ink3">{e.venue ?? e.brief}</div>

            <div className="mt-5 grid grid-cols-3 gap-2 border-t border-d-line pt-4">
              {[
                ["Budget", e.budget ? `₹${(e.budget / 1000).toFixed(0)}k` : "—"],
                ["Partners", `${confirmed}/${e.sponsors.length}`],
                ["Checked in", `${checked}/${e.attendees.length}`],
              ].map(([l, v]) => (
                <div key={l}>
                  <div className="text-[15px] font-medium tabular-nums">{v}</div>
                  <div className="text-[11px] text-d-ink3">{l}</div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center gap-1.5" aria-label={`${done.size} of 5 agents done`}>
              {AGENTS.map((a) => (
                <span key={a.id} title={a.name} className={`h-1 flex-1 rounded-full ${done.has(a.id) ? "bg-good" : "bg-white/10"}`} />
              ))}
              <span className="ml-2 text-[11px] tabular-nums text-d-ink3">{done.size}/5</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

export default function Dashboard() {
  return (
    <Shell groups={[{ items: [{ key: "events", label: "Events", icon: Icon.events, active: true, href: "/dashboard" }] }]}>
      <div className="mb-7">
        <div className="text-[12.5px] text-d-ink3">Organiser desk</div>
        <h1 className="mt-2 text-[clamp(1.75rem,3.2vw,2.4rem)] leading-[1.1] font-semibold tracking-[-0.025em]">What are we hosting?</h1>
        <p className="mt-2 text-[14px] text-d-ink2">Describe the event in one line. Five agents plan it, pitch sponsors, schedule volunteers, open registration and write the report.</p>
      </div>
      <NewEvent />
      <div className="mt-10 mb-4 flex items-baseline justify-between">
        <h2 className="text-[15px] font-medium">Your events</h2>
      </div>
      <Suspense fallback={<div className="h-48 animate-pulse rounded-2xl bg-white/[0.03]" />}>
        <EventList />
      </Suspense>
    </Shell>
  );
}
