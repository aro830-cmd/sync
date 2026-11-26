"use client";

import { AnimatePresence, motion } from "motion/react";
import { createContext, useContext, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import * as act from "@/app/actions";
import type { AuditEntry, Decision, DecisionLog, DecisionStatus, Volunteer } from "@/lib/types";
import { Button, ease, useToast } from "./ui";

// Decision explainability & appeal trail: a "Why?" chip on any automated outcome opens this panel.

type Focus = "why" | "appeal";
type Person = { id: string; name: string };
type Ctx = { decisions: Decision[]; log: DecisionLog[]; volunteers: Volunteer[]; profiles?: Person[]; open: (id: string, focus?: Focus) => void };
const WhyCtx = createContext<Ctx>({ decisions: [], log: [], volunteers: [], open: () => {} });

export const STATUS: Record<DecisionStatus, { label: string; cls: string }> = {
  auto: { label: "Automated", cls: "border-d-line text-d-ink3" },
  appealed: { label: "Appealed", cls: "border-s2/40 bg-s2/10 text-s2" },
  upheld: { label: "Upheld", cls: "border-good/40 bg-good/10 text-good" },
  overridden: { label: "Overridden", cls: "border-s1/40 bg-s1/10 text-s1" },
  rejected: { label: "Appeal rejected", cls: "border-d-line text-d-ink2" },
};
export const KIND: Record<Decision["kind"], string> = { shift: "Shift", reroute: "Re-route", sponsor: "Sponsor", plan: "Plan", role: "Role" };

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });

