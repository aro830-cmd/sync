"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import * as act from "@/app/actions";
import { inr } from "@/lib/format";
import { CONTRIBUTIONS, PAYMENT_STATUSES, type AuditEntry, type Deliverable, type EventRow, type Incident, type MissionRole, type RoleRequest, type Sponsor, type SponsorPayment } from "@/lib/types";
import { Button, Card, Empty, ease, useToast } from "./ui";

export type Crm = {
  payments: SponsorPayment[];
  deliverables: Deliverable[];
  roles: MissionRole[];
  requests: RoleRequest[];
  profiles: { id: string; name: string; email: string; skills: string[]; preferred_roles: string[]; opted_in: boolean; available: boolean }[];
  incidents: Incident[];
  audit: AuditEntry[];
} | null;

const field = "h-9 w-full min-w-0 rounded-lg border border-d-line bg-black/30 px-3 text-[13px] text-d-ink outline-none transition-colors placeholder:text-d-ink3 focus:border-white/25";
const TERMS: [string, string, string][] = [
  ["obligations", "Obligations", "What we must do for them"],
  ["exclusivity", "Exclusivity", "e.g. no competing cloud sponsor as Title/Gold"],
  ["data_sharing", "Data sharing", "e.g. opt-in resume book only — never raw attendee lists"],
  ["branding", "Branding deliverables", "Logo placements, mentions, booth"],
  ["payment_terms", "Payment terms", "e.g. 50% on signing, 50% within 15 days after"],
  ["reporting", "Reporting", "What report they expect, and when"],
  ["deadline", "Deadlines", "e.g. confirm by 10 Jan, artwork by 15 Jan"],
];
const STATUS_STYLE: Record<string, string> = {
  planned: "bg-white/[0.06] text-d-ink2",
  invoice_sent: "bg-s2/15 text-s2",
  committed: "bg-s4/15 text-s4",
  partially_received: "bg-s4/15 text-s4",
  received: "bg-good/15 text-good",
  overdue: "bg-crit/15 text-crit",
  disputed: "bg-crit/15 text-crit",
};
const nice = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

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

/** A payment past its due date that hasn't fully arrived shows as overdue, even before someone updates it. */
export const effectiveStatus = (p: SponsorPayment, today: string) =>
  p.status !== "received" && p.status !== "disputed" && p.due_date && p.due_date < today ? "overdue" : p.status;

