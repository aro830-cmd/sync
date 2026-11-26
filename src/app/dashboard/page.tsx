import Link from "next/link";
import { Suspense } from "react";
import { allEvents, attended, raised, type DeskEvent } from "@/lib/desk";
import { crmReady, db } from "@/lib/server";
import { inr } from "@/lib/format";
import { isFree } from "@/lib/types";
import { EventCard } from "@/components/desk/EventCard";
import { AreaTrend, CountUp, Heatmap, Rings, Spark } from "@/components/desk/fx";
import { homeNav } from "@/components/desk/nav";
import { NewEvent } from "@/components/desk/NewEvent";
import { SetupNotice } from "@/components/desk/SetupNotice";
import { Shell } from "@/components/desk/shell";
import { Card, Empty } from "@/components/desk/ui";

const TONE = { s1: "bg-s1", s2: "bg-s2", s3: "bg-s3", s4: "bg-s4" };
type Todo = { id: string; tone: "s1" | "s2" | "s3" | "s4"; title: string; detail: string; href: string };

/** Everything across all events that is waiting on the organiser, most urgent first. */
function inbox(upcoming: DeskEvent[], past: DeskEvent[], now: number): Todo[] {
  const out: Todo[] = [];
  for (const e of upcoming) {
    const name = e.name ?? "New event";
    const days = e.date ? Math.ceil((Date.parse(e.date) - now) / 86_400_000) : 99;
    const drafted = e.sponsors.filter((s) => s.status === "drafted").length;
    const replied = e.sponsors.filter((s) => s.status === "replied").length;
    const open = e.tasks.filter((t) => !t.volunteer_id).length;
    const recs = e.plan?.suggestions?.length ?? 0;
    if (!e.plan?.timeline) out.push({ id: e.id + "p", tone: "s1", title: `Plan ${name}`, detail: "The Planner hasn't run yet", href: `/dashboard/${e.id}?s=planner` });
    if (drafted) out.push({ id: e.id + "d", tone: "s1", title: `Approve ${drafted} pitch${drafted > 1 ? "es" : ""}`, detail: `${name} · drafts waiting for you`, href: `/dashboard/${e.id}?s=sponsorship` });
    if (replied) out.push({ id: e.id + "r", tone: "s2", title: `${replied} sponsor${replied > 1 ? "s" : ""} replied`, detail: `${name} · confirm or decline`, href: `/dashboard/${e.id}?s=sponsorship` });
    if (recs) out.push({ id: e.id + "s", tone: "s4", title: `${recs} recommended sponsors`, detail: `${name} · add a contact to pitch`, href: `/dashboard/${e.id}?s=sponsorship` });
    if (open) out.push({ id: e.id + "o", tone: "s2", title: `${open} shift${open > 1 ? "s" : ""} ${open > 1 ? "need" : "needs"} a volunteer`, detail: name, href: `/dashboard/${e.id}?s=logistics` });
    if (days <= 7 && !e.plan?.comms) out.push({ id: e.id + "c", tone: "s1", title: `Announce ${name}`, detail: `${days} days to go, no announcement yet`, href: `/dashboard/${e.id}?s=comms` });
  }
  for (const e of past) {
    const certs = e.attendees.filter((a) => a.checked_in && !a.certificate_sent).length;
    if (certs) out.push({ id: e.id + "x", tone: "s3", title: `Send ${certs} certificate${certs > 1 ? "s" : ""}`, detail: e.name ?? "", href: `/dashboard/${e.id}?s=comms` });
    if (!e.summary) out.push({ id: e.id + "y", tone: "s3", title: `Write the report for ${e.name}`, detail: "Event is over", href: `/dashboard/${e.id}?s=reporting` });
  }
  return out;
}

