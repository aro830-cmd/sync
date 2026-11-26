"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import * as act from "@/app/actions";
import { ROLE_WINDOWS } from "@/lib/match";
import type { EventRow, RoleRequest } from "@/lib/types";
import type { Crm } from "./Deals";
import { Button, Card, Empty, ease, useToast } from "./ui";

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

/** Two-step button for anything that sends email or can't be undone: first click asks, second click does it. */
export function ConfirmButton({ children, confirm, onConfirm, pending, disabled, variant = "accent" }: { children: ReactNode; confirm: string; onConfirm: () => void; pending?: boolean; disabled?: boolean; variant?: "accent" | "ghost" | "solid" }) {
  const [ask, setAsk] = useState(false);
  return ask ? (
    <span className="inline-flex flex-wrap items-center gap-2 rounded-lg border border-s1/40 bg-s1/10 py-1 pr-1 pl-3 text-[12.5px]">
      {confirm}
      <Button variant="ghost" onClick={() => setAsk(false)} className="h-7">Cancel</Button>
      <Button variant="accent" pending={pending} onClick={() => (onConfirm(), setAsk(false))} className="h-7">Yes, do it</Button>
    </span>
  ) : (
    <Button variant={variant} pending={pending} disabled={disabled} onClick={() => setAsk(true)}>{children}</Button>
  );
}

const STATUS: Record<RoleRequest["status"], string> = {
  suggested: "bg-s2/15 text-s2",
  requested: "bg-s4/15 text-s4",
  accepted: "bg-good/15 text-good",
  declined: "bg-crit/15 text-crit",
  completed: "bg-white/[0.08] text-d-ink",
};

