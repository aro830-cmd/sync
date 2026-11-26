import Link from "next/link";
import { Suspense } from "react";
import { allEvents, attended, raised } from "@/lib/desk";
import { inr } from "@/lib/format";
import { isFree } from "@/lib/types";
import { BarList } from "@/components/desk/charts";
import { CountUp, PairBars } from "@/components/desk/fx";
import { ReportsButton } from "@/components/desk/ReportsButton";
import { homeNav } from "@/components/desk/nav";
import { SetupNotice } from "@/components/desk/SetupNotice";
import { Shell } from "@/components/desk/shell";
import { Card, Empty } from "@/components/desk/ui";

async function Past() {
  let d;
  try {
    d = await allEvents();
  } catch (e) {
    return <SetupNotice message={e instanceof Error ? e.message : String(e)} />;
  }
  const { past } = d;
  const reached = past.reduce((s, e) => s + attended(e), 0);
  const registered = past.reduce((s, e) => s + e.attendees.length, 0);
  const money = past.reduce((s, e) => s + raised(e), 0);
  const certs = past.reduce((s, e) => s + e.attendees.filter((a) => a.certificate_sent).length, 0);

  // Partners who said yes, ranked by how often they came back and what they put in.
  const partners = new Map<string, { events: number; total: number }>();
  for (const e of past)
    for (const s of e.sponsors.filter((x) => x.status === "confirmed")) {
      const p = partners.get(s.company) ?? { events: 0, total: 0 };
      p.events++;
      p.total += e.plan?.tiers?.find((t) => t.name === s.tier)?.amount ?? 0;
      partners.set(s.company, p);
    }
  const loyal = [...partners].sort((a, b) => b[1].total - a[1].total);
  const chrono = [...past].reverse();

  return (
    <>
      <div className="mb-8">
        <div className="text-[12.5px] text-d-ink3">Archive</div>
        <h1 className="mt-2 text-[clamp(1.9rem,3.6vw,2.7rem)] leading-[1.05] font-semibold tracking-[-0.03em]">Past events</h1>
        <p className="mt-2 max-w-2xl text-[14px] text-d-ink2">Everything your club has run, what it raised and who showed up. Open any event to resend certificates or the report — or run it again.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Events", past.length, "num", "bg-s1"],
          ["Attended", reached, "num", "bg-s3"],
          ["Raised", money, "inr", "bg-s4"],
          ["Certificates", certs, "num", "bg-s2"],
        ].map(([l, v, k, dot]) => (
          <div key={l as string} className="rounded-2xl border border-d-line bg-d-panel p-5">
            <div className="flex items-center gap-2 text-[12.5px] text-d-ink2"><span className={`size-2 rounded-full ${dot}`} />{l}</div>
            <div className="mt-3 text-[30px] leading-none font-semibold tracking-[-0.02em]"><CountUp value={v as number} kind={k as "num" | "inr"} /></div>
            {l === "Attended" && <div className="mt-2 text-[12px] text-d-ink3">{registered ? Math.round((reached / registered) * 100) : 0}% of {registered} registered</div>}
          </div>
        ))}
      </div>

      {past.length ? (
        <>
          <div className="mt-3 grid gap-3 lg:grid-cols-[1.5fr_1fr]">
            <Card title="Registered vs attended" sub="Each past event, oldest first — hover a pair for turnout">
              <PairBars rows={chrono.map((e) => ({ label: e.name ?? "Event", a: e.attendees.length, b: attended(e) }))} />
            </Card>
            <Card title="Loyal partners" sub="Confirmed sponsors across past events">
              {loyal.length ? (
                <BarList rows={loyal.map(([company, p]) => ({ label: company, value: p.total, note: `${p.events} event${p.events > 1 ? "s" : ""}` }))} format="inr" color="bg-s4" />
              ) : (
                <Empty>No confirmed partners yet.</Empty>
              )}
            </Card>
          </div>

          <Card title="All past events" sub={`${past.length} events, newest first · the Reporting agent writes each report after the day`} action={<ReportsButton missing={past.filter((e) => !e.summary).length} />} className="mt-3">
            <div className="-mx-5 overflow-x-auto px-5">
              <table className="w-full min-w-[760px] text-left text-[13px]">
                <thead className="text-[11px] uppercase tracking-[0.08em] text-d-ink3">
                  <tr className="border-b border-d-line">
                    <th className="py-2.5 font-medium">Event</th>
                    <th className="py-2.5 font-medium">Date</th>
                    <th className="py-2.5 font-medium">Type</th>
                    <th className="py-2.5 text-right font-medium">Turnout</th>
                    <th className="py-2.5 text-right font-medium">Raised</th>
                    <th className="py-2.5 text-right font-medium">Report</th>
                    <th className="py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-d-line">
                  {past.map((e) => {
                    const a = attended(e), r = e.attendees.length;
                    return (
                      <tr key={e.id} className="group">
                        <td className="py-3.5">
                          <Link href={`/dashboard/${e.id}`} className="font-medium text-d-ink group-hover:text-s1">{e.name}</Link>
                          <div className="max-w-[260px] truncate text-[12px] text-d-ink3">{e.venue}</div>
                        </td>
                        <td className="py-3.5 tabular-nums text-d-ink2">{new Date(e.date!).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</td>
                        <td className="py-3.5"><span className={`rounded-full px-2 py-0.5 text-[11px] ${isFree(e) ? "bg-s3/15 text-s3" : "bg-s1/15 text-s1"}`}>{isFree(e) ? "Free" : "Funded"}</span></td>
                        <td className="py-3.5 text-right">
                          <span className="tabular-nums text-d-ink">{a}</span><span className="text-d-ink3">/{r}</span>
                          <div className="ml-auto mt-1.5 h-1 w-20 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-s3" style={{ width: `${r ? (a / r) * 100 : 0}%` }} /></div>
                        </td>
                        <td className="py-3.5 text-right tabular-nums">{isFree(e) ? <span className="text-d-ink3">—</span> : inr(raised(e))}</td>
                        <td className="py-3.5 text-right">{e.summary ? <a href={`/api/report/${e.id}`} target="_blank" className="text-d-ink2 hover:text-d-ink">PDF ↗</a> : <span className="text-d-ink3">Not written</span>}</td>
                        <td className="py-3.5 text-right">
                          <Link href={`/dashboard?brief=${encodeURIComponent(e.brief)}`} className="rounded-md border border-d-line px-2 py-1 text-[12px] whitespace-nowrap text-d-ink2 transition-colors hover:border-white/25 hover:text-d-ink">Run it again</Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : (
        <div className="mt-3"><Empty>No past events yet — they appear here the day after they happen.</Empty></div>
      )}
    </>
  );
}

export default function Page() {
  return (
    <Shell groups={homeNav("past")}>
      <Suspense fallback={<div className="h-[70vh] animate-pulse rounded-2xl bg-white/[0.03]" />}>
        <Past />
      </Suspense>
    </Shell>
  );
}