async function Home({ searchParams }: { searchParams: Promise<{ brief?: string }> }) {
  const { brief } = await searchParams;
  let d;
  try {
    d = await allEvents();
  } catch (e) {
    return <SetupNotice message={e instanceof Error ? e.message : String(e)} />;
  }
  const { events, upcoming, past, now } = d;
  const chrono = [...past].reverse();
  const reached = past.reduce((s, e) => s + attended(e), 0);
  const registered = past.reduce((s, e) => s + e.attendees.length, 0);
  const money = events.reduce((s, e) => s + raised(e), 0);
  const pitched = events.flatMap((e) => e.sponsors).filter((s) => ["contacted", "replied", "confirmed", "declined"].includes(s.status));
  const won = pitched.filter((s) => s.status === "confirmed").length;
  const runs = events.flatMap((e) => e.agent_runs);
  const okRuns = runs.filter((r) => r.ok).length;
  const counts: Record<string, number> = {};
  for (const r of runs) {
    const k = r.created_at.slice(0, 10);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  const todo = inbox(upcoming, past, now);
  // After migration 002: open incidents and overdue sponsor payments join the inbox, most urgent first.
  if (await crmReady()) {
    const today = new Date(now).toISOString().slice(0, 10);
    const [inc, pay] = await Promise.all([
      db().from("incidents").select("id, event_id, title, severity").eq("status", "open"),
      db().from("sponsor_payments").select("id, label, amount, due_date, status, sponsors!inner(event_id, company)").not("status", "in", "(received,disputed)").lt("due_date", today),
    ]);
    const name = (id: string) => events.find((e) => e.id === id)?.name ?? "Event";
    for (const i of inc.data ?? []) todo.unshift({ id: i.id, tone: "s1", title: `${i.severity === "high" ? "Urgent: " : ""}${i.title}`, detail: `${name(i.event_id)} · open incident`, href: `/dashboard/${i.event_id}` });
    for (const p of pay.data ?? []) {
      const sp = p.sponsors as unknown as { event_id: string; company: string };
      todo.unshift({ id: p.id, tone: "s1", title: `${sp.company}: ${p.label} overdue`, detail: `${name(sp.event_id)} · due ${p.due_date}`, href: `/dashboard/${sp.event_id}?s=sponsorship` });
    }
  }
  const hour = new Date(now).toLocaleString("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" });
  const greet = +hour < 12 ? "Good morning" : +hour < 17 ? "Good afternoon" : "Good evening";

  const kpis = [
    { label: "Events hosted", value: past.length, kind: "num" as const, spark: chrono.map((e) => e.attendees.length), note: `${upcoming.length} coming up` },
    { label: "People reached", value: reached, kind: "num" as const, spark: chrono.map(attended), note: `${registered} registered in total` },
    { label: "Sponsorship raised", value: money, kind: "inr" as const, spark: chrono.map(raised), note: `${won} partner deal${won === 1 ? "" : "s"} won` },
    { label: "Average turnout", value: registered ? Math.round((reached / registered) * 100) : 0, kind: "pct" as const, spark: chrono.map((e) => (e.attendees.length ? (attended(e) / e.attendees.length) * 100 : 0)), note: "checked in ÷ registered" },
  ];

  return (
    <>
      <div className="mb-8">
        <div className="flex items-center gap-2 text-[12.5px] text-d-ink3">
          <span className="relative flex size-2"><span className="absolute inset-0 animate-ping rounded-full bg-s1/60" /><span className="relative size-2 rounded-full bg-s1" /></span>
          {greet} · {new Date(now).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
        </div>
        <h1 className="mt-3 text-[clamp(2rem,4vw,3.1rem)] leading-[1.02] font-semibold tracking-[-0.035em]">
          What are we <span className="text-s1">hosting</span> next?
        </h1>
        <p className="mt-2 max-w-2xl text-[14px] text-d-ink2">One line in. Pick the agents you want — they plan it, find sponsors, schedule volunteers, open registration and write the report.</p>
      </div>

      <NewEvent initial={brief?.slice(0, 500)} />

      {/* lifetime impact */}
      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k, i) => (
          <div key={k.label} className="relative overflow-hidden rounded-2xl border border-d-line bg-d-panel p-5">
            <div className="flex items-center gap-2 text-[12.5px] text-d-ink2">
              <span className={`size-2 rounded-full ${["bg-s1", "bg-s3", "bg-s4", "bg-s2"][i]}`} />
              {k.label}
            </div>
            <div className="mt-3 text-[30px] leading-none font-semibold tracking-[-0.02em]">
              <CountUp value={k.value} kind={k.kind} />
            </div>
            <div className="mt-3 flex items-end justify-between gap-2">
              <span className="text-[12px] text-d-ink3">{k.note}</span>
              <Spark values={k.spark} color={["var(--s1)", "var(--s3)", "var(--s4)", "var(--s2)"][i]} />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[1.25fr_1fr]">
        <Card title="Needs you" sub={todo.length ? `${todo.length} thing${todo.length > 1 ? "s" : ""} waiting across your events` : "Nothing waiting — the agents have it"}>
          {todo.length ? (
            <ul className="-my-1 max-h-[268px] space-y-1 overflow-y-auto pr-1">
              {todo.slice(0, 10).map((t) => (
                <li key={t.id}>
                  <Link href={t.href} className="group flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-white/[0.04]">
                    <span className={`size-2 shrink-0 rounded-full ${TONE[t.tone]}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] text-d-ink">{t.title}</span>
                      <span className="block truncate text-[12px] text-d-ink3">{t.detail}</span>
                    </span>
                    <span className="text-d-ink3 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-d-ink">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>All caught up.</Empty>
          )}
        </Card>
        <Card title="Health" sub="Across every event so far">
          <Rings
            rings={[
              { label: "Turnout", value: reached, max: registered, color: "var(--s3)", detail: `${reached} of ${registered} registered showed up` },
              { label: "Sponsor win rate", value: won, max: pitched.length, color: "var(--s1)", detail: `${won} of ${pitched.length} pitched companies said yes` },
              { label: "Agent success", value: okRuns, max: runs.length, color: "var(--s2)", detail: `${okRuns} of ${runs.length} runs finished cleanly` },
            ]}
          />
        </Card>
      </div>

      <div className="mt-10 mb-4 flex items-baseline justify-between">
        <h2 className="text-[15px] font-medium">Coming up</h2>
        <span className="text-[12px] text-d-ink3">{upcoming.length} event{upcoming.length === 1 ? "" : "s"}</span>
      </div>
      {upcoming.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {upcoming.map((e) => <EventCard key={e.id} e={e} now={now} />)}
        </div>
      ) : (
        <Empty>No upcoming events — describe your next one above.</Empty>
      )}

      <div className="mt-3 grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <Card title="People reached per event" sub="Checked-in attendees, oldest to newest — hover for the event">
          <AreaTrend points={chrono.filter((e) => e.date).map((e) => ({ t: Date.parse(e.date!), v: attended(e), label: e.name ?? "Event" }))} unit="attended" />
        </Card>
        <Card title="Agent activity" sub="Every agent run, by day">
          <Heatmap counts={counts} now={now} />
        </Card>
      </div>

      {!!past.length && (
        <>
          <div className="mt-10 mb-4 flex items-baseline justify-between">
            <h2 className="text-[15px] font-medium">Recently wrapped</h2>
            <Link href="/dashboard/past" className="text-[12.5px] text-d-ink2 hover:text-d-ink">All past events →</Link>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {past.slice(0, 3).map((e) => (
              <Link key={e.id} href={`/dashboard/${e.id}`} className="group rounded-2xl border border-d-line bg-d-panel p-5 transition-colors hover:border-white/20">
                <div className="flex items-center justify-between text-[12px] text-d-ink3">
                  <span>{new Date(e.date!).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                  <span className={isFree(e) ? "text-s3" : "text-s1"}>{isFree(e) ? "Free" : inr(raised(e))}</span>
                </div>
                <div className="mt-2 truncate text-[15.5px] font-medium">{e.name}</div>
                <div className="mt-3 flex items-baseline gap-1.5 text-[12.5px] text-d-ink2">
                  <span className="text-[20px] font-semibold tabular-nums text-d-ink">{attended(e)}</span> attended of {e.attendees.length}
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}

export default function Dashboard({ searchParams }: PageProps<"/dashboard">) {
  return (
    <Shell groups={homeNav("home")}>
      <Suspense fallback={<div className="h-[70vh] animate-pulse rounded-2xl bg-white/[0.03]" />}>
        <Home searchParams={searchParams} />
      </Suspense>
    </Shell>
  );
}