export function Pill({ status }: { status: DecisionStatus }) {
  const s = STATUS[status];
  return <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] ${s.cls}`}>{s.label}</span>;
}

export function WhyProvider({ decisions, log, volunteers, profiles = [], children }: Omit<Ctx, "open"> & { children: ReactNode }) {
  const [at, setAt] = useState<{ id: string; focus: Focus } | null>(null);
  const d = decisions.find((x) => x.id === at?.id);
  return (
    <WhyCtx.Provider value={{ decisions, log, volunteers, profiles, open: (id, focus = "why") => setAt({ id, focus }) }}>
      {children}
      <AnimatePresence>
        {d && <Panel key={d.id + at!.focus} d={d} focus={at!.focus} log={log.filter((l) => l.decision_id === d.id)} volunteers={d.kind === "role" ? profiles : volunteers} onClose={() => setAt(null)} />}
      </AnimatePresence>
    </WhyCtx.Provider>
  );
}

export const useWhy = () => useContext(WhyCtx);

/** "Why?" + "Appeal" controls for one automated outcome. Pass a decision id, or a subject id (task/sponsor/event) for its latest decision. */
export function Why({ id, subject }: { id?: string; subject?: string }) {
  const { decisions, open } = useWhy();
  const d = id ? decisions.find((x) => x.id === id) : decisions.find((x) => x.subject_id === subject); // newest first
  if (!d) return null;
  const chip = "inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] transition-colors hover:text-d-ink";
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      <button type="button" onClick={stop(() => open(d.id))} title="Why did the system decide this?" className={`${chip} border-d-line text-d-ink3 hover:border-white/25`}>
        Why?
      </button>
      <button
        type="button"
        onClick={stop(() => open(d.id, "appeal"))}
        title={d.status === "appealed" ? "Appeal waiting for review" : "Appeal or flag this decision"}
        className={`${chip} ${d.status === "appealed" ? "border-s2/50 text-s2" : "border-d-line text-d-ink3 hover:border-white/25"}`}
      >
        {d.status === "appealed" ? "Appealed" : d.status === "auto" ? "Appeal" : STATUS[d.status].label}
      </button>
    </span>
  );
}

function Panel({ d, focus, log, volunteers, onClose }: { d: Decision; focus: Focus; log: DecisionLog[]; volunteers: Person[]; onClose: () => void }) {
  const appealRef = useRef<HTMLDivElement>(null);
  const jump = () => {
    appealRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    appealRef.current?.querySelector<HTMLElement>("textarea")?.focus({ preventScroll: true });
  };
  // Opened from an "Appeal" control → go straight to the form.
  useEffect(() => {
    if (focus === "appeal") setTimeout(jump, 320);
  }, [focus]);
  const notify = useToast();
  const [pending, start] = useTransition();
  const [type, setType] = useState<"dispute" | "override">("dispute");
  const [msg, setMsg] = useState("");
  const [proposal, setProposal] = useState("");
  const [note, setNote] = useState("");
  const [assignTo, setAssignTo] = useState("");
  const shift = d.kind === "shift" || d.kind === "reroute" || d.kind === "role";
  const go = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const r = await fn();
      notify(r.ok, r.message);
      if (r.ok) {
        setMsg("");
        setNote("");
      }
    });
  const field = "w-full rounded-lg border border-d-line bg-black/30 px-3 py-2 text-[13px] text-d-ink outline-none placeholder:text-d-ink3 focus:border-white/25";

  return (
    <motion.div className="fixed inset-0 z-40 flex justify-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/60" />
      <motion.aside
        role="dialog"
        aria-label="Why did the system decide this?"
        initial={{ x: 40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 40, opacity: 0 }}
        transition={{ duration: 0.3, ease }}
        className="relative h-full w-full max-w-[520px] overflow-y-auto border-l border-d-line bg-d-bg p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[12px] text-d-ink3">
              {KIND[d.kind]} · {d.decided_by}
            </div>
            <h2 className="mt-1.5 text-[18px] font-semibold leading-snug">{d.subject}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[13.5px] text-d-ink2">
              {d.outcome} <Pill status={d.status} />
            </div>
            <div className="mt-3">
              <Button variant={d.status === "appealed" ? "accent" : "ghost"} onClick={jump}>
                {d.status === "appealed" ? "Resolve appeal ↓" : "Appeal / flag this decision ↓"}
              </Button>
            </div>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 text-[12.5px] text-d-ink3 hover:text-d-ink">Close</button>
        </div>

        <Section title="Why did the system decide this?">
          <ul className="space-y-2">
            {d.why.rules.map((r, i) => (
              <li key={i} className="flex gap-2.5 text-[13px]">
                <span aria-hidden className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full text-[10px] ${r.ok ? "bg-good/15 text-good" : "bg-crit/15 text-crit"}`}>{r.ok ? "✓" : "✕"}</span>
                <span className="sr-only">{r.ok ? "Met:" : "Not met:"}</span>
                <span>
                  <span className="text-d-ink">{r.rule}</span>
                  <span className="block text-[12px] text-d-ink3">{r.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </Section>

        {d.why.scores && Object.keys(d.why.scores).length > 0 && (
          <Section title="Scores & inputs">
            <dl className="grid grid-cols-3 gap-3">
              {Object.entries(d.why.scores).map(([k, v]) => (
                <div key={k} className="rounded-lg border border-d-line px-3 py-2">
                  <dt className="text-[11px] capitalize text-d-ink3">{k}</dt>
                  <dd className="text-[14px] font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </Section>
        )}

        {d.why.considered && d.why.considered.length > 0 && (
          <Section title="Everyone considered">
            <ul className="divide-y divide-d-line">
              {d.why.considered.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                  <span className={c.verdict === "chosen" ? "text-good" : "text-d-ink"}>{c.name}</span>
                  <span className="text-right text-[12px] text-d-ink3">
                    <span className={`mr-1.5 ${c.verdict === "chosen" ? "text-good" : ""}`}>{c.verdict}</span>
                    {c.detail}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {!!d.why.notes?.length && (
          <Section title="Model's reasoning">
            {d.why.notes.map((n, i) => <p key={i} className="text-[13px] leading-relaxed text-d-ink2">{n}</p>)}
          </Section>
        )}

        <div ref={appealRef} className="scroll-mt-6">
        {d.status === "appealed" ? (
          <Section title="Resolve the appeal">
            {d.appeal && (
              <div className="mb-3 rounded-lg border border-s2/30 bg-s2/5 px-3 py-2.5 text-[13px]">
                <div className="text-[12px] text-s2">{d.appeal.type === "override" ? "Override requested" : "Disputed"} by {d.appeal.by}</div>
                <p className="mt-1 text-d-ink">{d.appeal.message}</p>
                {d.appeal.proposal && <p className="mt-1 text-[12px] text-d-ink2">Suggests: {d.appeal.proposal}</p>}
              </div>
            )}
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the audit log (required)" aria-label="Resolution note" className={field} />
            {shift && (
              <select value={assignTo} onChange={(e) => setAssignTo(e.target.value)} aria-label="Re-assign to" className={`${field} mt-2 h-10`}>
                <option value="">Override: re-assign to…</option>
                {volunteers.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            )}
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <Button variant="ghost" pending={pending} disabled={!note.trim()} onClick={() => go(() => act.resolveAppeal(d.id, "rejected", note))}>Reject appeal</Button>
              <Button variant="ghost" pending={pending} disabled={!note.trim()} onClick={() => go(() => act.resolveAppeal(d.id, "upheld", note))}>Uphold decision</Button>
              <Button variant="accent" pending={pending} disabled={!note.trim() || (shift && !assignTo)} onClick={() => go(() => act.resolveAppeal(d.id, "overridden", note, assignTo || undefined))}>Override</Button>
            </div>
          </Section>
        ) : (
          <Section title="Appeal or flag this decision">
            <div role="radiogroup" aria-label="Appeal type" className="mb-2 flex gap-1.5">
              {(["dispute", "override"] as const).map((t) => (
                <button key={t} type="button" role="radio" aria-checked={type === t} onClick={() => setType(t)} className={`h-8 rounded-lg border px-3 text-[12.5px] ${type === t ? "border-white/20 bg-white/[0.08] text-d-ink" : "border-d-line text-d-ink2"}`}>
                  {t === "dispute" ? "Dispute" : "Request override"}
                </button>
              ))}
            </div>
            <textarea rows={2} maxLength={500} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Briefly, why is this wrong?" aria-label="Reason" className={field} />
            {type === "override" && <input value={proposal} onChange={(e) => setProposal(e.target.value)} maxLength={120} placeholder="What should it be instead? (optional)" aria-label="Proposed change" className={`${field} mt-2`} />}
            <div className="mt-3 flex justify-end">
              <Button pending={pending} disabled={msg.trim().length < 3} onClick={() => go(() => act.appealDecision(d.id, type, msg, proposal))}>Submit appeal</Button>
            </div>
          </Section>
        )}

        </div>

        <p className="mt-6 border-t border-d-line pt-4 text-[12px] text-d-ink3">
          {log.length} status change{log.length === 1 ? "" : "s"} recorded
          {log.length ? ` · last: ${STATUS[log[log.length - 1].to_status]?.label ?? log[log.length - 1].to_status} by ${log[log.length - 1].actor}, ${when(log[log.length - 1].created_at)}` : ""}. Full history on the
          <span className="text-d-ink2"> Audit log</span> page.
        </p>
      </motion.aside>
    </motion.div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-d-ink3">{title}</h3>
      {children}
    </section>
  );
}

/** Desk page: every automated decision for the event, open appeals first. */
export function DecisionsPage() {
  const { decisions } = useWhy();
  const [filter, setFilter] = useState<"all" | "appealed" | "resolved">("all");
  const list = decisions
    .filter((d) => (filter === "all" ? true : filter === "appealed" ? d.status === "appealed" : ["upheld", "overridden", "rejected"].includes(d.status)))
    .sort((a, b) => Number(b.status === "appealed") - Number(a.status === "appealed"));
  const n = (s: DecisionStatus[]) => decisions.filter((d) => s.includes(d.status)).length;
  return (
    <div className="space-y-3">
      <div className="mb-7">
        <div className="text-[12.5px] text-d-ink3">Decision explainability & appeal trail</div>
        <h1 className="mt-2 text-[clamp(1.75rem,3.2vw,2.4rem)] leading-[1.1] font-semibold tracking-[-0.025em]">Why did the system decide this?</h1>
        <p className="mt-2 max-w-2xl text-[14px] text-d-ink2">
          Every automated outcome — shifts, re-routes, sponsor scores, the plan — with the exact rules and scores behind it. Anyone affected can appeal; every status change is logged with a timestamp.
        </p>
      </div>
      <div role="tablist" className="flex flex-wrap gap-1.5">
        {([["all", `All · ${decisions.length}`], ["appealed", `Open appeals · ${n(["appealed"])}`], ["resolved", `Resolved · ${n(["upheld", "overridden", "rejected"])}`]] as const).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} className={`h-8 rounded-lg border px-3 text-[12.5px] ${filter === k ? "border-white/20 bg-white/[0.08] text-d-ink" : "border-d-line text-d-ink2 hover:text-d-ink"}`}>
            {label}
          </button>
        ))}
      </div>
      <section className="rounded-2xl border border-d-line bg-d-panel">
        {list.length ? (
          <ul className="divide-y divide-d-line">
            {list.map((d) => (
              <li key={d.id} className="grid gap-1 px-5 py-3 text-[13px] sm:grid-cols-[90px_1.4fr_1.4fr_auto] sm:items-center sm:gap-4">
                <span className="text-[11.5px] text-d-ink3">{KIND[d.kind]}</span>
                <span className="truncate text-d-ink">{d.subject}</span>
                <span className="truncate text-d-ink2">{d.outcome}</span>
                <span className="flex items-center gap-2">
                  <Pill status={d.status} />
                  <Why id={d.id} />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-10 text-center text-[13px] text-d-ink3">{decisions.length ? "Nothing here." : "No automated decisions yet — run an agent or trigger a disruption."}</p>
        )}
      </section>
    </div>
  );
}

/** Desk page: one append-only, timestamped log — decision status changes (Why & appeals) and organiser actions (sponsor CRM, payments, roles, rewards). */
export function AuditLogPage({ actions = [] }: { actions?: AuditEntry[] }) {
  const { decisions, log, open } = useWhy();
  const [filter, setFilter] = useState<"all" | "decisions" | "actions">("all");
  const by = new Map(decisions.map((d) => [d.id, d]));
  const rows = [
    ...(filter !== "actions" ? log.map((l) => ({ kind: "decision" as const, at: l.created_at, l })) : []),
    ...(filter !== "decisions" ? actions.map((a) => ({ kind: "action" as const, at: a.created_at, a })) : []),
  ].sort((x, y) => y.at.localeCompare(x.at));
  const detail = (a: AuditEntry) => Object.entries(a.detail ?? {}).filter(([, v]) => v != null && typeof v !== "object").map(([k, v]) => `${k}: ${v}`).join(" · ");
  return (
    <div className="space-y-3">
      <div className="mb-7">
        <div className="text-[12.5px] text-d-ink3">Append-only · timestamped</div>
        <h1 className="mt-2 text-[clamp(1.75rem,3.2vw,2.4rem)] leading-[1.1] font-semibold tracking-[-0.025em]">Audit log</h1>
        <p className="mt-2 max-w-2xl text-[14px] text-d-ink2">Every status change of every automated decision, and every organiser action on this event: who did it, when, and why. Entries are only ever added, never edited.</p>
      </div>
      <div role="tablist" className="flex flex-wrap gap-1.5">
        {([["all", `All · ${log.length + actions.length}`], ["decisions", `Decisions & appeals · ${log.length}`], ["actions", `Organiser actions · ${actions.length}`]] as const).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} className={`h-8 rounded-lg border px-3 text-[12.5px] ${filter === k ? "border-white/20 bg-white/[0.08] text-d-ink" : "border-d-line text-d-ink2 hover:text-d-ink"}`}>
            {label}
          </button>
        ))}
      </div>
      <section className="overflow-x-auto rounded-2xl border border-d-line bg-d-panel">
        {rows.length ? (
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead className="text-[11px] uppercase tracking-[0.08em] text-d-ink3">
              <tr className="border-b border-d-line">
                <th className="px-5 py-3 font-medium">When</th>
                <th className="px-3 py-3 font-medium">What</th>
                <th className="px-3 py-3 font-medium">Change</th>
                <th className="px-3 py-3 font-medium">By</th>
                <th className="px-5 py-3 font-medium">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-d-line">
              {rows.map((r) => {
                if (r.kind === "action") {
                  const a = r.a;
                  return (
                    <tr key={`a${a.id}`} className="align-top">
                      <td className="whitespace-nowrap px-5 py-3 tabular-nums text-d-ink3"><time dateTime={a.created_at}>{when(a.created_at)}</time></td>
                      <td className="px-3 py-3 text-d-ink"><span className="block text-[11px] text-d-ink3">Organiser action</span>{a.entity.replace(/_/g, " ")}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-d-ink2">{a.action.replace(/_/g, " ")}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-d-ink2">{a.actor}</td>
                      <td className="px-5 py-3 text-d-ink2">{detail(a) || "—"}</td>
                    </tr>
                  );
                }
                const l = r.l;
                const d = by.get(l.decision_id);
                return (
                  <tr key={l.id} className="align-top">
                    <td className="whitespace-nowrap px-5 py-3 tabular-nums text-d-ink3">
                      <time dateTime={l.created_at}>{when(l.created_at)}</time>
                    </td>
                    <td className="max-w-[260px] px-3 py-3">
                      {d ? (
                        <button type="button" onClick={() => open(d.id)} className="text-left text-d-ink underline-offset-4 hover:underline">
                          <span className="block text-[11px] text-d-ink3">{KIND[d.kind]} decision</span>
                          {d.subject}
                        </button>
                      ) : (
                        <span className="text-d-ink3">Removed</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <span className="flex items-center gap-1.5">
                        {l.from_status && <><Pill status={l.from_status as DecisionStatus} /><span aria-hidden className="text-d-ink3">→</span></>}
                        <Pill status={l.to_status} />
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-d-ink2">{l.actor}</td>
                    <td className="px-5 py-3 text-d-ink2">{l.note ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="px-5 py-10 text-center text-[13px] text-d-ink3">Nothing logged yet.</p>
        )}
      </section>
    </div>
  );
}
