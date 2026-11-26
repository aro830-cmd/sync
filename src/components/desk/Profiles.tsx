"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import * as act from "@/app/actions";
import type { MissionRole, Reward, VolunteerProfile } from "@/lib/types";
import { Button, Card, Empty, ToastProvider, ease, useToast } from "./ui";

export type FeedbackRow = { id: string; profile_id: string; event: string | null; kind: string; note: string | null; corrected: boolean; visible_to_volunteer: boolean; created_at: string };
export type RewardRow = Reward & { name: string; event: string | null };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const slotText = (s: VolunteerProfile["availability"][number]) => `${s.date ? new Date(s.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : DAYS[s.weekday ?? 0]} ${s.from}–${s.to}`;
const nice = (s: string) => s.replace(/_/g, " ");

function useRun() {
  const notify = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const r = await fn();
      notify(r.ok, r.message);
      if (r.ok) router.refresh();
    });
  return [pending, run] as const;
}

export function Profiles(props: { profiles: VolunteerProfile[]; roles: MissionRole[]; feedback: FeedbackRow[]; rewards: RewardRow[]; completed: Record<string, number> }) {
  return (
    <ToastProvider>
      <Board {...props} />
    </ToastProvider>
  );
}

function Board({ profiles, roles, feedback, rewards, completed }: { profiles: VolunteerProfile[]; roles: MissionRole[]; feedback: FeedbackRow[]; rewards: RewardRow[]; completed: Record<string, number> }) {
  const [role, setRole] = useState<MissionRole | null>(null);
  const opted = profiles.filter((p) => p.opted_in);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Opted in", opted.length, `${profiles.length - opted.length} opted out`],
          ["Available now", opted.filter((p) => p.available).length, "can be suggested"],
          ["Roles completed", Object.values(completed).reduce((s, n) => s + n, 0), "across all events"],
          ["Rewards owed", rewards.filter((r) => r.status === "promised").length, `${rewards.filter((r) => r.status === "delivered").length} delivered`],
        ].map(([l, v, h]) => (
          <div key={l as string} className="rounded-2xl border border-d-line bg-d-panel p-5">
            <div className="text-[12.5px] text-d-ink2">{l}</div>
            <div className="mt-3 text-[30px] leading-none font-semibold tabular-nums">{v}</div>
            <div className="mt-2 text-[12px] text-d-ink3">{h}</div>
          </div>
        ))}
      </div>

      <Card title="Mission roles" sub="Clear jobs with hours, skills, what you learn, who supervises, the reward and who to escalate to" className="mt-3">
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {roles.map((r) => (
            <li key={r.key}>
              <button onClick={() => setRole(role?.key === r.key ? null : r)} className={`w-full rounded-xl border p-3.5 text-left transition-colors ${role?.key === r.key ? "border-s1/50 bg-s1/10" : "border-d-line bg-black/20 hover:border-white/20"}`}>
                <span className="block text-[14px] font-medium">{r.name}</span>
                <span className="mt-0.5 block text-[12px] text-d-ink3">{r.expected_hours}h · {r.skills.join(", ")} · {r.reward}</span>
              </button>
            </li>
          ))}
        </ul>
        <AnimatePresence>
          {role && (
            <motion.dl initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease }} className="mt-3 grid gap-3 overflow-hidden rounded-xl border border-d-line bg-black/20 p-4 text-[13px] sm:grid-cols-2">
              {([["Responsibilities", role.responsibilities], ["Learning outcomes", role.learning_outcomes], ["Supervisor", role.supervisor], ["Reward", role.reward], ["Escalation path", role.escalation], ["Expected time", `${role.expected_hours} hours on the day`]] as const).map(([k, v]) => (
                <div key={k}><dt className="text-[11px] tracking-[0.08em] text-d-ink3 uppercase">{k}</dt><dd className="mt-0.5 text-d-ink2">{v}</dd></div>
              ))}
            </motion.dl>
          )}
        </AnimatePresence>
      </Card>

      <h2 className="mt-8 mb-3 text-[15px] font-medium">Volunteer profiles <span className="font-normal text-d-ink3">· opt-in, filled in by each volunteer from the student portal</span></h2>
      {profiles.length ? (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {profiles.map((p) => <ProfileCard key={p.id} p={p} roles={roles} feedback={feedback.filter((f) => f.profile_id === p.id)} completed={completed[p.id] ?? 0} />)}
        </ul>
      ) : (
        <Empty>No volunteer profiles yet. Students create theirs at Student portal → Volunteer.</Empty>
      )}

      <Rewards rewards={rewards} />
    </>
  );
}

