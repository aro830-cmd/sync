"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import * as act from "@/app/actions";
import type { CompanyInput } from "@/app/actions";
import { FACTOR_LABEL, type FitFactor, type Weights } from "@/lib/fit";
import { inr } from "@/lib/format";
import { CONTRIBUTIONS, type Company, type CompanySource, type DealTerms } from "@/lib/types";
import { Ring } from "./fx";
import { Button, Card, Empty, ToastProvider, ease, useToast } from "./ui";

export type ResearchRow = {
  company: Company;
  sources: CompanySource[];
  ours: { confirmed: number; declined: number; pitched: number; paidLate: number };
  fit: { score: number; factors: { key: FitFactor; label: string; weight: number; score: number; why: string; points: number }[] };
  deal: { status: string; tier: string | null; value: number | null; contribution_type: string | null; terms: DealTerms } | null;
};

const FACTOR_COLOR: Record<FitFactor, string> = { theme: "var(--s1)", local: "var(--s2)", student_history: "var(--s3)", value: "var(--s4)", timeline: "var(--s5)", evidence: "#8a7d72", relationship: "#c9b8a8" };
const CONF_STYLE = { high: "bg-good/15 text-good", medium: "bg-s4/15 text-s4", low: "bg-white/[0.07] text-d-ink3" };
const field = "h-10 w-full min-w-0 rounded-lg border border-d-line bg-black/30 px-3 text-[13.5px] text-d-ink outline-none transition-colors placeholder:text-d-ink3 focus:border-white/25";

function useRun() {
  const notify = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      notify(r.ok, r.message);
      if (r.ok) {
        after?.();
        router.refresh();
      }
    });
  return [pending, run] as const;
}

export function Research(props: { rows: ResearchRow[]; events: { id: string; name: string; date: string | null }[]; eventId: string | null; weights: Weights }) {
  return (
    <ToastProvider>
      <Board {...props} />
    </ToastProvider>
  );
}

