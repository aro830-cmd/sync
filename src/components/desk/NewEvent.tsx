"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useRef, useState, useSyncExternalStore, useTransition } from "react";
import { createEvent, findDuplicate } from "@/app/actions";
import { AGENTS, type AgentName } from "@/lib/agents";
import { DEMO_LEADS, DEMO_VOLUNTEERS } from "@/lib/demo";
import { Icon } from "./icons";
import { Button, ease } from "./ui";

const field =
  "w-full rounded-xl border border-d-line bg-black/30 px-3.5 py-3 font-mono text-[12.5px] leading-relaxed text-d-ink outline-none transition-colors placeholder:text-d-ink3 focus:border-white/25";

const EXAMPLES = ["Hackathon on AI for campus, 15 Dec, ₹50k, 200 people", "Free seminar on AI safety, 18 Dec, 120 students", "Tech talk on cloud careers, 10 Jan, ₹15k, 80 people"];
// A brief that reads like a free event: the Planner will most likely mark it free, so Sponsorship starts off.
// Web Speech API (Chrome, Edge, Safari). Typed loosely: it isn't in the TS DOM lib.
type Recognizer = { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null };
const speechCtor = () => (typeof window === "undefined" ? null : ((window as unknown as Record<string, new () => Recognizer>).SpeechRecognition ?? (window as unknown as Record<string, new () => Recognizer>).webkitSpeechRecognition ?? null));
const noop = () => () => {};

const looksFree = (b: string) => /\b(free|seminar|talk|meetup|no budget)\b|₹\s*0\b/i.test(b) && !/₹\s*[1-9]/.test(b);

export function NewEvent({ initial = "" }: { initial?: string }) {
  const router = useRouter();
  const [brief, setBrief] = useState(initial);
  const [leads, setLeads] = useState("");
  const [vols, setVols] = useState("");
  const [more, setMore] = useState(false);
  const [picked, setPicked] = useState<Set<AgentName>>(() => new Set(AGENTS.map((a) => a.id)));
  const [error, setError] = useState("");
  const [dupe, setDupe] = useState<{ id: string; name: string | null; date: string | null } | null>(null);
  const [pending, start] = useTransition();
  const [listening, setListening] = useState(false);
  const rec = useRef<Recognizer | null>(null);
  const canSpeak = useSyncExternalStore(noop, () => !!speechCtor(), () => false);
  const free = looksFree(brief);

  // Speak the brief instead of typing it. Appends to what's already there; stops on silence or a second tap.
  const listen = () => {
    if (listening) return rec.current?.stop();
    const SR = speechCtor();
    if (!SR) return;
    const r = new SR();
    r.lang = "en-IN";
    r.interimResults = true;
    r.continuous = false;
    const base = brief.trim() ? brief.trim() + " " : "";
    r.onresult = (e) => setBrief(base + Array.from(e.results, (x) => x[0].transcript).join(""));
    r.onend = () => setListening(false);
    r.onerror = (e) => {
      setListening(false);
      if (e.error !== "aborted") setError(e.error === "not-allowed" ? "Microphone access is blocked — allow it from the address bar, then tap the mic again." : "Didn't catch that — tap the mic and try again.");
    };
    setError("");
    rec.current = r;
    r.start();
    setListening(true);
  };
  const run = AGENTS.filter((a) => picked.has(a.id) && !(free && a.fundedOnly)).map((a) => a.id);

  const toggle = (a: AgentName) =>
    a !== "planner" && // every other agent reads the plan, so the Planner always runs
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(a)) n.delete(a);
      else n.add(a);
      return n;
    });

  const submit = (e: React.FormEvent, force = false) => {
    e.preventDefault();
    setError("");
    start(async () => {
      try {
        if (!force) {
          const d = await findDuplicate(brief);
          if (d) return setDupe(d);
        }
        setDupe(null);
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
          placeholder={listening ? "Listening… say what, when, the budget and how many people" : "Describe the event in one line — or tap the mic and say it"}
          className="min-w-0 flex-1 bg-transparent px-3 py-3 text-[17px] text-d-ink outline-none placeholder:text-d-ink3 focus-visible:outline-none"
          autoFocus
        />
        {canSpeak && (
          <button
            type="button"
            onClick={listen}
            aria-label={listening ? "Stop listening" : "Speak the brief"}
            aria-pressed={listening}
            className={`relative grid size-11 shrink-0 place-items-center self-end rounded-xl border transition-colors md:self-auto ${listening ? "border-s1 bg-s1 text-white" : "border-d-line bg-white/[0.03] text-d-ink2 hover:border-white/25 hover:text-d-ink"}`}
          >
            {listening && [0, 1].map((k) => <span key={k} aria-hidden className="absolute inset-0 rounded-xl border-2 border-s1 [animation:desk-ripple_1.6s_ease-out_infinite]" style={{ animationDelay: `${k * 0.8}s` }} />)}
            {listening ? (
              <span aria-hidden className="flex h-4 items-center gap-[3px]">
                {[0, 1, 2, 3].map((k) => <span key={k} className="w-[3px] rounded-full bg-white [animation:desk-eq_0.9s_ease-in-out_infinite]" style={{ animationDelay: `${k * 0.15}s` }} />)}
              </span>
            ) : (
              <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="3.5" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5" /></svg>
            )}
          </button>
        )}
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
            <div className="flex justify-end px-3 pt-1">
              <button type="button" onClick={() => (setLeads(DEMO_LEADS), setVols(DEMO_VOLUNTEERS))} className="text-[12px] text-s1 hover:brightness-125">
                Fill with demo sponsors & volunteers
              </button>
            </div>
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

      {dupe && (
        <div className="mx-3 mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-s4/40 bg-s4/10 px-4 py-3 text-[13px]">
          <span className="flex-1">You already have <b>{dupe.name ?? "an event"}</b>{dupe.date ? ` (${dupe.date})` : ""} from this exact brief.</span>
          <a href={`/dashboard/${dupe.id}`} className="font-medium text-s1 hover:brightness-125">Open it →</a>
          <button type="button" onClick={(e) => submit(e as unknown as React.FormEvent, true)} className="text-d-ink2 hover:text-d-ink">Create another anyway</button>
        </div>
      )}
      {error && <p className="px-4 pb-3 text-[13px] text-crit">{error}</p>}
    </form>
  );
}
