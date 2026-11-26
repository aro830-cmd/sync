"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { runAgent } from "@/app/actions";
import type { AgentName } from "@/lib/agents";
import { Button, ease } from "./ui";

/** Run one agent on its own, against an event you pick — from the agent's page. */
export function RunPanel({ agent, name, events }: { agent: AgentName; name: string; events: { id: string; label: string }[] }) {
  const router = useRouter();
  const [id, setId] = useState(events[0]?.id ?? "");
  const [result, setResult] = useState<{ ok: boolean; summary: string; id: string } | null>(null);
  const [pending, start] = useTransition();

  const run = () =>
    start(async () => {
      setResult(null);
      const r = await runAgent(id, agent);
      setResult({ ...r, id });
      router.refresh();
    });

  if (!events.length) return <p className="text-[13px] text-d-ink3">No events this agent can run on yet.</p>;
  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="run-on">Event</label>
        <select
          id="run-on"
          value={id}
          onChange={(e) => setId(e.target.value)}
          className="h-11 min-w-0 flex-1 rounded-xl border border-d-line bg-black/30 px-3.5 text-[14px] text-d-ink outline-none focus:border-white/25"
        >
          {events.map((e) => <option key={e.id} value={e.id} className="bg-d-raise">{e.label}</option>)}
        </select>
        <Button variant="accent" pending={pending} disabled={!id} onClick={run} className="h-11 px-5 text-[14px]">
          {pending ? `${name} is working…` : `Run ${name} →`}
        </Button>
      </div>
      {pending && (
        <div className="mt-3 h-[2px] overflow-hidden rounded-full bg-white/[0.06]">
          <motion.div className="h-full w-1/3 rounded-full bg-s1" animate={{ x: ["-100%", "300%"] }} transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }} />
        </div>
      )}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease }}
            className={`mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-[13px] ${result.ok ? "border-good/30 bg-good/10" : "border-crit/30 bg-crit/10"}`}
          >
            <span className="flex items-start gap-2.5">
              <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${result.ok ? "bg-good" : "bg-crit"}`} />
              {result.summary}
            </span>
            <Link href={`/dashboard/${result.id}?s=${agent}`} className="shrink-0 text-[12.5px] text-d-ink2 hover:text-d-ink">Open in event desk →</Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