function ProfileCard({ p, roles, feedback, completed }: { p: VolunteerProfile; roles: MissionRole[]; feedback: FeedbackRow[]; completed: number }) {
  const [open, setOpen] = useState(false);
  const [pending, run] = useRun();
  const counts = (k: string) => feedback.filter((f) => f.kind === k && !f.corrected).length;
  return (
    <li className={`rounded-2xl border border-d-line bg-d-panel p-4 ${p.opted_in ? "" : "opacity-55"}`}>
      <div className="flex items-start gap-3">
        <span className="relative grid size-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-s1/30 to-s1/5 text-[13px] font-semibold">
          {p.name.split(" ").map((x) => x[0]).slice(0, 2).join("")}
          <span className={`absolute -right-0.5 -bottom-0.5 size-3 rounded-full ring-2 ring-d-panel ${p.opted_in && p.available ? "bg-good" : "bg-white/25"}`} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14.5px] font-medium">{p.name}</div>
          <div className="truncate text-[12px] text-d-ink3">{p.email}</div>
        </div>
        <span className="text-[11px] text-d-ink3">{!p.opted_in ? "Opted out" : p.available ? "Available" : "Away"}</span>
      </div>

      <div className="mt-3 space-y-1.5 text-[12px]">
        {!!p.preferred_roles.length && <div><span className="text-d-ink3">Wants · </span><span className="text-s1">{p.preferred_roles.map((k) => roles.find((r) => r.key === k)?.name ?? nice(k)).join(", ")}</span></div>}
        {!!p.skills.length && <div><span className="text-d-ink3">Skills · </span><span className="text-d-ink2">{p.skills.join(", ")}</span></div>}
        <div><span className="text-d-ink3">Availability · </span><span className="text-d-ink2">{p.availability.length ? p.availability.map(slotText).join(", ") : "not set"}</span></div>
        {p.learning_goals && <div><span className="text-d-ink3">Goal · </span><span className="text-d-ink2">{p.learning_goals}</span></div>}
        {!!p.languages.length && <div><span className="text-d-ink3">Languages · </span><span className="text-d-ink2">{p.languages.join(", ")}</span></div>}
        {!!p.reward_prefs.length && <div><span className="text-d-ink3">Rewards · </span><span className="text-d-ink2">{p.reward_prefs.map(nice).join(", ")}</span></div>}
        {p.accessibility_needs && <div><span className="text-d-ink3">Access needs · </span><span className="text-d-ink2">{p.accessibility_needs}</span></div>}
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2 border-t border-d-line pt-3 text-center text-[11px]">
        {[["Done", completed], ["Kudos", counts("kudos")], ["Late", counts("late")], ["No-show", counts("no_show")]].map(([l, n]) => (
          <div key={l as string}><div className="text-[15px] font-medium tabular-nums">{n}</div><div className="text-d-ink3">{l}</div></div>
        ))}
      </div>
      {!!feedback.length && (
        <>
          <button onClick={() => setOpen((o) => !o)} className="mt-2 text-[11.5px] text-d-ink3 hover:text-d-ink">{open ? "Hide" : "Show"} feedback ({feedback.length})</button>
          {open && (
            <ul className="mt-1.5 space-y-1">
              {feedback.map((f) => (
                <li key={f.id} className={`flex items-center gap-2 text-[11.5px] ${f.corrected ? "text-d-ink3 line-through" : "text-d-ink2"}`}>
                  <span className="min-w-0 flex-1 truncate capitalize">{nice(f.kind)}{f.event ? ` · ${f.event}` : ""}{f.note ? ` — ${f.note}` : ""}</span>
                  <button disabled={pending} onClick={() => run(() => act.correctFeedback(f.id, !f.corrected))} className="shrink-0 text-s1 no-underline hover:brightness-125">{f.corrected ? "Restore" : "Correct"}</button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </li>
  );
}

function Rewards({ rewards }: { rewards: RewardRow[] }) {
  const [pending, run] = useRun();
  return (
    <Card title="Reward tracker" sub="Certificates, meals, merch, reimbursements, letters, mentor sessions and priority access owed to volunteers" className="mt-3">
      {rewards.length ? (
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[560px] text-left text-[12.5px]">
            <thead className="text-[11px] tracking-[0.08em] text-d-ink3 uppercase"><tr className="border-b border-d-line"><th className="py-2 font-medium">Volunteer</th><th className="py-2 font-medium">Reward</th><th className="py-2 font-medium">Event</th><th className="py-2 text-right font-medium">Status</th></tr></thead>
            <tbody className="divide-y divide-d-line">
              {rewards.map((r) => (
                <tr key={r.id}>
                  <td className="py-2.5">{r.name}</td>
                  <td className="py-2.5 capitalize text-d-ink2">{nice(r.kind)}</td>
                  <td className="py-2.5 text-d-ink3">{r.event ?? "—"}</td>
                  <td className="py-2.5 text-right">
                    <Button variant={r.status === "delivered" ? "ghost" : "solid"} className="h-7" pending={pending} onClick={() => run(() => act.setRewardDelivered(r.id, r.status !== "delivered"))}>
                      {r.status === "delivered" ? "Delivered ✓" : "Mark delivered"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>Rewards appear when a volunteer completes a mission role.</Empty>
      )}
    </Card>
  );
}