function Board({ rows, events, eventId, weights }: { rows: ResearchRow[]; events: { id: string; name: string; date: string | null }[]; eventId: string | null; weights: Weights }) {
  const [adding, setAdding] = useState(false);
  const [compare, setCompare] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  const event = events.find((e) => e.id === eventId);
  const picked = rows.filter((r) => compare.includes(r.company.id));

  return (
    <>
      <div className="grid gap-3 lg:grid-cols-[1fr_1.1fr]">
        <Card title="Score against" sub="Theme and timeline are judged against this event">
          {events.length ? (
            <div className="flex flex-wrap gap-1.5">
              {events.map((e) => (
                <Link key={e.id} href={`/dashboard/research?event=${e.id}`} className={`rounded-full border px-3 py-1.5 text-[12.5px] transition-colors ${e.id === eventId ? "border-s1/50 bg-s1/15 text-d-ink" : "border-d-line text-d-ink3 hover:text-d-ink2"}`}>
                  {e.name}
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-d-ink3">No upcoming funded events — scores leave out theme and timeline.</p>
          )}
        </Card>
        <WeightsCard weights={weights} />
      </div>

      <div className="mt-6 mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[15px] font-medium">{rows.length} compan{rows.length === 1 ? "y" : "ies"} · ranked by fit{event ? ` for ${event.name}` : ""}</h2>
        <Button variant={adding ? "ghost" : "accent"} onClick={() => setAdding((a) => !a)}>{adding ? "Close" : "+ Add company"}</Button>
      </div>
      <AnimatePresence initial={false}>
        {adding && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.35, ease }} className="mb-3 overflow-hidden">
            <CompanyForm onDone={() => setAdding(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {rows.length ? (
        <ul className="space-y-3">
          {rows.map((r) => (
            <CompanyCard key={r.company.id} r={r} eventId={eventId} eventName={event?.name ?? null} checked={compare.includes(r.company.id)} onCompare={(on) => setCompare((c) => (on ? [...c, r.company.id].slice(-4) : c.filter((x) => x !== r.company.id)))} />
          ))}
        </ul>
      ) : (
        <Empty>No companies yet. Add the ones you&apos;re considering — with a source for every claim.</Empty>
      )}

      <AnimatePresence>
        {picked.length >= 2 && (
          <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} transition={{ duration: 0.35, ease }} className="fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
            <div className="flex items-center gap-3 rounded-full border border-d-line bg-d-raise px-4 py-2 shadow-[0_20px_50px_-12px_rgba(0,0,0,.8)]">
              <span className="text-[13px]">{picked.length} selected</span>
              <Button variant="accent" onClick={() => setShowCompare(true)}>Compare →</Button>
              <button onClick={() => setCompare([])} className="text-[12.5px] text-d-ink3 hover:text-d-ink">Clear</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>{showCompare && picked.length >= 2 && <Compare rows={picked} eventName={event?.name ?? null} onClose={() => setShowCompare(false)} />}</AnimatePresence>
    </>
  );
}

function WeightsCard({ weights }: { weights: Weights }) {
  const [w, setW] = useState(weights);
  const [pending, run] = useRun();
  const total = Object.values(w).reduce((s, v) => s + v, 0) || 1;
  const dirty = JSON.stringify(w) !== JSON.stringify(weights);
  return (
    <Card title="Fit-score weights" sub="How much each factor counts. Shares are shown as % of the total." action={<Button variant="ghost" pending={pending} disabled={!dirty} onClick={() => run(() => act.saveFitWeights(w))}>Save</Button>}>
      <div className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
        {(Object.keys(FACTOR_LABEL) as FitFactor[]).map((k) => (
          <label key={k} className="block text-[12px]">
            <span className="flex items-center justify-between gap-2 text-d-ink2">
              <span className="flex items-center gap-2"><span className="size-2 rounded-full" style={{ background: FACTOR_COLOR[k] }} />{FACTOR_LABEL[k]}</span>
              <span className="tabular-nums text-d-ink3">{Math.round((w[k] / total) * 100)}%</span>
            </span>
            <input type="range" min={0} max={50} value={w[k]} onChange={(e) => setW({ ...w, [k]: Number(e.target.value) })} className="mt-1 w-full accent-[var(--s1)]" aria-label={FACTOR_LABEL[k]} />
          </label>
        ))}
      </div>
    </Card>
  );
}

function CompanyCard({ r, eventId, eventName, checked, onCompare }: { r: ResearchRow; eventId: string | null; eventName: string | null; checked: boolean; onCompare: (on: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pending, run] = useRun();
  const c = r.company;
  return (
    <motion.li layout transition={{ duration: 0.35, ease }} className="rounded-2xl border border-d-line bg-d-panel p-5">
      <div className="flex flex-wrap items-start gap-4">
        <Ring value={r.fit.score} max={100} size={56} color="var(--s1)">{r.fit.score}</Ring>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[16px] font-semibold">{c.name}</h3>
            {r.ours.confirmed > 0 && <span className="rounded-full bg-good/15 px-2 py-0.5 text-[10.5px] text-good">Partnered {r.ours.confirmed}×</span>}
            {r.ours.paidLate > 0 && <span className="rounded-full bg-crit/15 px-2 py-0.5 text-[10.5px] text-crit">{r.ours.paidLate} late/disputed payment{r.ours.paidLate > 1 ? "s" : ""}</span>}
          </div>
          <div className="mt-0.5 text-[12.5px] text-d-ink3">{[c.industry, c.city].filter(Boolean).join(" · ") || "No profile details yet"}{c.est_value ? ` · ~${inr(c.est_value)} est.` : ""}</div>
          {!!c.contribution_types.length && (
            <div className="mt-2 flex flex-wrap gap-1">{c.contribution_types.map((t) => <span key={t} className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] capitalize text-d-ink2">{t}</span>)}</div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-[12px] text-d-ink3"><input type="checkbox" checked={checked} onChange={(e) => onCompare(e.target.checked)} className="size-4 accent-[var(--s1)]" />Compare</label>
          <Button variant="ghost" onClick={() => setEditing((x) => !x)}>{editing ? "Close" : "Edit"}</Button>
          {eventId && !r.deal && <Button pending={pending} onClick={() => run(() => act.leadFromCompany(eventId, c.id))}>+ Lead for {eventName}</Button>}
          {r.deal && <span className="rounded-full border border-d-line px-2.5 py-1 text-[11.5px] text-d-ink2">{r.deal.status[0].toUpperCase() + r.deal.status.slice(1)} on {eventName}</span>}
        </div>
      </div>

      {/* score bar: each factor's share of the score, in its colour */}
      <button onClick={() => setOpen((o) => !o)} className="mt-4 block w-full text-left" aria-expanded={open}>
        <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-full bg-white/[0.05]">
          {r.fit.factors.filter((f) => f.points > 0.5).map((f) => (
            <motion.span key={f.key} title={`${f.label}: ${f.points.toFixed(1)} pts`} initial={{ width: 0 }} animate={{ width: `${f.points}%` }} transition={{ duration: 0.7, ease }} style={{ background: FACTOR_COLOR[f.key] }} className="h-full first:rounded-l-full" />
          ))}
        </div>
        <span className="mt-1.5 block text-[11.5px] text-d-ink3">{open ? "Hide" : "Why"} this score →</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease }} className="mt-2 space-y-1.5 overflow-hidden">
            {r.fit.factors.map((f) => (
              <li key={f.key} className="grid grid-cols-[14px_1fr_auto] items-start gap-2 text-[12.5px]">
                <span className="mt-1 size-2 rounded-full" style={{ background: FACTOR_COLOR[f.key] }} />
                <span><span className="text-d-ink">{f.label}</span> <span className="text-d-ink3">— {f.why}</span></span>
                <span className="tabular-nums text-d-ink2">{f.points.toFixed(1)} / {(f.weight * 100 / Math.max(1, r.fit.factors.reduce((s, x) => s + x.weight, 0))).toFixed(0)}</span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>

      {editing && <div className="mt-4"><CompanyForm c={c} onDone={() => setEditing(false)} /></div>}

      <Sources companyId={c.id} sources={r.sources} contact={c.contact_route} website={c.website} notes={c.notes} />
    </motion.li>
  );
}

function Sources({ companyId, sources, contact, website, notes }: { companyId: string; sources: CompanySource[]; contact: string | null; website: string | null; notes: string | null }) {
  const [adding, setAdding] = useState(false);
  const [s, setS] = useState({ claim: "", url: "", source_date: "", confidence: "medium", kind: "history" });
  const [pending, run] = useRun();
  return (
    <div className="mt-4 rounded-xl border border-d-line bg-black/20 p-3.5">
      <div className="grid gap-2 text-[12.5px] sm:grid-cols-3">
        <div><span className="text-d-ink3">Contact route · </span>{contact ? (/^https?:/.test(contact) ? <a href={contact} target="_blank" rel="noreferrer" className="text-s1 hover:brightness-125">official page ↗</a> : <span className="text-d-ink">{contact}</span>) : <span className="text-d-ink3">none recorded</span>}</div>
        <div><span className="text-d-ink3">Website · </span>{website ? <a href={website} target="_blank" rel="noreferrer" className="text-s1 hover:brightness-125">{website.replace(/^https?:\/\//, "")}</a> : <span className="text-d-ink3">—</span>}</div>
        {notes && <div className="truncate text-d-ink2 sm:col-span-1" title={notes}>{notes}</div>}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-d-ink3">Evidence · {sources.length}</span>
        <button onClick={() => setAdding((a) => !a)} className="text-[12px] text-s1 hover:brightness-125">{adding ? "Cancel" : "+ Add source"}</button>
      </div>
      {sources.length ? (
        <ul className="mt-2 divide-y divide-d-line">
          {sources.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-[12.5px]">
              <span className={`rounded-full px-2 py-0.5 text-[10.5px] capitalize ${CONF_STYLE[x.confidence]}`}>{x.confidence}</span>
              <span className="min-w-0 flex-1 text-d-ink">{x.claim}</span>
              <a href={x.url} target="_blank" rel="noreferrer" className="max-w-[220px] truncate text-s1 hover:brightness-125">{x.url.replace(/^https?:\/\//, "")}</a>
              <span className="tabular-nums text-d-ink3">{x.source_date ?? "undated"}</span>
              <button disabled={pending} onClick={() => run(() => act.deleteSource(x.id))} className="text-[11.5px] text-d-ink3 hover:text-crit">Remove</button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[12.5px] text-d-ink3">No sources — claims about this company aren&apos;t counted until one is added.</p>
      )}
      {adding && (
        <form className="mt-3 grid gap-2 sm:grid-cols-[2fr_2fr_1fr_1fr_1fr_auto]" onSubmit={(e) => (e.preventDefault(), run(() => act.addSource(companyId, s), () => (setAdding(false), setS({ ...s, claim: "", url: "" }))))}>
          <input required value={s.claim} onChange={(e) => setS({ ...s, claim: e.target.value })} placeholder="What it says, e.g. Sponsored HackBLR 2025" aria-label="Claim" className={field} />
          <input required type="url" value={s.url} onChange={(e) => setS({ ...s, url: e.target.value })} placeholder="https://official page or press release" aria-label="Source URL" className={field} />
          <input type="date" value={s.source_date} onChange={(e) => setS({ ...s, source_date: e.target.value })} aria-label="Source date" className={`${field} [color-scheme:dark]`} />
          <select value={s.kind} onChange={(e) => setS({ ...s, kind: e.target.value })} aria-label="Kind" className={field}>
            {["history", "profile", "contact", "news"].map((k) => <option key={k} value={k} className="bg-d-raise">{k}</option>)}
          </select>
          <select value={s.confidence} onChange={(e) => setS({ ...s, confidence: e.target.value })} aria-label="Confidence" className={field}>
            {["high", "medium", "low"].map((k) => <option key={k} value={k} className="bg-d-raise">{k} confidence</option>)}
          </select>
          <Button pending={pending}>Add</Button>
        </form>
      )}
    </div>
  );
}

function CompanyForm({ c, onDone }: { c?: Company; onDone: () => void }) {
  const [f, setF] = useState<CompanyInput>({
    id: c?.id,
    name: c?.name ?? "",
    industry: c?.industry ?? "",
    city: c?.city ?? "",
    website: c?.website ?? "",
    contact_route: c?.contact_route ?? "",
    contribution_types: c?.contribution_types ?? [],
    est_value: c?.est_value ?? null,
    notes: c?.notes ?? "",
  });
  const [pending, run] = useRun();
  const set = <K extends keyof CompanyInput>(k: K, v: CompanyInput[K]) => setF((x) => ({ ...x, [k]: v }));
  return (
    <form onSubmit={(e) => (e.preventDefault(), run(() => act.saveCompany(f), onDone))} className="rounded-2xl border border-d-line bg-d-panel p-5">
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        <input required value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Company name" aria-label="Company name" className={field} />
        <input value={f.industry} onChange={(e) => set("industry", e.target.value)} placeholder="Industry, e.g. Cloud infrastructure" aria-label="Industry" className={field} />
        <input value={f.city} onChange={(e) => set("city", e.target.value)} placeholder="City / region" aria-label="City" className={field} />
        <input value={f.website} onChange={(e) => set("website", e.target.value)} placeholder="https://company website" aria-label="Website" className={field} />
        <input value={f.contact_route} onChange={(e) => set("contact_route", e.target.value)} placeholder="Official contact page or published email" aria-label="Contact route" className={field} />
        <input type="number" min={0} step={1000} value={f.est_value ?? ""} onChange={(e) => set("est_value", e.target.value === "" ? null : Number(e.target.value))} placeholder="Estimated value (₹)" aria-label="Estimated value" className={field} />
        <textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Notes (your own observations — not facts about them)" aria-label="Notes" rows={2} className={`${field} h-auto py-2 sm:col-span-2 lg:col-span-3`} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[12px] text-d-ink3">Contribution types:</span>
        {CONTRIBUTIONS.map((t) => {
          const on = f.contribution_types.includes(t);
          return (
            <button key={t} type="button" aria-pressed={on} onClick={() => set("contribution_types", on ? f.contribution_types.filter((x) => x !== t) : [...f.contribution_types, t])} className={`h-7 rounded-full border px-2.5 text-[12px] capitalize transition-colors ${on ? "border-s1/50 bg-s1/15 text-d-ink" : "border-d-line text-d-ink3 hover:text-d-ink2"}`}>
              {t}
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
        <Button pending={pending} disabled={!f.name.trim()}>{c ? "Save changes" : "Add company"}</Button>
      </div>
    </form>
  );
}

const TERM_ROWS: [keyof DealTerms, string][] = [
  ["obligations", "Obligations"],
  ["exclusivity", "Exclusivity clauses"],
  ["data_sharing", "Data-sharing requests"],
  ["branding", "Branding deliverables"],
  ["payment_terms", "Payment terms"],
  ["reporting", "Reporting requirements"],
  ["deadline", "Deadlines"],
];

function Compare({ rows, eventName, onClose }: { rows: ResearchRow[]; eventName: string | null; onClose: () => void }) {
  const cell = "border-b border-d-line px-3 py-2.5 align-top text-[12.5px]";
  return (
    <motion.div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div role="dialog" aria-modal="true" aria-label="Compare sponsors" onClick={(e) => e.stopPropagation()} initial={{ y: 16, scale: 0.98 }} animate={{ y: 0, scale: 1 }} exit={{ y: 8 }} transition={{ duration: 0.3, ease }} className="max-h-[88vh] w-full max-w-5xl overflow-auto rounded-2xl border border-d-line bg-d-panel p-5">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[18px] font-semibold">Compare sponsors</h2>
            <p className="text-[12.5px] text-d-ink2">Deal terms are from {eventName ? `their deal on ${eventName}` : "their current deal"}; “—” means nothing recorded yet, not “none”.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-d-ink3 hover:text-d-ink">✕</button>
        </div>
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead>
            <tr>
              <th className={`${cell} w-44 text-d-ink3`} />
              {rows.map((r) => <th key={r.company.id} className={`${cell} text-[14px] font-semibold`}>{r.company.name}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr><td className={`${cell} text-d-ink3`}>Fit score</td>{rows.map((r) => <td key={r.company.id} className={`${cell} font-semibold`}>{r.fit.score}</td>)}</tr>
            <tr><td className={`${cell} text-d-ink3`}>Actual value</td>{rows.map((r) => <td key={r.company.id} className={cell}>{r.deal?.value ? inr(r.deal.value) : r.company.est_value ? `~${inr(r.company.est_value)} (estimate)` : "—"}{r.deal?.contribution_type ? ` · ${r.deal.contribution_type}` : ""}</td>)}</tr>
            <tr><td className={`${cell} text-d-ink3`}>Contribution types</td>{rows.map((r) => <td key={r.company.id} className={`${cell} capitalize`}>{r.company.contribution_types.join(", ") || "—"}</td>)}</tr>
            <tr><td className={`${cell} text-d-ink3`}>Our history</td>{rows.map((r) => <td key={r.company.id} className={cell}>{r.ours.confirmed} confirmed · {r.ours.declined} declined{r.ours.paidLate ? ` · ${r.ours.paidLate} late/disputed` : ""}</td>)}</tr>
            {TERM_ROWS.map(([k, label]) => (
              <tr key={k}><td className={`${cell} text-d-ink3`}>{label}</td>{rows.map((r) => <td key={r.company.id} className={`${cell} ${r.deal?.terms?.[k] ? "text-d-ink" : "text-d-ink3"}`}>{r.deal?.terms?.[k] ?? "—"}</td>)}</tr>
            ))}
            <tr><td className={`${cell} text-d-ink3`}>Evidence</td>{rows.map((r) => <td key={r.company.id} className={cell}>{r.sources.length} source{r.sources.length === 1 ? "" : "s"}{r.sources[0] ? ` · newest ${r.sources[0].source_date ?? "undated"}` : ""}</td>)}</tr>
          </tbody>
        </table>
      </motion.div>
    </motion.div>
  );
}
