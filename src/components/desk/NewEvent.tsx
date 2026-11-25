"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createEvent } from "@/app/actions";
import { Button, ease } from "./ui";

const field =
  "w-full rounded-xl border border-d-line bg-black/30 px-3.5 py-3 font-mono text-[12.5px] leading-relaxed text-d-ink outline-none transition-colors placeholder:text-d-ink3 focus:border-white/25";

const EXAMPLES = ["Hackathon on AI for campus, 15 Dec, ₹50k, 200 people", "Workshop on LLM APIs, 20 Dec, ₹30k, 120 students", "Tech talk on cloud careers, 10 Jan, ₹15k, 80 people"];

export function NewEvent() {
  const router = useRouter();
  const [brief, setBrief] = useState("");
  const [leads, setLeads] = useState("");
  const [vols, setVols] = useState("");
  const [more, setMore] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    start(async () => {
      try {
        const id = await createEvent(brief, leads, vols);
        router.push(`/dashboard/${id}?run=1`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not create event.");
      }
    });
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border border-d-line bg-d-panel p-2 shadow-[0_30px_80px_-40px_rgba(51,140,237,0.35)]">
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <label className="sr-only" htmlFor="brief">Event brief</label>
        <input
          id="brief"
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="Hackathon on AI for campus, 15 Dec, ₹50k, 200 people"
          className="min-w-0 flex-1 bg-transparent px-4 py-3 text-[17px] text-d-ink outline-none placeholder:text-d-ink3 focus-visible:outline-none"
          autoFocus
        />
        <Button variant="accent" pending={pending} disabled={brief.trim().length < 8} className="h-11 px-5 text-[14px]">
          {pending ? "Creating…" : "Run the 5 agents →"}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-d-line px-3 pt-3 pb-2">
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