/** Mission roles for this event: explainable suggestions, requests, volunteer answers, completion and feedback. */
export function MissionRoles({ event, crm }: { event: EventRow; crm: NonNullable<Crm> }) {
  const [pending, run] = useRun();
  const [open, setOpen] = useState<string | null>(null);
  const name = (id: string) => crm.profiles.find((p) => p.id === id)?.name ?? "Someone";
  const filled = crm.requests.filter((r) => r.status === "accepted" || r.status === "completed").length;
  return (
    <Card
      title={`Mission roles · ${filled}/${crm.roles.length} filled`}
      sub="Suggestions use only what volunteers told us — skills, chosen roles, availability, goals — and spread unpopular shifts fairly. Every suggestion says why."
      action={<Button pending={pending} onClick={() => run(() => act.suggestRoles(event.id))}>Suggest volunteers</Button>}
    >
      <ul className="divide-y divide-d-line">
        {crm.roles.map((role) => {
          const reqs = crm.requests.filter((r) => r.role_key === role.key && r.status !== "declined");
          const declined = crm.requests.filter((r) => r.role_key === role.key && r.status === "declined");
          const w = ROLE_WINDOWS[role.key];
          return (
            <li key={role.key} className="py-3">
              <div className="flex flex-wrap items-start gap-3">
                <button onClick={() => setOpen(open === role.key ? null : role.key)} className="min-w-0 flex-1 text-left" aria-expanded={open === role.key}>
                  <span className="block text-[14px] font-medium">{role.name}</span>
                  <span className="block text-[12px] text-d-ink3">{w ? `${w[0]}–${w[1]} · ` : ""}{role.expected_hours}h · {role.skills.join(", ")} · reward: {role.reward}</span>
                </button>
                {!reqs.length && <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-d-ink3">Open</span>}
              </div>
              <AnimatePresence initial={false}>
                {open === role.key && (
                  <motion.dl initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease }} className="mt-2 grid gap-x-6 gap-y-1 overflow-hidden rounded-lg bg-black/20 p-3 text-[12px] sm:grid-cols-2">
                    {([["Responsibilities", role.responsibilities], ["You'll learn", role.learning_outcomes], ["Supervisor", role.supervisor], ["If something goes wrong", role.escalation]] as const).map(([k, v]) => (
                      <div key={k}><dt className="text-d-ink3">{k}</dt><dd className="text-d-ink2">{v}</dd></div>
                    ))}
                  </motion.dl>
                )}
              </AnimatePresence>
              {reqs.map((r) => (
                <div key={r.id} className="mt-2 rounded-lg border border-d-line bg-black/20 p-3">
                  <div className="flex flex-wrap items-center gap-2 text-[13px]">
                    <span className="font-medium">{name(r.profile_id)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10.5px] capitalize ${STATUS[r.status]}`}>{r.status === "requested" && r.reason?.startsWith("Applied by") ? "applied" : r.status}</span>
                    {r.overridden && <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10.5px] text-d-ink2">organiser override</span>}
                    <span className="ml-auto flex flex-wrap gap-1.5">
                      {r.status === "suggested" && <Button variant="ghost" className="h-7" pending={pending} onClick={() => run(() => act.setRoleStatus(event.id, r.id, "requested"))}>Send request</Button>}
                      {r.status === "requested" && r.reason?.startsWith("Applied by") && (
                        <>
                          <Button variant="ghost" className="h-7" pending={pending} onClick={() => run(() => act.setRoleStatus(event.id, r.id, "accepted"))}>Accept application</Button>
                          <Button variant="ghost" className="h-7" pending={pending} onClick={() => run(() => act.setRoleStatus(event.id, r.id, "declined"))}>Decline</Button>
                        </>
                      )}
                      {r.status === "accepted" && <Button variant="ghost" className="h-7" pending={pending} onClick={() => run(() => act.setRoleStatus(event.id, r.id, "completed"))}>Mark completed</Button>}
                      {r.status === "completed" &&
                        ([["kudos", "Kudos"], ["late", "Late"], ["no_show", "No-show"]] as const).map(([k, l]) => (
                          <button key={k} disabled={pending} onClick={() => run(() => act.addFeedback(event.id, r.profile_id, k, "", true))} className="h-7 rounded-lg border border-d-line px-2 text-[11.5px] text-d-ink2 hover:text-d-ink">{l}</button>
                        ))}
                      {(r.status === "suggested" || r.status === "requested") && (
                        <select aria-label="Pick someone else" defaultValue="" disabled={pending} onChange={(e) => e.target.value && run(() => act.overrideRole(event.id, r.id, e.target.value))} className="h-7 rounded-lg border border-d-line bg-black/30 px-2 text-[11.5px]">
                          <option value="" className="bg-d-raise">Pick someone else…</option>
                          {crm.profiles.filter((p) => p.opted_in && p.id !== r.profile_id).map((p) => <option key={p.id} value={p.id} className="bg-d-raise">{p.name}</option>)}
                        </select>
                      )}
                      {r.status !== "completed" && <button disabled={pending} onClick={() => run(() => act.removeRoleRequest(event.id, r.id))} aria-label="Remove" className="px-1 text-[12px] text-d-ink3 hover:text-crit">✕</button>}
                    </span>
                  </div>
                  {r.reason && <p className="mt-1.5 text-[12px] text-d-ink2">{r.reason}</p>}
                </div>
              ))}
              {!!declined.length && <p className="mt-1 text-[11.5px] text-d-ink3">Declined: {declined.map((d) => name(d.profile_id)).join(", ")} — they won&apos;t be suggested again for this role.</p>}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function Incidents({ event, crm }: { event: EventRow; crm: NonNullable<Crm> }) {
  const [pending, run] = useRun();
  const [f, setF] = useState({ title: "", severity: "medium", note: "" });
  const open = crm.incidents.filter((i) => i.status === "open");
  const sev = { high: "bg-crit/15 text-crit", medium: "bg-s4/15 text-s4", low: "bg-white/[0.06] text-d-ink2" };
  return (
    <Card title={`Incidents · ${open.length} open`} sub="Anything that went wrong or needs follow-up on the day">
      {crm.incidents.length ? (
        <ul className="mb-3 divide-y divide-d-line">
          {crm.incidents.map((i) => (
            <li key={i.id} className={`flex flex-wrap items-center gap-2 py-2 text-[12.5px] ${i.status === "resolved" ? "opacity-50" : ""}`}>
              <span className={`rounded-full px-2 py-0.5 text-[10.5px] capitalize ${sev[i.severity]}`}>{i.severity}</span>
              <span className="min-w-0 flex-1"><span className="text-d-ink">{i.title}</span>{i.note && <span className="text-d-ink3"> — {i.note}</span>}</span>
              {i.status === "open" ? <Button variant="ghost" className="h-7" pending={pending} onClick={() => run(() => act.resolveIncident(event.id, i.id))}>Resolve</Button> : <span className="text-[11px] text-d-ink3">resolved</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 text-[12.5px] text-d-ink3">Nothing logged.</p>
      )}
      <form className="grid gap-2 sm:grid-cols-[1.5fr_auto_1.5fr_auto]" onSubmit={(e) => (e.preventDefault(), run(() => act.addIncident(event.id, f.title, f.severity, f.note), () => setF({ title: "", severity: "medium", note: "" })))}>
        <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="What happened" aria-label="Incident" className="h-9 rounded-lg border border-d-line bg-black/30 px-3 text-[13px] outline-none focus:border-white/25" />
        <select value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value })} aria-label="Severity" className="h-9 rounded-lg border border-d-line bg-black/30 px-2 text-[13px]">
          {["low", "medium", "high"].map((s) => <option key={s} className="bg-d-raise">{s}</option>)}
        </select>
        <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Note (optional)" aria-label="Note" className="h-9 rounded-lg border border-d-line bg-black/30 px-3 text-[13px] outline-none focus:border-white/25" />
        <Button pending={pending} disabled={!f.title.trim()}>Log</Button>
      </form>
    </Card>
  );
}

export function AuditTrail({ crm }: { crm: NonNullable<Crm> }) {
  const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <Card title="Audit trail" sub="Sponsor status changes, outreach, payments, role assignments and rewards — newest first">
      {crm.audit.length ? (
        <ul className="max-h-[280px] divide-y divide-d-line overflow-y-auto pr-1">
          {crm.audit.map((a) => (
            <li key={a.id} className="flex gap-3 py-2 text-[12.5px]">
              <span className="w-28 shrink-0 tabular-nums text-d-ink3">{when(a.created_at)}</span>
              <span className="min-w-0 flex-1">
                <span className="text-d-ink">{a.entity.replace(/_/g, " ")} · {a.action.replace(/_/g, " ")}</span>
                {Object.keys(a.detail ?? {}).length > 0 && <span className="block truncate text-d-ink3">{Object.entries(a.detail).filter(([, v]) => v != null && typeof v !== "object").map(([k, v]) => `${k}: ${v}`).join(" · ")}</span>}
              </span>
              <span className="text-[11px] text-d-ink3">{a.actor}</span>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>Organiser actions on this event will be listed here.</Empty>
      )}
    </Card>
  );
}
