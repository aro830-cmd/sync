import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AGENTS, type AgentName } from "@/lib/agents";
import { allEvents } from "@/lib/desk";
import { isFree } from "@/lib/types";
import { CountUp, Heatmap, Ring } from "@/components/desk/fx";
import { Icon } from "@/components/desk/icons";
import { homeNav } from "@/components/desk/nav";
import { RunPanel } from "@/components/desk/RunPanel";
import { SetupNotice } from "@/components/desk/SetupNotice";
import { Shell } from "@/components/desk/shell";
import { Card, Empty } from "@/components/desk/ui";

const ago = (iso: string, now: number) => {
  const s = Math.round((now - Date.parse(iso)) / 1000);
  return s < 3600 ? `${Math.max(1, Math.floor(s / 60))}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`;
};

async function AgentView({ id }: { id: AgentName }) {
  const a = AGENTS.find((x) => x.id === id)!;
  const i = AGENTS.indexOf(a);
  let d;
  try {
    d = await allEvents();
  } catch (e) {
    return <SetupNotice message={e instanceof Error ? e.message : String(e)} />;
  }
  const { events, upcoming, past, now } = d;
  const runs = events
    .flatMap((e) => e.agent_runs.filter((r) => r.agent === id).map((r) => ({ ...r, event: e.name ?? "New event", eventId: e.id })))
    .sort((x, y) => Date.parse(y.created_at) - Date.parse(x.created_at));
  const ok = runs.filter((r) => r.ok).length;
  const touched = new Set(runs.map((r) => r.eventId)).size;
  const counts: Record<string, number> = {};
  for (const r of runs) counts[r.created_at.slice(0, 10)] = (counts[r.created_at.slice(0, 10)] ?? 0) + 1;
  // Upcoming first (that's where you'd run it), then past; Sponsorship never runs on free events.
  const targets = [...upcoming, ...past]
    .filter((e) => !(a.fundedOnly && isFree(e)))
    .map((e) => ({ id: e.id, label: `${e.name ?? "New event"}${e.date ? ` · ${new Date(e.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}${e.date && e.date < new Date(now).toISOString().slice(0, 10) ? " (past)" : ""}` }));
  const recs = id === "sponsorship" ? upcoming.flatMap((e) => (e.plan?.suggestions ?? []).map((s) => ({ ...s, event: e.name, eventId: e.id }))).slice(0, 8) : [];

  return (
    <>
      {/* hero */}
      <section className="relative overflow-hidden rounded-[24px] border border-d-line bg-d-panel p-6 md:p-8">
        <div aria-hidden className="pointer-events-none absolute -top-32 -right-20 size-[420px] rounded-full opacity-25 blur-[90px]" style={{ background: "radial-gradient(circle, var(--s1), transparent 65%)" }} />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-center">
          <div className="relative grid size-24 shrink-0 place-items-center">
            {[0, 1, 2].map((k) => (
              <span key={k} aria-hidden className="absolute inset-0 rounded-[28px] border border-s1/40 [animation:desk-ripple_3s_ease-out_infinite]" style={{ animationDelay: `${k}s` }} />
            ))}
            <span className="relative grid size-20 place-items-center rounded-[24px] border border-s1/40 bg-gradient-to-br from-s1/30 to-s1/5 text-s1 [&>svg]:size-9">{Icon[id]}</span>
          </div>
          <div className="min-w-0">
            <div className="text-[12px] font-medium tracking-[0.12em] text-s1 uppercase">Agent 0{i + 1} of 5{a.fundedOnly ? " · funded events only" : ""}</div>
            <h1 className="mt-2 text-[clamp(1.9rem,3.6vw,2.7rem)] leading-[1.05] font-semibold tracking-[-0.03em]">{a.name} agent</h1>
            <p className="mt-2 max-w-2xl text-[14.5px] leading-relaxed text-d-ink2">{a.about}</p>
          </div>
        </div>

        {/* inputs → agent → outputs */}
        <div className="relative mt-8 grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-center">
          <div className="rounded-2xl border border-d-line bg-black/20 p-4">
            <div className="text-[11px] font-medium tracking-[0.08em] text-d-ink3 uppercase">Needs</div>
            <ul className="mt-2 space-y-1.5 text-[13px] text-d-ink2">{a.needs.map((n) => <li key={n} className="flex gap-2"><span className="text-d-ink3">→</span>{n}</li>)}</ul>
          </div>
          <div aria-hidden className="relative mx-auto hidden h-[2px] w-24 overflow-hidden rounded-full bg-white/[0.07] md:block">
            <span className="absolute inset-y-0 w-8 rounded-full bg-s1 [animation:desk-flow_1.6s_linear_infinite]" />
          </div>
          <div className="rounded-2xl border border-s1/25 bg-s1/[0.06] p-4">
            <div className="text-[11px] font-medium tracking-[0.08em] text-s1 uppercase">Makes</div>
            <ul className="mt-2 space-y-1.5 text-[13px] text-d-ink">{a.makes.map((n) => <li key={n} className="flex gap-2"><span className="text-s1">✓</span>{n}</li>)}</ul>
          </div>
        </div>
      </section>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-d-line bg-d-panel p-5">
          <div className="text-[12.5px] text-d-ink2">Runs</div>
          <div className="mt-3 text-[30px] leading-none font-semibold"><CountUp value={runs.length} /></div>
          <div className="mt-2 text-[12px] text-d-ink3">across {touched} event{touched === 1 ? "" : "s"}</div>
        </div>
        <div className="flex items-center justify-between rounded-2xl border border-d-line bg-d-panel p-5">
          <div>
            <div className="text-[12.5px] text-d-ink2">Success rate</div>
            <div className="mt-3 text-[30px] leading-none font-semibold"><CountUp value={runs.length ? (ok / runs.length) * 100 : 0} kind="pct" /></div>
            <div className="mt-2 text-[12px] text-d-ink3">{runs.length - ok} failed</div>
          </div>
          <Ring value={ok} max={runs.length} size={58} color="var(--good)" />
        </div>
        <div className="rounded-2xl border border-d-line bg-d-panel p-5">
          <div className="text-[12.5px] text-d-ink2">Last run</div>
          <div className="mt-3 text-[22px] leading-none font-semibold">{runs[0] ? ago(runs[0].created_at, now) : "Never"}</div>
          <div className="mt-2 truncate text-[12px] text-d-ink3">{runs[0]?.event ?? "—"}</div>
        </div>
        <div className="rounded-2xl border border-d-line bg-d-panel p-5">
          <div className="text-[12.5px] text-d-ink2">Can run on</div>
          <div className="mt-3 text-[30px] leading-none font-semibold"><CountUp value={targets.length} /></div>
          <div className="mt-2 text-[12px] text-d-ink3">event{targets.length === 1 ? "" : "s"}{a.fundedOnly ? " (funded)" : ""}</div>
        </div>
      </div>

      <Card title={`Run ${a.name} on its own`} sub="Pick an event. Only this agent runs — nothing else in the pipeline changes." className="mt-3">
        <RunPanel agent={id} name={a.name} events={targets} />
      </Card>

      {id === "sponsorship" && (
        <Card title="Recommended sponsors" sub="Real companies the agent suggested for your upcoming events — add a contact on the event to pitch one" className="mt-3">
          {recs.length ? (
            <ul className="grid gap-2 md:grid-cols-2">
              {recs.map((s) => (
                <li key={s.eventId + s.company}>
                  <Link href={`/dashboard/${s.eventId}?s=sponsorship`} className="flex gap-3 rounded-xl border border-d-line bg-black/20 p-3.5 transition-colors hover:border-white/20">
                    <Ring value={s.fit_score} max={100} size={40} color="var(--s4)">{s.fit_score}</Ring>
                    <span className="min-w-0">
                      <span className="block text-[14px] font-medium">{s.company} <span className="text-[11.5px] font-normal text-d-ink3">· {s.tier} · {s.event}</span></span>
                      <span className="mt-0.5 line-clamp-2 block text-[12.5px] text-d-ink2">{s.why}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Run Sponsorship on a funded event to get recommendations.</Empty>
          )}
        </Card>
      )}

      <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1.2fr]">
        <Card title="When it ran" sub={`${a.name} runs by day`}>
          <Heatmap counts={counts} now={now} weeks={14} />
        </Card>
        <Card title="Recent runs" sub="Newest first, across every event">
          {runs.length ? (
            <ul className="-my-1 max-h-[260px] overflow-y-auto pr-1">
              {runs.slice(0, 20).map((r, k) => (
                <li key={k}>
                  <Link href={`/dashboard/${r.eventId}?s=${id}`} className="flex gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-white/[0.04]">
                    <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${r.ok ? "bg-good" : "bg-crit"}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12.5px] leading-snug text-d-ink">{r.summary}</span>
                      <span className="mt-0.5 block text-[11px] text-d-ink3">{r.event} · {ago(r.created_at, now)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>{a.name} hasn&apos;t run yet.</Empty>
          )}
        </Card>
      </div>
    </>
  );
}

async function Resolve({ params }: { params: Promise<{ agent: string }> }) {
  const { agent } = await params;
  if (!AGENTS.some((a) => a.id === agent)) notFound();
  return (
    <Shell groups={homeNav(agent as AgentName)}>
      <AgentView id={agent as AgentName} />
    </Shell>
  );
}

export default function Page({ params }: { params: Promise<{ agent: string }> }) {
  return (
    <Suspense fallback={<div className="m-8 h-[70vh] animate-pulse rounded-2xl bg-white/[0.03]" />}>
      <Resolve params={params} />
    </Suspense>
  );
}