export function Deals({ event, sponsors, crm, today }: { event: EventRow; sponsors: Sponsor[]; crm: Crm; today: string }) {
  const deals = sponsors.filter((s) => ["contacted", "replied", "confirmed"].includes(s.status));
  const [openId, setOpenId] = useState<string | null>(null);
  if (!crm)
    return (
      <Card title="Deals, payments & deliverables" sub="Deal terms, payment milestones, a fulfilment checklist, proposal and partner-report PDFs">
        <p className="text-[13px] text-d-ink2">These need the database update — see <code className="font-mono text-[12px]">supabase/migrations/002_OWNER_PROMPT.md</code>.</p>
      </Card>
    );
  const pay = crm.payments;
  const committed = pay.reduce((s, p) => s + p.amount, 0);
  const received = pay.reduce((s, p) => s + p.received_amount, 0);
  const overdue = pay.filter((p) => effectiveStatus(p, today) === "overdue").length;
  const open = deals.find((d) => d.id === openId) ?? null;

  return (
    <Card title="Deals, payments & deliverables" sub={`Received ${inr(received)} of ${inr(committed)} in milestones${overdue ? ` · ${overdue} overdue` : ""}. Payment reliability comes only from what you record here.`}>
      {committed > 0 && (
        <div className="mb-4 h-2 overflow-hidden rounded-full bg-white/[0.06]">
          <motion.div className="h-full rounded-full bg-good" initial={{ width: 0 }} animate={{ width: `${(received / committed) * 100}%` }} transition={{ duration: 0.8, ease }} />
        </div>
      )}
      {deals.length ? (
        <div className="grid gap-3 lg:grid-cols-[240px_1fr]">
          <ul className="flex gap-1.5 overflow-x-auto lg:flex-col lg:overflow-visible">
            {deals.map((d) => {
              const mine = pay.filter((p) => p.sponsor_id === d.id);
              const late = mine.some((p) => effectiveStatus(p, today) === "overdue");
              const dels = crm.deliverables.filter((x) => x.sponsor_id === d.id);
              return (
                <li key={d.id}>
                  <button onClick={() => setOpenId(openId === d.id ? null : d.id)} className={`w-full min-w-[190px] rounded-xl border px-3 py-2.5 text-left transition-colors ${d.id === openId ? "border-s1/50 bg-s1/10" : "border-d-line hover:border-white/20"}`}>
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-[13.5px] font-medium">{d.company}</span>
                      {late && <span className="size-2 shrink-0 rounded-full bg-crit" title="Overdue payment" />}
                    </span>
                    <span className="block text-[11.5px] text-d-ink3 capitalize">{d.status} · {dels.filter((x) => x.done).length}/{dels.length} delivered</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <AnimatePresence mode="wait">
            {open ? (
              <motion.div key={open.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25, ease }}>
                <DealPanel event={event} s={open} payments={pay.filter((p) => p.sponsor_id === open.id)} deliverables={crm.deliverables.filter((x) => x.sponsor_id === open.id)} today={today} />
              </motion.div>
            ) : (
              <Empty>Pick a sponsor to record terms, payments and what you&apos;ve delivered.</Empty>
            )}
          </AnimatePresence>
        </div>
      ) : (
        <Empty>Deals appear here once a pitch has been sent.</Empty>
      )}
    </Card>
  );
}

function DealPanel({ event, s, payments, deliverables, today }: { event: EventRow; s: Sponsor; payments: SponsorPayment[]; deliverables: Deliverable[]; today: string }) {
  const tier = event.plan?.tiers?.find((t) => t.name === s.tier);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-d-line bg-black/20 px-4 py-3">
        <div>
          <div className="text-[15px] font-semibold">{s.company}</div>
          <div className="text-[12px] text-d-ink3">{s.tier ?? "No tier"}{tier?.amount ? ` · ${inr(tier.amount)} package` : ""}{s.proposal_sent_at ? ` · proposal sent ${new Date(s.proposal_sent_at).toLocaleDateString("en-IN")}` : ""}</div>
        </div>
        <Docs eventId={event.id} s={s} />
      </div>
      <Terms eventId={event.id} s={s} />
      <Payments eventId={event.id} s={s} payments={payments} today={today} suggested={s.value ?? tier?.amount ?? 0} />
      <Checklist eventId={event.id} s={s} items={deliverables} />
    </div>
  );
}

function Docs({ eventId, s }: { eventId: string; s: Sponsor }) {
  const [pending, run] = useRun();
  const a = "inline-flex h-8 items-center rounded-lg border border-d-line bg-white/[0.03] px-3 text-[12.5px] font-medium transition-colors hover:bg-white/[0.07]";
  return (
    <div className="flex flex-wrap gap-2">
      <a href={`/api/proposal/${s.id}`} target="_blank" className={a}>Proposal PDF</a>
      {!s.proposal_sent_at && <Button variant="ghost" pending={pending} onClick={() => run(() => act.markProposalSent(eventId, s.id))} className="h-8">Mark proposal sent</Button>}
      <a href={`/api/roi/${s.id}`} target="_blank" className={a}>Partner report PDF</a>
    </div>
  );
}

function Terms({ eventId, s }: { eventId: string; s: Sponsor }) {
  const [value, setValue] = useState(s.value ?? null);
  const [type, setType] = useState(s.contribution_type ?? "");
  const [terms, setTerms] = useState<Record<string, string>>(s.terms ?? {});
  const [pending, run] = useRun();
  return (
    <details className="group rounded-xl border border-d-line bg-black/20 p-4" open={!Object.keys(s.terms ?? {}).length}>
      <summary className="cursor-pointer list-none text-[13px] font-medium">Deal terms <span className="font-normal text-d-ink3">· {Object.keys(s.terms ?? {}).length} recorded</span></summary>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="text-[12px] text-d-ink2">Actual value (₹)<input type="number" min={0} step={1000} value={value ?? ""} onChange={(e) => setValue(e.target.value === "" ? null : Number(e.target.value))} className={`${field} mt-1`} /></label>
        <label className="text-[12px] text-d-ink2">Contribution type
          <select value={type} onChange={(e) => setType(e.target.value)} className={`${field} mt-1 capitalize`}>
            <option value="" className="bg-d-raise">—</option>
            {CONTRIBUTIONS.map((c) => <option key={c} value={c} className="bg-d-raise">{c}</option>)}
          </select>
        </label>
        {TERMS.map(([k, label, ph]) => (
          <label key={k} className="text-[12px] text-d-ink2">{label}<input value={terms[k] ?? ""} onChange={(e) => setTerms({ ...terms, [k]: e.target.value })} placeholder={ph} className={`${field} mt-1`} /></label>
        ))}
      </div>
      <div className="mt-3 flex justify-end"><Button pending={pending} onClick={() => run(() => act.saveDeal(eventId, s.id, { value, contribution_type: type || null, terms }))}>Save terms</Button></div>
    </details>
  );
}

function Payments({ eventId, s, payments, today, suggested }: { eventId: string; s: Sponsor; payments: SponsorPayment[]; today: string; suggested: number }) {
  const [form, setForm] = useState({ label: "", amount: "", due_date: "" });
  const [pending, run] = useRun();
  return (
    <div className="rounded-xl border border-d-line bg-black/20 p-4">
      <div className="text-[13px] font-medium">Payment milestones</div>
      {payments.length ? (
        <ul className="mt-2 divide-y divide-d-line">
          {payments.map((p) => <PaymentRow key={p.id} eventId={eventId} p={p} today={today} />)}
        </ul>
      ) : (
        <p className="mt-1 text-[12.5px] text-d-ink3">No milestones yet.{suggested ? ` Package value is ${inr(suggested)}.` : ""}</p>
      )}
      <form className="mt-3 grid gap-2 sm:grid-cols-[1.4fr_1fr_1fr_auto]" onSubmit={(e) => (e.preventDefault(), run(() => act.addPayment(eventId, s.id, { label: form.label, amount: Number(form.amount), due_date: form.due_date }), () => setForm({ label: "", amount: "", due_date: "" })))}>
        <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. 50% on signing" aria-label="Milestone" className={field} />
        <input type="number" min={1} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder={suggested ? `₹, e.g. ${Math.round(suggested / 2)}` : "₹ amount"} aria-label="Amount" className={field} />
        <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} aria-label="Due date" className={`${field} [color-scheme:dark]`} />
        <Button pending={pending} disabled={!form.label || !form.amount}>Add</Button>
      </form>
    </div>
  );
}

function PaymentRow({ eventId, p, today }: { eventId: string; p: SponsorPayment; today: string }) {
  const [pending, run] = useRun();
  const [partial, setPartial] = useState<string | null>(null);
  const st = effectiveStatus(p, today);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2 text-[12.5px]">
      <span className="min-w-0 flex-1"><span className="text-d-ink">{p.label}</span> <span className="text-d-ink3">· {inr(p.amount)}{p.due_date ? ` · due ${p.due_date}` : ""}</span></span>
      <span className={`rounded-full px-2 py-0.5 text-[11px] ${STATUS_STYLE[st]}`}>{nice(st)}{p.received_amount && p.received_amount < p.amount ? ` · ${inr(p.received_amount)}` : ""}</span>
      {partial != null ? (
        <span className="flex items-center gap-1.5">
          <input autoFocus type="number" min={1} max={p.amount - 1} value={partial} onChange={(e) => setPartial(e.target.value)} placeholder="₹ received" aria-label="Amount received" className="h-8 w-28 rounded-lg border border-d-line bg-black/30 px-2 text-[12px] outline-none focus:border-white/25" />
          <Button pending={pending} onClick={() => run(() => act.updatePayment(eventId, p.id, "partially_received", Number(partial)), () => setPartial(null))} className="h-8">Save</Button>
          <button onClick={() => setPartial(null)} className="text-[11.5px] text-d-ink3">Cancel</button>
        </span>
      ) : (
        <select
          aria-label={`Status of ${p.label}`}
          disabled={pending}
          value={p.status}
          onChange={(e) => (e.target.value === "partially_received" ? setPartial(String(p.received_amount || "")) : run(() => act.updatePayment(eventId, p.id, e.target.value, 0)))}
          className="h-8 rounded-lg border border-d-line bg-black/30 px-2 text-[12px]"
        >
          {PAYMENT_STATUSES.map((x) => <option key={x} value={x} className="bg-d-raise">{nice(x)}</option>)}
        </select>
      )}
      <button disabled={pending} onClick={() => run(() => act.deletePayment(eventId, p.id))} className="text-[11.5px] text-d-ink3 hover:text-crit">Remove</button>
    </li>
  );
}

