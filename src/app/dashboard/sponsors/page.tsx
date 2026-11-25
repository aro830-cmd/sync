import Link from "next/link";
import { Suspense } from "react";
import { allEvents, partnerDirectory } from "@/lib/desk";
import { inr } from "@/lib/format";
import { PROFILES } from "@/lib/partners";
import { BarList } from "@/components/desk/charts";
import { CountUp } from "@/components/desk/fx";
import { homeNav } from "@/components/desk/nav";
import { SetupNotice } from "@/components/desk/SetupNotice";
import { Shell } from "@/components/desk/shell";
import { Card, Empty } from "@/components/desk/ui";

const STATUS: Record<string, string> = {
  confirmed: "bg-good/15 text-good",
  declined: "bg-crit/15 text-crit",
  replied: "bg-s2/15 text-s2",
  contacted: "bg-white/[0.06] text-d-ink2",
  drafted: "bg-s4/15 text-s4",
  lead: "bg-white/[0.06] text-d-ink3",
};

async function Directory() {
  let d;
  try {
    d = await allEvents();
  } catch (e) {
    return <SetupNotice message={e instanceof Error ? e.message : String(e)} />;
  }
  const rows = partnerDirectory(d.events);
  const partners = rows.filter((r) => r.confirmed);
  const lifetime = rows.reduce((s, r) => s + r.total, 0);
  const pitched = rows.reduce((s, r) => s + r.pitched, 0);
  const won = rows.reduce((s, r) => s + r.confirmed, 0);
  const repeat = rows.filter((r) => r.confirmed >= 2).length;

  return (
    <>
      <div className="mb-8">
        <div className="text-[12.5px] text-d-ink3">Sponsor directory</div>
        <h1 className="mt-2 text-[clamp(1.9rem,3.6vw,2.7rem)] leading-[1.05] font-semibold tracking-[-0.03em]">Sponsors</h1>
        <p className="mt-2 max-w-2xl text-[14px] text-d-ink2">Every company your club has pitched or partnered with — contacts, what they gave, and how each pitch went. Past partners can be added to a new event in one click from its Sponsorship page.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Partners", partners.length, "num", "bg-s1", `${rows.length} companies on file`],
          ["Lifetime raised", lifetime, "inr", "bg-s4", "from confirmed tiers"],
          ["Win rate", pitched ? Math.round((won / pitched) * 100) : 0, "pct", "bg-s3", `${won} of ${pitched} pitches said yes`],
          ["Repeat partners", repeat, "num", "bg-s2", "confirmed 2+ events"],
        ].map(([l, v, k, dot, hint]) => (
          <div key={l as string} className="rounded-2xl border border-d-line bg-d-panel p-5">
            <div className="flex items-center gap-2 text-[12.5px] text-d-ink2"><span className={`size-2 rounded-full ${dot}`} />{l}</div>
            <div className="mt-3 text-[30px] leading-none font-semibold tracking-[-0.02em]"><CountUp value={v as number} kind={k as "num" | "inr" | "pct"} /></div>
            <div className="mt-2 text-[12px] text-d-ink3">{hint}</div>
          </div>
        ))}
      </div>

      {rows.length ? (
        <>
          <Card title="Lifetime contribution" sub="Confirmed sponsorship per company, all events" className="mt-3">
            {partners.length ? <BarList rows={partners.map((r) => ({ label: r.company, value: r.total, note: `${r.confirmed} event${r.confirmed > 1 ? "s" : ""}` }))} format="inr" color="bg-s4" /> : <Empty>No confirmed partners yet.</Empty>}
          </Card>

          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {rows.map((r) => {
              const p = PROFILES[r.company];
              const badge = r.confirmed >= 2 ? ["Repeat partner", "bg-s1/15 text-s1"] : r.confirmed ? ["Partner", "bg-good/15 text-good"] : r.history.every((h) => h.status === "declined") ? ["Declined", "bg-crit/15 text-crit"] : ["Prospect", "bg-white/[0.06] text-d-ink2"];
              return (
                <section key={r.company} className="rounded-2xl border border-d-line bg-d-panel p-5">
                  <div className="flex items-start gap-3.5">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-d-line bg-gradient-to-br from-white/[0.08] to-transparent text-[14px] font-semibold">
                      {r.company.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[16px] font-semibold">{r.company}</h3>
                        <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${badge[1]}`}>{badge[0]}</span>
                      </div>
                      <div className="mt-0.5 text-[12.5px] text-d-ink3">{p ? `${p.industry} · ${p.city} · partner since ${p.since}` : "No profile yet"}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[17px] font-semibold tabular-nums">{inr(r.total)}</div>
                      <div className="text-[11px] text-d-ink3">{r.confirmed}/{r.history.length} events</div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 rounded-xl border border-d-line bg-black/20 p-3.5 text-[12.5px] sm:grid-cols-2">
                    <div>
                      <div className="text-[10.5px] font-medium tracking-[0.08em] text-d-ink3 uppercase">Contact</div>
                      <div className="mt-1 text-d-ink">{p?.contact ?? "—"}{p ? <span className="text-d-ink3"> · {p.role}</span> : null}</div>
                      <a href={`mailto:${r.email}`} className="text-s1 hover:brightness-125">{r.email}</a>
                    </div>
                    <div>
                      <div className="text-[10.5px] font-medium tracking-[0.08em] text-d-ink3 uppercase">Notes</div>
                      <p className="mt-1 leading-snug text-d-ink2">{p?.notes ?? "Add notes after your first conversation."}</p>
                    </div>
                  </div>

                  <ul className="mt-3 divide-y divide-d-line">
                    {r.history.map((h) => (
                      <li key={h.eventId} className="flex items-center gap-3 py-2 text-[12.5px]">
                        <Link href={`/dashboard/${h.eventId}?s=sponsorship`} className="min-w-0 flex-1 truncate text-d-ink hover:text-s1">{h.event}</Link>
                        <span className="w-20 text-right tabular-nums text-d-ink3">{h.date ? new Date(h.date).toLocaleDateString("en-IN", { month: "short", year: "numeric" }) : "TBA"}</span>
                        <span className="w-16 text-right text-d-ink2">{h.tier ?? "—"}</span>
                        <span className="w-20 text-right tabular-nums">{h.amount ? inr(h.amount) : "—"}</span>
                        <span className={`w-20 rounded-full px-2 py-0.5 text-center text-[10.5px] capitalize ${STATUS[h.status] ?? ""}`}>{h.status}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </>
      ) : (
        <div className="mt-3"><Empty>No sponsors yet — the Sponsorship agent recommends companies once you plan a funded event.</Empty></div>
      )}
    </>
  );
}

export default function Page() {
  return (
    <Shell groups={homeNav("sponsors")}>
      <Suspense fallback={<div className="h-[70vh] animate-pulse rounded-2xl bg-white/[0.03]" />}>
        <Directory />
      </Suspense>
    </Shell>
  );
}
