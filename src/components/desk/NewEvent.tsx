"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createEvent } from "@/app/actions";
import { AGENTS, type AgentName } from "@/lib/agents";
import { Icon } from "./icons";
import { Button, ease } from "./ui";

const field =
  "w-full rounded-xl border border-d-line bg-black/30 px-3.5 py-3 font-mono text-[12.5px] leading-relaxed text-d-ink outline-none transition-colors placeholder:text-d-ink3 focus:border-white/25";

const EXAMPLES = ["Hackathon on AI for campus, 15 Dec, ₹50k, 200 people", "Free seminar on AI safety, 18 Dec, 120 students", "Tech talk on cloud careers, 10 Jan, ₹15k, 80 people"];
// A brief that reads like a free event: the Planner will most likely mark it free, so Sponsorship starts off.
const looksFree = (b: string) => /\b(free|seminar|talk|meetup|no budget)\b|₹\s*0\b/i.test(b) && !/₹\s*[1-9]/.test(b);

export function NewEvent({ initial = "" }: { initial?: string }) {
  const router = useRouter();
  const [brief, setBrief] = useState(initial);
  const [leads, setLeads] = useState("");
  const [vols, setVols] = useState("");
  const [more, setMore] = useState(false);
  const [picked, setPicked] = useState<Set<AgentName>>(() => new Set(AGENTS.map((a) => a.id)));
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const free = looksFree(brief);
  const run = AGENTS.filter((a) => picked.has(a.id) && !(free && a.fundedOnly)).map((a) => a.id);

  const toggle = (a: AgentName) =>
    a !== "planner" && // every other agent reads the plan, so the Planner always runs
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(a)) n.delete(a);
      else n.add(a);
      return n;
    });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    start(async () => {
      try {
        const id = await createEvent(brief, leads, vols);
        router.push(`/dashboard/${id}?run=${run.join(",")}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not create event.");
      }
    });
  };

  return (
    <form onSubmit={submit} className="relative rounded-[20px] border border-d-line bg-d-panel/90 p-2 shadow-[0_40px_120px_-50px_rgba(236,100,38,0.55)] backdrop-blur">
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <label className="sr-only" htmlFor="brief">Event brief</label>
        <span aria-hidden className="hidden pl-3 text-s1 md:block">{Icon.spark}</span>
        <input
          id="brief"
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="Describe the event in one line — what, when, budget, how many people"
          className="min-w-0 flex-1 bg-transparent px-3 py-3 text-[17px] text-d-ink outline-none placeholder:text-d-ink3 focus-visible:outline-none"
          autoFocus
        />
        <Button variant="accent" pending={pending} disabled={brief.trim().length < 8} className="h-11 px-5 text-[14px]">
          {pending ? "Creating…" : `Run ${run.length === AGENTS.length ? "all 5" : run.length} agent${run.length === 1 ? "" : "s"} →`}
        </Button>
      </div>

      {/* Which agents run on create. Planner is fixed; Sponsorship drops out for free events. */}
      <div className="flex flex-wrap items-center gap-1.5 border-t border-d-line px-3 pt-3">
        <span className="mr-1 text-[12px] text-d-ink3">Agents:</span>
        {AGENTS.map((a, i) => {
          const off = free && a.fundedOnly;
          const on = picked.has(a.id) && !off;
          return (
            <button
              key={a.id}
              type="button"
              aria-pressed={on}
              disabled={off || a.id === "planner"}
              onClick={() => toggle(a.id)}
              title={off ? "Free events don't need sponsors" : a.id === "planner" ? "Always runs — every agent reads the plan" : a.does}
              className={`group flex h-8 items-center gap-2 rounded-full border px-3 text-[12.5px] transition-[background-color,border-color,color,opacity] duration-200 ${on ? "border-s1/50 bg-s1/15 text-d-ink" : "border-d-line text-d-ink3 hover:border-white/25 hover:text-d-ink2"} ${off ? "line-through opacity-40" : ""} disabled:cursor-default`}
            >
              <span className="text-[10.5px] tabular-nums text-d-ink3">0{i + 1}</span>
              <span className="[&>svg]:size-3.5">{Icon[a.id]}</span>
              {a.name}
              <motion.span animate={{ scale: on ? 1 : 0 }} transition={{ duration: 0.2, ease }} className="size-1.5 rounded-full bg-s1" />
            </button>
          );
        })}
        <AnimatePresence>
          {free && (
            <motion.span initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="ml-1 rounded-full bg-s3/15 px-2.5 py-1 text-[11.5px] text-s3">
              Looks like a free event — no budget, no sponsors
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-3 pt-2.5 pb-2">
        <span className="text-[12px] text-d-ink3">Try:</span>
        {EXAMPLES.map((x) => (
          <button key={x} type="button" onClick={() => setBrief(x)} className="rounded-full border border-d-line px-2.5 py-1 text-[12px] text-d-ink2 transition-colors hover:border-white/25 hover:text-d-ink">
            {x}
          </button>
        ))}
        <button type="button" onClick={() => setMore((m) => !m)} className="ml-auto text-[12.5px] text-d-ink2 hover:text-d-ink">
          {more ? "− Hide" : "+ Add"} sponsor leads & volunteers
        </button>
      </div>

      <AnimatePresence initial={false}>
        {more && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.4, ease }} className="overflow-hidden">
            <div className="grid gap-3 px-3 pt-2 pb-3 md:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-[12.5px] text-d-ink2">Sponsor leads — company, email per line</span>
                <textarea rows={4} value={leads} onChange={(e) => setLeads(e.target.value)} className={field} placeholder={"Razorpay, partnerships@razorpay.com\nPostman, community@postman.com"} />
              </label>
              <label className="block">
                <span className="mb-2 block text-[12.5px] text-d-ink2">Volunteers — name, email, skills per line</span>
                <textarea rows={4} value={vols} onChange={(e) => setVols(e.target.value)} className={field} placeholder={"Aditi, aditi@rit.edu, av, design\nRahul, rahul@rit.edu, logistics"} />
              </label>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {error && <p className="px-4 pb-3 text-[13px] text-crit">{error}</p>}
    </form>
  );
}