function Checklist({ eventId, s, items }: { eventId: string; s: Sponsor; items: Deliverable[] }) {
  const [pending, run] = useRun();
  const [item, setItem] = useState("");
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  return (
    <div className="rounded-xl border border-d-line bg-black/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] font-medium">Fulfilment checklist <span className="font-normal text-d-ink3">· {items.filter((i) => i.done).length}/{items.length}</span></span>
        <button disabled={pending} onClick={() => run(() => act.generateDeliverables(eventId, s.id))} className="text-[12px] text-s1 hover:brightness-125">Fill from tier perks</button>
      </div>
      {items.length ? (
        <ul className="mt-2 divide-y divide-d-line">
          {items.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 py-2 text-[12.5px]">
              <input type="checkbox" checked={d.done} disabled={pending} onChange={(e) => run(() => act.setDeliverable(eventId, d.id, e.target.checked, evidence[d.id] ?? d.evidence_url ?? ""))} aria-label={`Delivered: ${d.item}`} className="size-4 accent-[#0aac23]" />
              <span className={`min-w-0 flex-1 ${d.done ? "text-d-ink2 line-through decoration-white/20" : "text-d-ink"}`}>{d.item}</span>
              {d.evidence_url ? (
                <a href={d.evidence_url} target="_blank" rel="noreferrer" className="text-[11.5px] text-s1 hover:brightness-125">evidence ↗</a>
              ) : (
                <input value={evidence[d.id] ?? ""} onChange={(e) => setEvidence({ ...evidence, [d.id]: e.target.value })} placeholder="evidence link (photo/post)" aria-label="Evidence link" className="h-7 w-48 rounded-md border border-d-line bg-black/30 px-2 text-[11.5px] outline-none focus:border-white/25" />
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[12.5px] text-d-ink3">Nothing promised yet — fill it from the tier perks or add items.</p>
      )}
      <form className="mt-2 flex gap-2" onSubmit={(e) => (e.preventDefault(), run(() => act.addDeliverable(eventId, s.id, item), () => setItem("")))}>
        <input value={item} onChange={(e) => setItem(e.target.value)} placeholder="Add a promised deliverable" aria-label="Deliverable" className={field} />
        <Button variant="ghost" pending={pending} disabled={!item.trim()}>Add</Button>
      </form>
    </div>
  );
}

/** Event numbers for partner reports: social reach, challenge participation, photo links. Works without migration 002. */
export function Metrics({ event }: { event: EventRow }) {
  const m = event.plan?.metrics;
  const [f, setF] = useState({ social_reach: m?.social_reach?.toString() ?? "", challenge_participants: m?.challenge_participants?.toString() ?? "", photos: (m?.photos ?? []).join("\n") });
  const [pending, run] = useRun();
  return (
    <Card title="Numbers for partner reports" sub="Recorded by you — reports only show what's entered here, never estimates">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-[12px] text-d-ink2">Social reach (people)<input type="number" min={0} value={f.social_reach} onChange={(e) => setF({ ...f, social_reach: e.target.value })} className={`${field} mt-1`} /></label>
        <label className="text-[12px] text-d-ink2">Challenge / workshop participants<input type="number" min={0} value={f.challenge_participants} onChange={(e) => setF({ ...f, challenge_participants: e.target.value })} className={`${field} mt-1`} /></label>
        <label className="text-[12px] text-d-ink2 sm:col-span-2">Photo links (one per line)<textarea rows={3} value={f.photos} onChange={(e) => setF({ ...f, photos: e.target.value })} className={`${field} mt-1 h-auto py-2`} /></label>
      </div>
      <div className="mt-3 flex justify-end"><Button pending={pending} onClick={() => run(() => act.saveMetrics(event.id, f))}>Save numbers</Button></div>
    </Card>
  );
}
