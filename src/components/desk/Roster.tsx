"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState, useTransition } from "react";
import * as act from "@/app/actions";
import { ROLES, roleOf } from "@/lib/roster";
import { Button, Card, Empty, ToastProvider, ease, useToast } from "./ui";

export type Member = { id: string; name: string; email: string; skills: string[]; available: boolean; events: number; hours: number; last: string | null };

export function Roster({ members }: { members: Member[] }) {
  return (
    <ToastProvider>
      <Board members={members} />
    </ToastProvider>
  );
}

function useRun() {
  const notify = useToast();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      notify(r.ok, r.message);
      if (r.ok) after?.();
    });
  return [pending, run] as const;
}

function Board({ members }: { members: Member[] }) {
  const [filter, setFilter] = useState<"all" | "available" | string>("all");
  const [pending, run] = useRun();
  const shown = members.filter((m) => (filter === "all" ? true : filter === "available" ? m.available : m.skills.includes(filter)));

  return (
    <>
      <AddMember />
      <div className="mt-6 mb-3 flex flex-wrap items-center gap-1.5">
        {[["all", `All ${members.length}`], ["available", `Available ${members.filter((m) => m.available).length}`], ...ROLES.map((r) => [r.skill, r.role])].map(([k, l]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`h-8 rounded-full border px-3 text-[12.5px] transition-colors ${filter === k ? "border-s1/50 bg-s1/15 text-d-ink" : "border-d-line text-d-ink3 hover:text-d-ink2"}`}
          >
            {l}
          </button>
        ))}
        <button disabled={pending} onClick={() => run(() => act.addDemoMembers())} className="ml-auto text-[12.5px] text-s1 hover:brightness-125 disabled:opacity-40">
          + Add demo members
        </button>
      </div>

      {shown.length ? (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence initial={false}>
            {shown.map((m, i) => <MemberCard key={m.id} m={m} i={i} />)}
          </AnimatePresence>
        </ul>
      ) : (
        <Empty>{members.length ? "No one matches that filter." : "No club members yet — add your volunteers above, or load the demo members."}</Empty>
      )}
    </>
  );
}

function MemberCard({ m, i }: { m: Member; i: number }) {
  const [pending, run] = useRun();
  const toggle = (skill: string) => run(() => act.setMemberSkills(m.id, m.skills.includes(skill) ? m.skills.filter((s) => s !== skill) : [...m.skills, skill]));
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.35, ease, delay: Math.min(i, 8) * 0.03 }}
      className={`rounded-2xl border bg-d-panel p-4 transition-colors ${m.available ? "border-d-line" : "border-d-line opacity-60"}`}
    >
      <div className="flex items-start gap-3">
        <span className="relative grid size-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-s1/30 to-s1/5 text-[13px] font-semibold">
          {m.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
          <span className={`absolute -right-0.5 -bottom-0.5 size-3 rounded-full ring-2 ring-d-panel ${m.available ? "bg-good" : "bg-white/25"}`} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14.5px] font-medium">{m.name}</div>
          <div className="truncate text-[12px] text-d-ink3">{m.email}</div>
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-2 text-[11.5px] text-d-ink3">
          {m.available ? "Available" : "Away"}
          <input
            type="checkbox"
            role="switch"
            checked={m.available}
            disabled={pending}
            onChange={(e) => run(() => act.setMemberAvailable(m.id, e.target.checked))}
            className="peer sr-only"
          />
          <span className="relative h-5 w-9 rounded-full bg-white/10 transition-colors peer-checked:bg-good after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-s1" />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {ROLES.map((r) => {
          const on = m.skills.includes(r.skill);
          return (
            <button
              key={r.skill}
              disabled={pending}
              onClick={() => toggle(r.skill)}
              aria-pressed={on}
              title={on ? `Remove ${r.role}` : `Add ${r.role}`}
              className={`rounded-full px-2 py-0.5 text-[11px] transition-colors ${on ? "bg-s1/15 text-s1" : "text-d-ink3/60 hover:text-d-ink2"}`}
            >
              {on ? r.role : `+ ${r.role}`}
            </button>
          );
        })}
        {m.skills.filter((s) => !ROLES.some((r) => r.skill === s)).map((s) => (
          <span key={s} className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-d-ink2">{roleOf(s)}</span>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 border-t border-d-line pt-3 text-[12px]">
        <div><div className="text-[15px] font-medium tabular-nums">{m.events}</div><div className="text-d-ink3">events</div></div>
        <div><div className="text-[15px] font-medium tabular-nums">{m.hours.toFixed(1)}</div><div className="text-d-ink3">hours</div></div>
        <div className="flex items-end justify-end">
          <button disabled={pending} onClick={() => run(() => act.removeMember(m.id))} className="text-[11.5px] text-d-ink3 hover:text-crit">Remove</button>
        </div>
      </div>
      {m.last && <div className="mt-1 truncate text-[11px] text-d-ink3">Latest event: {m.last}</div>}
    </motion.li>
  );
}

function AddMember() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [pending, run] = useRun();
  const field = "h-10 min-w-0 rounded-lg border border-d-line bg-black/30 px-3 text-[13.5px] text-d-ink outline-none transition-colors placeholder:text-d-ink3 focus:border-white/25";
  return (
    <Card title="Add a club member" sub="Members marked available are picked by the Logistics agent and given a role">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => (e.preventDefault(), run(() => act.addMember(name, email, skills), () => (setName(""), setEmail(""), setSkills([]))))}
      >
        <div className="grid gap-2 sm:grid-cols-[1fr_1.2fr_auto]">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="Name" className={field} />
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="college email" aria-label="Email" className={field} />
          <Button pending={pending} disabled={!name || !email}>Add member</Button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[12px] text-d-ink3">Roles they like:</span>
          {ROLES.map((r) => {
            const on = skills.includes(r.skill);
            return (
              <button
                key={r.skill}
                type="button"
                aria-pressed={on}
                onClick={() => setSkills((s) => (on ? s.filter((x) => x !== r.skill) : [...s, r.skill]))}
                className={`h-7 rounded-full border px-2.5 text-[12px] transition-colors ${on ? "border-s1/50 bg-s1/15 text-d-ink" : "border-d-line text-d-ink3 hover:text-d-ink2"}`}
              >
                {r.role}
              </button>
            );
          })}
        </div>
      </form>
    </Card>
  );
}
