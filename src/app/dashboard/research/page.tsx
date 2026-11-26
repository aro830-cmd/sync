import { Suspense } from "react";
import { connection } from "next/server";
import { crmReady, db } from "@/lib/server";
import { DEFAULT_WEIGHTS, fitScore, type Weights } from "@/lib/fit";
import type { Company, CompanySource, DealTerms } from "@/lib/types";
import { homeNav } from "@/components/desk/nav";
import { MigrationNotice } from "@/components/desk/MigrationNotice";
import { Research, type ResearchRow } from "@/components/desk/Research";
import { SetupNotice } from "@/components/desk/SetupNotice";
import { Shell } from "@/components/desk/shell";

type DealRow = { id: string; event_id: string; company: string; company_id: string | null; status: string; tier: string | null; value: number | null; contribution_type: string | null; terms: DealTerms | null };

async function Page({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  await connection();
  if (!(await crmReady())) return <MigrationNotice feature="Sponsor research" />;
  const { event: want } = await searchParams;
  const today = new Date().toISOString().slice(0, 10);

  let rows: ResearchRow[], events: { id: string; name: string; date: string | null }[], weights: Weights, eventId: string | null;
  try {
    const d = db();
    const [co, src, set, ev, deals, pays] = await Promise.all([
      d.from("companies").select("*").order("name"),
      d.from("company_sources").select("*").order("source_date", { ascending: false, nullsFirst: false }),
      d.from("settings").select("value").eq("key", "fit_weights").maybeSingle(),
      d.from("events").select("id, name, theme, brief, date, budget, plan").not("name", "is", null).gte("date", today).order("date"),
      d.from("sponsors").select("id, event_id, company, company_id, status, tier, value, contribution_type, terms"),
      d.from("sponsor_payments").select("sponsor_id, status"),
    ]);
    const err = [co, src, set, ev, deals, pays].find((r) => r.error)?.error;
    if (err) throw new Error(err.message);

    weights = { ...DEFAULT_WEIGHTS, ...(set.data?.value as Partial<Weights> | undefined) };
    const funded = (ev.data ?? []).filter((e) => e.plan?.kind !== "free");
    events = funded.map((e) => ({ id: e.id, name: e.name!, date: e.date }));
    const target = funded.find((e) => e.id === want) ?? funded[0] ?? null;
    eventId = target?.id ?? null;
    const late = new Set((pays.data ?? []).filter((p) => p.status === "overdue" || p.status === "disputed").map((p) => p.sponsor_id));

    rows = (co.data as Company[]).map((c) => {
      const sources = (src.data as CompanySource[]).filter((s) => s.company_id === c.id);
      const mine = (deals.data as DealRow[]).filter((x) => x.company_id === c.id || x.company === c.name);
      const ours = {
        confirmed: mine.filter((x) => x.status === "confirmed").length,
        declined: mine.filter((x) => x.status === "declined").length,
        pitched: mine.filter((x) => ["contacted", "replied", "confirmed", "declined"].includes(x.status)).length,
        paidLate: mine.filter((x) => late.has(x.id)).length,
      };
      const fit = fitScore(
        { company: c, sources, ours, event: target ? { theme: `${target.theme ?? ""} ${target.brief}`, date: target.date, budget: target.budget ?? 0 } : null, campusCity: "Bengaluru", today },
        weights,
      );
      const deal = mine.find((x) => x.event_id === target?.id) ?? null;
      return { company: c, sources, ours, fit, deal: deal && { status: deal.status, tier: deal.tier, value: deal.value, contribution_type: deal.contribution_type, terms: deal.terms ?? {} } };
    });
    rows.sort((a, b) => b.fit.score - a.fit.score);
  } catch (e) {
    return <SetupNotice message={e instanceof Error ? e.message : String(e)} />;
  }

  return (
    <>
      <div className="mb-8">
        <div className="text-[12.5px] text-d-ink3">Sponsor intelligence</div>
        <h1 className="mt-2 text-[clamp(1.9rem,3.6vw,2.7rem)] leading-[1.05] font-semibold tracking-[-0.03em]">Sponsor research</h1>
        <p className="mt-2 max-w-2xl text-[14px] text-d-ink2">
          Companies you&apos;re considering, with the evidence behind every claim. The fit score shows exactly how it&apos;s built — change the weights to match what matters for your club. Research only proposes leads; nothing is sent from here.
        </p>
      </div>
      <Research rows={rows} events={events} eventId={eventId} weights={weights} />
    </>
  );
}

export default function ResearchPage({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  return (
    <Shell groups={homeNav("research")}>
      <Suspense fallback={<div className="h-[70vh] animate-pulse rounded-2xl bg-white/[0.03]" />}>
        <Page searchParams={searchParams} />
      </Suspense>
    </Shell>
  );
}
