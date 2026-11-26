"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import * as act from "@/app/actions";
import { AGENTS, agentsFor, type AgentName } from "@/lib/agents";
import { DEMO_LEADS, DEMO_VOLUNTEERS } from "@/lib/demo";
import { isFree, type Attendee, type EventRow, type Run, type Sponsor, type Task, type Volunteer } from "@/lib/types";
import { BarList, LineChart, Meter, MilestoneTrack, SegmentedBar, ShiftTimeline, inr } from "./charts";
import { Icon } from "./icons";
import { Shell } from "./shell";
import { Button, Card, Empty, Label, Stat, ToastProvider, ease, useToast } from "./ui";

type Alum = { company: string; email: string; tier: string | null; event: string; times: number };
type Data = { event: EventRow; sponsors: Sponsor[]; volunteers: Volunteer[]; tasks: Task[]; attendees: Attendee[]; runs: Run[]; alumni: Alum[] };
type Live = Partial<Record<AgentName, "running" | "done" | "failed">>;
type Section = "overview" | AgentName;
type AgentState = "idle" | "running" | "done" | "failed";

const ago = (iso: string) => {
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  return s < 60 ? "just now" : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`;
};
const hrs = (t: Task) => (Date.parse(t.ends_at) - Date.parse(t.starts_at)) / 3_600_000;
const longDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "Date TBA");
const DOT: Record<AgentState, string> = { idle: "bg-white/15", running: "bg-s2 animate-pulse", done: "bg-good", failed: "bg-crit" };

export function EventDesk(props: Data) {
  return (
    <ToastProvider>
      <Desk {...props} />
    </ToastProvider>
  );
}

function Desk(d: Data) {
  const { event } = d;
  const free = isFree(event);
  const agents = agentsFor(free);
  const params = useSearchParams();
  // ?s=<agent> deep-links straight to an agent page (from the home inbox and the agent pages).
  const [section, setSection] = useState<Section>(() => {
    const s = params.get("s");
    return agents.some((a) => a.id === s) ? (s as AgentName) : "overview";
  });
  const [live, setLive] = useState<Live>({});
  const [running, setRunning] = useState(false);
  const notify = useToast();
  const router = useRouter();
  const started = useRef(false);

  async function run(list: AgentName[]) {
    setRunning(true);
    for (const a of list) {
      setLive((l) => ({ ...l, [a]: "running" }));
      const r = await act.runAgent(event.id, a);
      setLive((l) => ({ ...l, [a]: r.ok ? "done" : "failed" }));
      notify(r.ok, `${AGENTS.find((x) => x.id === a)!.name}: ${r.summary}`);
      if (!r.ok && a === "planner") break; // nothing downstream works without a plan
    }
    setRunning(false);
  }

  // Arriving from "New event" → run the agents picked in the composer once (?run=planner,comms; "1" = all).
  useEffect(() => {
    const want = params.get("run");
    if (want && !started.current) {
      started.current = true;
      router.replace(`/dashboard/${event.id}`);
      const list = want === "1" ? AGENTS.map((a) => a.id) : AGENTS.map((a) => a.id).filter((a) => want.split(",").includes(a));
      run(list);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const state = (a: AgentName): AgentState => {
    const last = d.runs.find((r) => r.agent === a);
    return live[a] ?? (last ? (last.ok ? "done" : "failed") : "idle");
  };
  const go = (s: Section) => {
    setSection(s);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const head = (
    <div>
      <div className="truncate text-[14px] font-medium">{event.name ?? "Planning…"}</div>
      <div className="mt-0.5 text-[12px] text-d-ink3">{longDate(event.date)}</div>
    </div>
  );

  // Fox: each section owns a slice of the orbit; scrolling walks through that slice.
  const order: Section[] = ["overview", ...agents.map((a) => a.id)];
  const fox = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    return (order.indexOf(section) + (max > 0 ? scrollY / max : 0)) / order.length;
  };

  return (
    <Shell
      fox={fox}
      head={head}
      groups={[
        { items: [{ key: "back", label: "All events", icon: Icon.events, href: "/dashboard" }, { key: "past", label: "Past events", icon: Icon.past, href: "/dashboard/past" }] },
        { items: [{ key: "overview", label: "Overview", icon: Icon.overview, active: section === "overview", onClick: () => go("overview") }] },
        {
          label: "Agents",
          items: agents.map((a) => ({ key: a.id, label: a.name, icon: Icon[a.id], active: section === a.id, onClick: () => go(a.id), dot: DOT[state(a.id)] })),
        },
      ]}
    >
      <AnimatePresence mode="wait">
        <motion.div key={section} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.28, ease }}>
          {section === "overview" ? (
            <Overview d={d} state={state} running={running} onRun={run} onGo={go} />
          ) : (
            <AgentPage d={d} agent={section} state={state(section)} running={running} onRun={() => run([section])} onGo={go} />
          )}
        </motion.div>
      </AnimatePresence>
    </Shell>
  );
}

// ───────────── shared bits ─────────────

function useAction() {
  const notify = useToast();
  const [pending, start] = useTransition();
  const go = (fn: () => Promise<{ ok: boolean; message: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      notify(r.ok, r.message);
      if (r.ok) after?.();
    });
  return [pending, go] as const;
}

function AddLines({ label, placeholder, onAdd, demo }: { label: string; placeholder: string; onAdd: (t: string) => Promise<{ ok: boolean; message: string }>; demo?: string }) {
  const [text, setText] = useState("");
  const [pending, go] = useAction();
  return (
    <div>
      <label className="block text-[12.5px] text-d-ink2">
        {label}
        <textarea
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          className="mt-2 w-full resize-y rounded-xl border border-d-line bg-black/30 px-3.5 py-3 font-mono text-[12.5px] leading-relaxed text-d-ink outline-none transition-colors placeholder:text-d-ink3 focus:border-white/25"
        />
      </label>
      <div className="mt-2 flex items-center justify-end gap-3">
        {demo && <button type="button" onClick={() => setText(demo)} className="text-[12px] text-s1 hover:brightness-125">Use demo list</button>}
        <Button variant="ghost" pending={pending} disabled={!text.trim()} onClick={() => go(() => onAdd(text), () => setText(""))}>
          Add
        </Button>
      </div>
    </div>
  );
}

function PageHead({ eyebrow, title, sub, actions }: { eyebrow: ReactNode; title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-[12.5px] text-d-ink3">{eyebrow}</div>
        <h1 className="mt-2 text-[clamp(1.75rem,3.2vw,2.4rem)] leading-[1.1] font-semibold tracking-[-0.025em]">{title}</h1>
        {sub && <p className="mt-2 max-w-2xl text-[14px] text-d-ink2">{sub}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

// ───────────── next step ─────────────

type Step = { stage: string; text: string; go?: Section; agent?: AgentName; cta: string };

/** The one thing the organiser should do next, read off the event's current state. */
function nextStep({ event, sponsors, volunteers, tasks, attendees }: Data): Step {
  const has = (s: Sponsor["status"]) => sponsors.filter((x) => x.status === s).length;
  const checked = attendees.filter((a) => a.checked_in);
  if (!event.plan?.timeline) return { stage: "Plan", text: "Let the Planner turn the brief into a plan — budget and sponsor tiers for funded events, a timeline for every event.", agent: "planner", cta: "Run Planner" };
  if (isFree(event)) return freeStep({ event, sponsors, volunteers, tasks, attendees } as Data);
  if (!sponsors.length && event.plan?.suggestions?.length) return { stage: "Sponsors", text: `The agent recommended ${event.plan.suggestions.length} companies. Add a contact email to the ones you want to pitch.`, go: "sponsorship", cta: "Review recommendations" };
  if (!sponsors.length) return { stage: "Sponsors", text: "Add the companies you want to approach — the Sponsorship agent writes each pitch.", go: "sponsorship", cta: "Add sponsor leads" };
  if (has("lead")) return { stage: "Sponsors", text: `${has("lead")} new lead${has("lead") > 1 ? "s" : ""} waiting — draft tailored pitches for them.`, agent: "sponsorship", cta: "Run Sponsorship" };
  if (has("drafted")) return { stage: "Sponsors", text: `${has("drafted")} pitch${has("drafted") > 1 ? "es are" : " is"} drafted. Read, edit if needed, then approve to send.`, go: "sponsorship", cta: "Review pitches" };
  if (!volunteers.length) return { stage: "Logistics", text: "Add your volunteers and their skills so the day can be scheduled.", go: "logistics", cta: "Add volunteers" };
  if (!tasks.length) return { stage: "Logistics", text: "Build the run-of-show and assign volunteers with zero clashes.", agent: "logistics", cta: "Run Logistics" };
  if (!event.plan?.comms) return { stage: "Comms", text: "Draft the announcement and attendee reminder.", agent: "comms", cta: "Run Comms" };
  if (!attendees.length) return { stage: "Registration", text: "Share the announcement — registrations appear here as they come in.", go: "comms", cta: "Open registrations" };
  if (!checked.length) return { stage: "Event day", text: `${attendees.length} registered. Send a reminder before the day, then check people in at the door.`, go: "comms", cta: "Open check-in" };
  if (checked.some((a) => !a.certificate_sent)) return { stage: "After the event", text: `${checked.filter((a) => !a.certificate_sent).length} checked-in attendee(s) still need a certificate.`, go: "comms", cta: "Send certificates" };
  if (!event.summary) return { stage: "Report", text: "Write the sponsor report from real attendance and confirmed partners.", agent: "reporting", cta: "Run Reporting" };
  return { stage: "Wrap-up", text: has("confirmed") ? "Report ready — email it to your confirmed partners." : "All stages done. Confirm partners to send them the report.", go: has("confirmed") ? "reporting" : "sponsorship", cta: has("confirmed") ? "Open report" : "Open sponsors" };
}

function freeStep({ event, volunteers, tasks, attendees }: Data): Step {
  const checked = attendees.filter((a) => a.checked_in);
  if (!volunteers.length) return { stage: "Logistics", text: "Free event — no sponsors needed. Add your volunteers so the day can be scheduled.", go: "logistics", cta: "Add volunteers" };
  if (!tasks.length) return { stage: "Logistics", text: "Build the run-of-show and assign volunteers with zero clashes.", agent: "logistics", cta: "Run Logistics" };
  if (!event.plan?.comms) return { stage: "Comms", text: "Draft the announcement and attendee reminder.", agent: "comms", cta: "Run Comms" };
  if (!attendees.length) return { stage: "Registration", text: "Share the announcement — registrations appear here as they come in.", go: "comms", cta: "Open registrations" };
  if (!checked.length) return { stage: "Event day", text: `${attendees.length} registered. Send a reminder, then check people in at the door.`, go: "comms", cta: "Open check-in" };
  if (checked.some((a) => !a.certificate_sent)) return { stage: "After the event", text: `${checked.filter((a) => !a.certificate_sent).length} checked-in attendee(s) still need a certificate.`, go: "comms", cta: "Send certificates" };
  if (!event.summary) return { stage: "Report", text: "Write the club report from real attendance.", agent: "reporting", cta: "Run Reporting" };
  return { stage: "Wrap-up", text: "All stages done. Download the report PDF for your department.", go: "reporting", cta: "Open report" };
}

function NextStep({ step, busy, onRun, onGo }: { step: Step; busy: boolean; onRun: (a: AgentName[]) => void; onGo: (s: Section) => void }) {
  return (
    <motion.div
      key={step.text}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease }}
      className="relative overflow-hidden rounded-2xl border border-s1/30 bg-gradient-to-r from-s1/[0.14] via-d-panel to-d-panel p-5"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3.5">
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-s1/20 text-s1">
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </span>
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-d-ink2">Next step · {step.stage}</div>
            <p className="mt-1 text-[14.5px] text-d-ink">{step.text}</p>
          </div>
        </div>
        <Button variant="accent" disabled={busy} onClick={() => (step.agent ? onRun([step.agent]) : step.go && onGo(step.go))} className="self-start sm:self-auto">
          {step.cta} →
        </Button>
      </div>
    </motion.div>
  );
}

// ───────────── edit details ─────────────

/** Change the brief, budget, date and the rest by hand, then optionally re-run the agents you pick. */
function EditDetails({ event, running, onRun }: { event: EventRow; running: boolean; onRun: (a: AgentName[]) => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const init = {
    brief: event.brief,
    name: event.name ?? "",
    date: event.date ?? "",
    venue: event.venue ?? "",
    budget: event.budget ?? 0,
    expected_attendees: event.expected_attendees ?? 100,
    kind: (event.plan?.kind ?? "funded") as "funded" | "free",
  };
  const [f, setF] = useState(init);
  const [picked, setPicked] = useState<Set<AgentName>>(new Set());
  const [pending, go] = useAction();
  const set = <K extends keyof typeof init>(k: K, v: (typeof init)[K]) => setF((x) => ({ ...x, [k]: v }));
  // Re-planning is what rescales the budget split and tiers, so suggest it when those inputs change.
  const replan = f.budget !== init.budget || f.kind !== init.kind || f.date !== init.date || f.brief !== init.brief || f.expected_attendees !== init.expected_attendees;
  const agents = agentsFor(f.kind === "free");
  const list = agents.filter((a) => picked.has(a.id)).map((a) => a.id);
  const field = "h-10 w-full rounded-lg border border-d-line bg-black/30 px-3 text-[13.5px] text-d-ink outline-none transition-colors focus:border-white/25";
  const toggle = (a: AgentName) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(a)) n.delete(a);
      else n.add(a);
      return n;
    });

  const show = () => {
    setF(init);
    setPicked(new Set());
    setOpen(true);
  };
  const save = (run: boolean) =>
    go(
      () => act.updateEvent(event.id, f),
      () => {
        setOpen(false);
        router.refresh();
        if (run && list.length) onRun(list);
      },
    );

  return (
    <>
      <Button variant="ghost" onClick={show} disabled={running}>
        <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" /></svg>
        Edit details
      </Button>
      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)}>
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Edit event details"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.3, ease }}
              className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-d-line bg-d-panel p-6 shadow-[0_40px_120px_-30px_rgba(0,0,0,.9)]"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-[18px] font-semibold">Edit event details</h2>
                  <p className="mt-1 text-[12.5px] text-d-ink2">What you set here sticks — a Planner re-run plans around it instead of overwriting it.</p>
                </div>
                <button onClick={() => setOpen(false)} aria-label="Close" className="text-d-ink3 hover:text-d-ink">✕</button>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <label className="sm:col-span-2">
                  <span className="mb-1.5 block text-[12px] text-d-ink2">One-line brief</span>
                  <input value={f.brief} onChange={(e) => set("brief", e.target.value)} className={field} />
                </label>
                <label>
                  <span className="mb-1.5 block text-[12px] text-d-ink2">Event name</span>
                  <input value={f.name} onChange={(e) => set("name", e.target.value)} className={field} placeholder="Set by the Planner" />
                </label>
                <label>
                  <span className="mb-1.5 block text-[12px] text-d-ink2">Date</span>
                  <input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} className={`${field} [color-scheme:dark]`} />
                </label>
                <label className="sm:col-span-2">
                  <span className="mb-1.5 block text-[12px] text-d-ink2">Venue</span>
                  <input value={f.venue} onChange={(e) => set("venue", e.target.value)} className={field} placeholder="Set by the Planner" />
                </label>
                <div>
                  <span className="mb-1.5 block text-[12px] text-d-ink2">Type</span>
                  <div className="grid h-10 grid-cols-2 rounded-lg border border-d-line bg-black/30 p-1">
                    {(["funded", "free"] as const).map((k) => (
                      <button key={k} type="button" onClick={() => set("kind", k)} className={`relative rounded-md text-[13px] capitalize transition-colors ${f.kind === k ? "text-d-ink" : "text-d-ink3 hover:text-d-ink2"}`}>
                        {f.kind === k && <motion.span layoutId="kind-pill" className={`absolute inset-0 rounded-md ${k === "free" ? "bg-s3/20" : "bg-s1/20"}`} transition={{ duration: 0.25, ease }} />}
                        <span className="relative">{k}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <label>
                  <span className="mb-1.5 block text-[12px] text-d-ink2">Budget (₹)</span>
                  <input type="number" min={0} step={1000} disabled={f.kind === "free"} value={f.kind === "free" ? 0 : f.budget} onChange={(e) => set("budget", Number(e.target.value))} className={`${field} disabled:opacity-40`} />
                </label>
                <label>
                  <span className="mb-1.5 block text-[12px] text-d-ink2">Expected attendees</span>
                  <input type="number" min={1} value={f.expected_attendees} onChange={(e) => set("expected_attendees", Number(e.target.value))} className={field} />
                </label>
              </div>

              <div className="mt-6 rounded-xl border border-d-line bg-black/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[13px] font-medium">Re-run agents after saving</span>
                  {replan && !picked.has("planner") && (
                    <button type="button" onClick={() => toggle("planner")} className="text-[12px] text-s1 hover:brightness-125">
                      Budget or plan changed — add Planner
                    </button>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {agents.map((a) => {
                    const on = picked.has(a.id);
                    return (
                      <button
                        key={a.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggle(a.id)}
                        className={`flex h-8 items-center gap-2 rounded-full border px-3 text-[12.5px] transition-colors ${on ? "border-s1/50 bg-s1/15 text-d-ink" : "border-d-line text-d-ink3 hover:text-d-ink2"}`}
                      >
                        <span className="[&>svg]:size-3.5">{Icon[a.id]}</span>
                        {a.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-6 flex flex-wrap justify-end gap-2">
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button variant="ghost" pending={pending} onClick={() => save(false)}>Save only</Button>
                <Button variant="accent" pending={pending} disabled={!list.length} onClick={() => save(true)}>
                  Save & run {list.length || ""} agent{list.length === 1 ? "" : "s"} →
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ───────────── overview ─────────────

function Overview({ d, state, running, onRun, onGo }: { d: Data; state: (a: AgentName) => AgentState; running: boolean; onRun: (a: AgentName[]) => void; onGo: (s: Section) => void }) {
  const { event, sponsors, volunteers, tasks, attendees, runs } = d;
  const free = isFree(event);
  const agents = agentsFor(free);
  const notify = useToast();
  const confirmed = sponsors.filter((s) => s.status === "confirmed");
  const raised = confirmed.reduce((sum, s) => sum + (event.plan?.tiers?.find((t) => t.name === s.tier)?.amount ?? 0), 0);
  const checked = attendees.filter((a) => a.checked_in).length;
  const open = tasks.filter((t) => !t.volunteer_id).length;
  const regUrl = `/e/${event.id}`;

  return (
    <>
      <PageHead
        eyebrow={<><span className="size-1.5 rounded-full bg-good" />Event overview</>}
        title={event.name ?? <span className="text-d-ink3">Planning…</span>}
        sub={[event.theme, event.venue, event.expected_attendees ? `${event.expected_attendees} expected` : null].filter(Boolean).join(" · ")}
        actions={
          <>
            <EditDetails event={event} running={running} onRun={onRun} />
            <Button variant="ghost" onClick={() => navigator.clipboard.writeText(location.origin + regUrl).then(() => notify(true, "Registration link copied"))}>
              Copy registration link
            </Button>
            <Button pending={running} onClick={() => onRun(agents.map((a) => a.id))}>
              {running ? "Agents working" : `Run all ${agents.length} agents`}
            </Button>
          </>
        }
      />

      <NextStep step={nextStep(d)} busy={running} onRun={onRun} onGo={onGo} />

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {free ? (
          <>
            <Stat label="Entry" value="Free" hint="No budget, no sponsors" dot="bg-s3" />
            <Stat label="Seats" value={event.expected_attendees ?? "—"} hint={<span className="block"><span className="mb-2 block">{attendees.length} taken</span><Meter value={attendees.length} max={event.expected_attendees || 1} color="bg-s1" track="bg-s1/15" height="h-1.5" /></span>} dot="bg-s1" />
          </>
        ) : (
          <>
        <Stat label="Budget" value={inr(event.budget)} hint={`${event.plan?.budget_split?.length ?? 0} cost heads`} dot="bg-s1" />
        <Stat label="Sponsorship raised" value={inr(raised)} hint={<span className="block"><span className="mb-2 block">{confirmed.length} of {sponsors.length} partners confirmed</span><Meter value={raised} max={event.budget ?? 1} color="bg-s2" track="bg-s2/15" height="h-1.5" /></span>} dot="bg-s2" />
          </>
        )}
        <Stat label="Registered" value={attendees.length} hint={<span className="block"><span className="mb-2 block">{checked} checked in</span><Meter value={checked} max={attendees.length || 1} color="bg-s3" track="bg-s3/15" height="h-1.5" /></span>} dot="bg-s3" />
        <Stat label="Volunteer shifts" value={tasks.length} hint={`${volunteers.length} volunteers · ${open ? `${open} open` : "all covered"}`} dot="bg-s4" />
      </div>

      <div className="mt-5">
        <div className="mb-3 flex items-baseline justify-between">
          <Label>Agent pipeline</Label>
          <span className="text-[12px] text-d-ink3">{agents.filter((a) => state(a.id) === "done").length}/{agents.length} complete</span>
        </div>
        <ol className={`grid gap-3 sm:grid-cols-2 ${free ? "lg:grid-cols-4" : "lg:grid-cols-5"}`}>
          {agents.map((a, i) => {
            const st = state(a.id);
            const last = runs.find((r) => r.agent === a.id);
            return (
              <li key={a.id} className={`group relative flex min-h-[168px] flex-col overflow-hidden rounded-2xl border bg-d-panel p-4 transition-colors ${st === "running" ? "border-s2/50" : "border-d-line hover:border-white/20"}`}>
                {st === "running" && <motion.span className="absolute inset-x-0 top-0 h-[2px] bg-s2" initial={{ scaleX: 0 }} animate={{ scaleX: [0, 1, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }} style={{ transformOrigin: "left" }} />}
                <button onClick={() => onGo(a.id)} className="flex items-center justify-between text-left">
                  <span className="grid size-9 place-items-center rounded-xl border border-d-line bg-white/[0.04] text-d-ink2 group-hover:text-d-ink">{Icon[a.id]}</span>
                  <span className="flex items-center gap-1.5 text-[11px] text-d-ink3">
                    <span className={`size-1.5 rounded-full ${DOT[st]}`} />
                    {st === "idle" ? "Not run" : st === "running" ? "Working" : st === "done" ? "Done" : "Failed"}
                  </span>
                </button>
                <button onClick={() => onGo(a.id)} className="mt-4 text-left">
                  <div className="text-[11px] tabular-nums text-d-ink3">0{i + 1}</div>
                  <div className="text-[15px] font-medium">{a.name}</div>
                  <div className="text-[12px] text-d-ink3">{a.does}</div>
                </button>
                <p className={`mt-3 line-clamp-2 text-[12px] leading-snug ${st === "failed" ? "text-crit" : "text-d-ink2"}`}>{st === "running" ? "Working…" : last?.summary ?? "Waiting to run"}</p>
                <div className="mt-auto flex items-center justify-between pt-3">
                  <button onClick={() => onGo(a.id)} className="text-[12px] text-d-ink3 hover:text-d-ink">Open →</button>
                  <button disabled={running} onClick={() => onRun([a.id])} className="rounded-md px-2 py-1 text-[12px] text-d-ink2 transition-colors hover:bg-white/[0.06] hover:text-d-ink disabled:opacity-30">
                    {last ? "Re-run" : "Run"}
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-[1.6fr_1fr]">
        <Card title="Registrations" sub="Cumulative sign-ups since the page went live">
          <LineChart points={cumulative(attendees)} label="registered" />
        </Card>
        <Card title="Activity" sub="Every agent run and organiser action">
          {runs.length ? (
            <ul className="-my-1 max-h-[232px] overflow-y-auto pr-1">
              {runs.slice(0, 14).map((r) => (
                <li key={r.id} className="flex gap-3 py-2">
                  <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${r.ok ? "bg-good" : "bg-crit"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] leading-snug text-d-ink">{r.summary}</p>
                    <p className="mt-0.5 text-[11px] text-d-ink3">
                      <span className="capitalize">{r.agent}</span> · {ago(r.created_at)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Agent activity streams here.</Empty>
          )}
        </Card>
      </div>
    </>
  );
}

function cumulative(attendees: Attendee[]) {
  const ts = attendees.map((a) => Date.parse(a.created_at)).filter((t) => !Number.isNaN(t)).sort((a, b) => a - b);
  return ts.map((t, i) => ({ t, v: i + 1 }));
}

// ───────────── agent pages ─────────────

function AgentPage({ d, agent, state, running, onRun, onGo }: { d: Data; agent: AgentName; state: AgentState; running: boolean; onRun: () => void; onGo: (s: Section) => void }) {
  const list = agentsFor(isFree(d.event));
  const a = list.find((x) => x.id === agent)!;
  const i = list.indexOf(a);
  const last = d.runs.find((r) => r.agent === agent);
  return (
    <>
      <PageHead
        eyebrow={
          <>
            <span className="grid size-6 place-items-center rounded-md border border-d-line bg-white/[0.04] text-d-ink2 [&>svg]:size-3.5">{Icon[agent]}</span>
            Agent 0{i + 1} of {list.length}
            <span className="mx-1 text-d-ink3/50">·</span>
            <span className={`size-1.5 rounded-full ${DOT[state]}`} />
            {state === "idle" ? "Not run yet" : state === "running" ? "Working…" : state === "failed" ? "Last run failed" : `Last run ${last ? ago(last.created_at) : ""}`}
          </>
        }
        title={`${a.name} agent`}
        sub={a.about}
        actions={
          <>
            {i < list.length - 1 && (
              <Button variant="ghost" onClick={() => onGo(list[i + 1].id)}>
                Next: {list[i + 1].name} →
              </Button>
            )}
            <Button pending={running && state === "running"} disabled={running} onClick={onRun}>
              {last ? `Re-run ${a.name}` : `Run ${a.name}`}
            </Button>
          </>
        }
      />
      {last && !last.ok && <p className="-mt-3 mb-5 rounded-xl border border-crit/30 bg-crit/10 px-4 py-3 text-[13px] text-d-ink">{last.summary}</p>}
      {agent === "planner" && <Planner {...d} />}
      {agent === "sponsorship" && <Sponsors {...d} />}
      {agent === "logistics" && <Logistics {...d} />}
      {agent === "comms" && <Comms {...d} />}
      {agent === "reporting" && <Reporting {...d} />}
    </>
  );
}

// ───────────── 01 planner ─────────────

function Planner({ event }: Data) {
  const [now] = useState(Date.now); // read the clock once, not on every render
  const plan = event.plan ?? {};
  const split = plan.budget_split ?? [];
  const days = event.date ? Math.ceil((Date.parse(event.date) - now) / 86_400_000) : null;
  const free = isFree(event);
  if (!plan.timeline?.length) return <Empty>Run the Planner to build the plan — budget and sponsor tiers for funded events, a timeline for every event.</Empty>;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {free ? <Stat label="Entry" value="Free" hint="The Planner marked this a free event" dot="bg-s3" /> : <Stat label="Total budget" value={inr(event.budget)} dot="bg-s1" />}
        <Stat label="Expected attendees" value={event.expected_attendees ?? "—"} hint={event.budget && event.expected_attendees ? `${inr(event.budget / event.expected_attendees)} per head` : undefined} />
        {free ? <Stat label="Milestones" value={plan.timeline.length} hint="From today to event day" /> : <Stat label="Sponsor tiers" value={plan.tiers?.length ?? 0} hint={plan.tiers?.length ? `${inr(Math.max(...plan.tiers.map((t) => t.amount)))} top tier` : undefined} />}
        <Stat label="Days to event" value={days == null ? "—" : days < 0 ? "Done" : days} hint={longDate(event.date)} />
      </div>
      {!!split.length && (
        <Card title="Budget split" sub={`${inr(event.budget)} across ${split.length} cost heads`}>
          <SegmentedBar parts={split.map((b) => ({ label: b.head, value: b.amount }))} />
        </Card>
      )}
      <div className="grid gap-3 lg:grid-cols-[1.3fr_1fr]">
        {!!plan.timeline?.length && (
          <Card title="Timeline" sub="Milestones from today to event day">
            <MilestoneTrack items={plan.timeline} />
            <ol className="mt-5 space-y-2.5">
              {plan.timeline.map((m) => (
                <li key={m.date + m.milestone} className="flex gap-4 text-[13px]">
                  <span className="w-16 shrink-0 tabular-nums text-d-ink3">{new Date(m.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                  <span className="text-d-ink2">{m.milestone}</span>
                </li>
              ))}
            </ol>
          </Card>
        )}
        {free ? (
          <Card title="Why it's free" sub="No budget, no sponsors — fewer agents to run">
            <ul className="space-y-2.5 text-[13px] text-d-ink2">
              <li className="flex gap-2"><span className="text-s3">✓</span>Sponsorship is skipped entirely</li>
              <li className="flex gap-2"><span className="text-s3">✓</span>Logistics, Comms and Reporting run as usual</li>
              <li className="flex gap-2"><span className="text-s3">✓</span>The report goes to your club and department, not sponsors</li>
            </ul>
            <p className="mt-4 text-[12.5px] text-d-ink3">Wrong call? Edit the brief to include a budget (e.g. “₹20k”) and re-run the Planner.</p>
          </Card>
        ) : (
        <Card title="Sponsor tiers" sub="What each partner level pays and gets">
          <div className="space-y-2.5">
            {(plan.tiers ?? []).map((t, i) => (
              <div key={t.name} className="rounded-xl border border-d-line bg-white/[0.02] p-4">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-[14px] font-medium">
                    <span className={`size-2 rounded-full ${["bg-s4", "bg-s1", "bg-s3", "bg-s5"][i] ?? "bg-white/30"}`} />
                    {t.name}
                  </span>
                  <span className="text-[14px] tabular-nums">{inr(t.amount)}</span>
                </div>
                <ul className="mt-2 space-y-1 text-[12.5px] text-d-ink2">
                  {t.perks.map((p) => <li key={p}>· {p}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </Card>
        )}
      </div>
    </div>
  );
}

// ───────────── 02 sponsorship ─────────────

const COLS: Sponsor["status"][] = ["lead", "drafted", "contacted", "replied", "confirmed", "declined"];
const NEXT: Partial<Record<Sponsor["status"], Sponsor["status"][]>> = {
  contacted: ["replied", "declined"],
  replied: ["confirmed", "declined"],
  declined: ["replied"],
};

function Sponsors({ event, sponsors, alumni }: Data) {
  const [pending, go] = useAction();
  const [open, setOpen] = useState<string | null>(null);
  const n = (...s: Sponsor["status"][]) => sponsors.filter((x) => s.includes(x.status)).length;
  const drafted = n("drafted");
  const tierAmt = (s: Sponsor) => event.plan?.tiers?.find((t) => t.name === s.tier)?.amount ?? 0;
  const confirmed = sponsors.filter((s) => s.status === "confirmed");
  const raised = confirmed.reduce((sum, s) => sum + tierAmt(s), 0);
  const scored = sponsors.filter((s) => s.fit_score != null).sort((a, b) => b.fit_score! - a.fit_score!);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Leads" value={sponsors.length} dot="bg-s1" />
        <Stat label="Pitches sent" value={n("contacted", "replied", "confirmed", "declined")} hint={drafted ? `${drafted} waiting for approval` : "none waiting"} />
        <Stat label="Confirmed" value={confirmed.length} hint={`${n("declined")} declined`} />
        <Stat label="Raised" value={inr(raised)} hint={<span className="block"><span className="mb-2 block">{event.budget ? `${Math.round((raised / event.budget) * 100)}% of budget` : ""}</span><Meter value={raised} max={event.budget ?? 1} color="bg-s2" track="bg-s2/15" height="h-1.5" /></span>} dot="bg-s2" />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card title="Sponsor funnel" sub="How far each lead has got">
          {sponsors.length ? (
            <BarList
              rows={[
                { label: "Leads", value: sponsors.length },
                { label: "Pitch drafted", value: sponsors.length - n("lead") },
                { label: "Contacted", value: n("contacted", "replied", "confirmed", "declined") },
                { label: "Replied", value: n("replied", "confirmed") },
                { label: "Confirmed", value: n("confirmed") },
              ]}
              max={sponsors.length}
            />
          ) : (
            <Empty>Add sponsor leads below.</Empty>
          )}
        </Card>
        <Card title="Fit score" sub="Agent's 0–100 match for your audience">
          {scored.length ? <BarList rows={scored.map((s) => ({ label: s.company, value: s.fit_score!, note: s.tier ?? undefined }))} max={100} color="bg-s3" /> : <Empty>Run the Sponsorship agent to score leads.</Empty>}
        </Card>
      </div>

      <Card
        title="Pipeline board"
        sub="Click a company to read its pitch. Drafts can be edited before you approve."
        action={
          <Button variant="accent" pending={pending} disabled={!drafted} onClick={() => go(() => act.sendPitches(event.id))}>
            Approve & send {drafted || ""} pitch{drafted === 1 ? "" : "es"}
          </Button>
        }
      >
        <div className="-mx-5 overflow-x-auto px-5">
          <div className="grid min-w-[920px] grid-cols-6 gap-2">
            {COLS.map((c) => {
              const list = sponsors.filter((s) => s.status === c);
              return (
                <div key={c} className="min-h-[180px] rounded-xl bg-black/25 p-2">
                  <div className="flex items-center justify-between px-1.5 pt-1 pb-2">
                    <span className="text-[11.5px] font-medium capitalize text-d-ink2">{c}</span>
                    <span className="rounded-md bg-white/[0.06] px-1.5 text-[11px] tabular-nums text-d-ink3">{list.length}</span>
                  </div>
                  <div className="space-y-1.5">
                    {list.map((s) => (
                      <motion.div
                        layout
                        layoutId={s.id}
                        key={s.id}
                        transition={{ duration: 0.4, ease }}
                        className={`rounded-lg border p-2.5 text-[12.5px] transition-colors ${open === s.id ? "border-s1/60 bg-s1/10" : c === "confirmed" ? "border-good/40 bg-good/10" : "border-d-line bg-d-raise hover:border-white/20"} ${c === "declined" ? "opacity-50" : ""}`}
                      >
                        <button className="w-full text-left" onClick={() => setOpen(open === s.id ? null : s.id)}>
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="truncate font-medium">{s.company}</span>
                            {s.fit_score != null && <span className="text-[10.5px] tabular-nums text-d-ink3">{s.fit_score}</span>}
                          </div>
                          {s.tier && <div className="mt-0.5 text-[11px] text-d-ink3">{s.tier}{tierAmt(s) ? ` · ${inr(tierAmt(s))}` : ""}</div>}
                        </button>
                        {!!NEXT[c]?.length && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {NEXT[c]!.map((nx) => (
                              <button
                                key={nx}
                                disabled={pending}
                                onClick={() => go(() => act.setSponsorStatus(event.id, s.id, nx))}
                                className="rounded-md border border-d-line px-1.5 py-0.5 text-[10.5px] whitespace-nowrap text-d-ink2 transition-colors hover:border-white/30 hover:text-d-ink"
                              >
                                → {nx}
                              </button>
                            ))}
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <AnimatePresence>
          {open && sponsors.find((s) => s.id === open)?.pitch_body && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.3, ease }} className="mt-4 rounded-xl border border-d-line bg-black/25 p-5">
              <Pitch key={open} eventId={event.id} s={sponsors.find((x) => x.id === open)!} onClose={() => setOpen(null)} />
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      <Suggestions event={event} />
      <PastPartners eventId={event.id} alumni={alumni.filter((a) => !sponsors.some((s) => s.company === a.company))} />

      <Card title="Add sponsor leads" sub="One company per line — the agent drafts a pitch for each new lead">
        <AddLines label="Company, email" placeholder="Atlassian, university@atlassian.com" onAdd={(t) => act.addLeads(event.id, t)} demo={DEMO_LEADS} />
      </Card>
    </div>
  );
}

/** Companies that confirmed for earlier events — one click invites them back as a lead (their email is on file). */
function PastPartners({ eventId, alumni }: { eventId: string; alumni: Alum[] }) {
  const [pending, go] = useAction();
  if (!alumni.length) return null;
  return (
    <Card title="Partnered before" sub="Sponsors from your past events who aren't on this one yet" action={<Link href="/dashboard/sponsors" className="text-[12.5px] text-d-ink2 hover:text-d-ink">Sponsor directory →</Link>}>
      <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {alumni.map((a) => (
          <li key={a.company} className="flex items-center gap-3 rounded-xl border border-d-line bg-black/20 p-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/[0.06] text-[12px] font-semibold">{a.company.split(" ").map((w) => w[0]).slice(0, 2).join("")}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13.5px] font-medium">{a.company}</span>
              <span className="block truncate text-[11.5px] text-d-ink3">{a.times > 1 ? `${a.times} events · ` : ""}last: {a.tier} at {a.event}</span>
            </span>
            <button disabled={pending} onClick={() => go(() => act.addLeads(eventId, `${a.company}, ${a.email}`))} className="shrink-0 rounded-md border border-d-line px-2.5 py-1 text-[12px] transition-colors hover:border-s1/50 hover:bg-s1/10 disabled:opacity-40">+ Lead</button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Real companies the agent recommended. Accepting one needs a contact email; then it's an ordinary lead. */
function Suggestions({ event }: { event: EventRow }) {
  const list = event.plan?.suggestions ?? [];
  return (
    <Card title="Recommended by the agent" sub={list.length ? "Real companies that fit this event. Add a contact email to turn one into a lead." : undefined}>
      {list.length ? (
        <ul className="grid gap-2 md:grid-cols-2">
          <AnimatePresence initial={false}>
            {list.map((s, i) => <Suggestion key={s.company} eventId={event.id} s={s} i={i} />)}
          </AnimatePresence>
        </ul>
      ) : (
        <Empty>Run the Sponsorship agent — it recommends 8 companies that fit this event.</Empty>
      )}
    </Card>
  );
}

function Suggestion({ eventId, s, i }: { eventId: string; s: NonNullable<NonNullable<EventRow["plan"]>["suggestions"]>[number]; i: number }) {
  const [email, setEmail] = useState("");
  const [open, setOpen] = useState(false);
  const [pending, go] = useAction();
  return (
    <motion.li layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.35, ease, delay: i * 0.04 }} className="rounded-xl border border-d-line bg-black/20 p-3.5">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full border border-s4/40 text-[12px] font-semibold tabular-nums text-d-ink" style={{ background: `conic-gradient(var(--s4) ${s.fit_score * 3.6}deg, transparent 0)` }}>
          <span className="grid size-8 place-items-center rounded-full bg-d-panel">{s.fit_score}</span>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[14px] font-medium">{s.company}</span>
            <span className="shrink-0 text-[11px] text-d-ink3">{s.tier}</span>
          </div>
          <p className="mt-0.5 text-[12.5px] leading-snug text-d-ink2">{s.why}</p>
        </div>
      </div>
      {open ? (
        <form className="mt-3 flex gap-2" onSubmit={(e) => (e.preventDefault(), go(() => act.acceptSuggestion(eventId, s.company, email)))}>
          <input autoFocus type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={`partnerships@${s.company.split(" ")[0].toLowerCase()}.com`} aria-label={`Contact email for ${s.company}`}
            className="h-9 min-w-0 flex-1 rounded-lg border border-d-line bg-black/30 px-3 text-[13px] text-d-ink outline-none placeholder:text-d-ink3 focus:border-white/25" />
          <Button pending={pending} disabled={!email}>Add lead</Button>
        </form>
      ) : (
        <div className="mt-3 flex justify-end gap-1.5">
          <button disabled={pending} onClick={() => go(() => act.dismissSuggestion(eventId, s.company))} className="rounded-md px-2 py-1 text-[12px] text-d-ink3 transition-colors hover:text-d-ink">Dismiss</button>
          <button onClick={() => setOpen(true)} className="rounded-md border border-d-line px-2.5 py-1 text-[12px] text-d-ink transition-colors hover:border-s1/50 hover:bg-s1/10">+ Add contact</button>
        </div>
      )}
    </motion.li>
  );
}

function Pitch({ eventId, s, onClose }: { eventId: string; s: Sponsor; onClose: () => void }) {
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(s.pitch_subject ?? "");
  const [body, setBody] = useState(s.pitch_body ?? "");
  const [pending, go] = useAction();
  const draft = s.status === "drafted";
  const field = "w-full rounded-lg border border-d-line bg-black/30 px-3 py-2 text-d-ink outline-none focus:border-white/25";

  return (
    <>
      <div className="flex items-baseline justify-between gap-4">
        <div className="min-w-0 truncate text-[12px] text-d-ink3">
          To {s.company} · {s.contact_email}
        </div>
        <div className="flex shrink-0 gap-4 text-[12.5px]">
          {draft && !editing && <button onClick={() => setEditing(true)} className="text-s1 hover:brightness-125">Edit</button>}
          <button onClick={onClose} className="text-d-ink3 hover:text-d-ink">Close</button>
        </div>
      </div>
      {editing ? (
        <div className="mt-3 max-w-3xl space-y-3">
          <input aria-label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} className={`${field} text-[15px] font-medium`} />
          <textarea aria-label="Message" rows={10} value={body} onChange={(e) => setBody(e.target.value)} className={`${field} resize-y text-[13.5px] leading-relaxed`} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            <Button pending={pending} onClick={() => go(() => act.updatePitch(eventId, s.id, subject, body), () => setEditing(false))}>Save pitch</Button>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-2 text-[16px] font-medium">{s.pitch_subject}</div>
          <p className="mt-3 max-w-3xl text-[13.5px] leading-relaxed whitespace-pre-wrap text-d-ink2">{s.pitch_body}</p>
        </>
      )}
    </>
  );
}

// ───────────── 03 logistics ─────────────

function Logistics({ event, volunteers, tasks }: Data) {
  const [pending, go] = useAction();
  const open = tasks.filter((t) => !t.volunteer_id);
  const hours = tasks.reduce((s, t) => s + hrs(t), 0);
  const rows = [
    ...volunteers.map((v) => ({
      name: v.name,
      shifts: tasks.filter((t) => t.volunteer_id === v.id).map((t) => ({ title: t.title, start: Date.parse(t.starts_at), end: Date.parse(t.ends_at) })),
    })),
    ...(open.length ? [{ name: "Unassigned", open: true, shifts: open.map((t) => ({ title: t.title, start: Date.parse(t.starts_at), end: Date.parse(t.ends_at) })) }] : []),
  ];
  const load = volunteers
    .map((v) => ({ label: v.name, value: tasks.filter((t) => t.volunteer_id === v.id).reduce((s, t) => s + hrs(t), 0), note: v.skills || undefined }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Volunteers" value={volunteers.length} dot="bg-s1" />
        <Stat label="Shifts" value={tasks.length} hint={`${hours.toFixed(1)} hours of work`} />
        <Stat label="Clashes" value="0" hint="Guaranteed by the scheduler" dot="bg-good" />
        <Stat label="Open shifts" value={open.length} hint={open.length ? "Add volunteers to cover them" : "Everything covered"} dot={open.length ? "bg-s2" : undefined} />
      </div>

      <Card
        title="Run of show"
        sub={event.date ? `${longDate(event.date)} — hover a shift for details` : undefined}
        action={<Button variant="ghost" pending={pending} disabled={!tasks.length} onClick={() => go(() => act.emailVolunteers(event.id))}>Email volunteers their shifts</Button>}
      >
        {tasks.length ? <div className="overflow-x-auto"><div className="min-w-[640px]"><ShiftTimeline rows={rows} /></div></div> : <Empty>Add volunteers below (or use the demo list), then run the Logistics agent.</Empty>}
      </Card>

      <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
        <Card title="Hours per volunteer" sub="Load is balanced across the team">
          {load.length ? <BarList rows={load} format={(h) => `${h.toFixed(1)}h`} color="bg-s4" /> : <Empty>No volunteers yet.</Empty>}
        </Card>
        <Card title="Volunteers" sub={`${volunteers.length} on the team`}>
          <ul className="mb-5 divide-y divide-d-line">
            {volunteers.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
                <span className="flex items-center gap-2.5">
                  <span className="grid size-7 place-items-center rounded-full bg-white/[0.06] text-[11px] font-medium text-d-ink2">{v.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}</span>
                  {v.name}
                </span>
                <span className="truncate text-[12px] text-d-ink3">{v.skills || "—"}</span>
              </li>
            ))}
          </ul>
          <AddLines label="Name, email, skills — one per line" placeholder="Aditi, aditi@rit.edu, av, design" onAdd={(t) => act.addVolunteers(event.id, t)} demo={DEMO_VOLUNTEERS} />
        </Card>
      </div>
    </div>
  );
}

// ───────────── 04 comms ─────────────

function Comms({ event, attendees }: Data) {
  const [pending, go] = useAction();
  const [toggling, startToggle] = useTransition();
  const notify = useToast();
  const [q, setQ] = useState("");
  const checked = attendees.filter((a) => a.checked_in).length;
  const certs = attendees.filter((a) => a.certificate_sent).length;
  const comms = event.plan?.comms;
  const regUrl = `/e/${event.id}`;
  const needle = q.trim().toLowerCase();
  const shown = needle ? attendees.filter((a) => [a.name, a.email, a.usn ?? ""].some((f) => f.toLowerCase().includes(needle))) : attendees;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Registered" value={attendees.length} hint={event.expected_attendees ? `of ${event.expected_attendees} expected` : undefined} dot="bg-s1" />
        <Stat label="Checked in" value={checked} hint={<span className="block"><span className="mb-2 block">{attendees.length ? Math.round((checked / attendees.length) * 100) : 0}% turnout</span><Meter value={checked} max={attendees.length || 1} color="bg-s3" track="bg-s3/15" height="h-1.5" /></span>} dot="bg-s3" />
        <Stat label="Certificates sent" value={certs} hint={checked - certs > 0 ? `${checked - certs} pending` : "All sent"} />
        <Stat label="Announcement" value={comms ? "Ready" : "—"} hint={comms ? "Copy and share it" : "Run the Comms agent"} />
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
        <Card title="Registrations over time" sub="Cumulative sign-ups">
          <LineChart points={cumulative(attendees)} label="registered" />
        </Card>
        <Card title="Share" sub="Public registration page">
          <a href={regUrl} target="_blank" className="block truncate rounded-lg border border-d-line bg-black/25 px-3 py-2 font-mono text-[12px] text-d-ink2 hover:text-d-ink">{regUrl}</a>
          {comms ? (
            <div className="mt-4">
              <div className="flex items-center justify-between">
                <Label>Announcement</Label>
                <button className="text-[12px] text-s1 hover:brightness-125" onClick={() => navigator.clipboard.writeText(comms.announcement.replace("{link}", location.origin + regUrl)).then(() => notify(true, "Announcement copied"))}>Copy</button>
              </div>
              <p className="mt-2 text-[13px] leading-relaxed whitespace-pre-wrap text-d-ink2">{comms.announcement.replace("{link}", regUrl)}</p>
            </div>
          ) : (
            <div className="mt-4"><Empty>Run the Comms agent to draft the announcement.</Empty></div>
          )}
        </Card>
      </div>

      <Card
        title="Attendees & check-in"
        sub="Tick people in at the door. Certificates go to everyone checked in."
        action={
          <div className="flex gap-2">
            <Button variant="ghost" pending={pending} disabled={!attendees.length || !comms} onClick={() => go(() => act.sendReminders(event.id))}>Send reminder</Button>
            <Button variant="accent" pending={pending} disabled={!checked} onClick={() => go(() => act.sendCertificates(event.id))}>Email certificates</Button>
          </div>
        }
      >
        {attendees.length ? (
          <>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email or USN…" aria-label="Search attendees" className="mb-3 h-10 w-full rounded-lg border border-d-line bg-black/30 px-3.5 text-[13.5px] text-d-ink outline-none transition-colors placeholder:text-d-ink3 focus:border-white/25" />
            {needle && !shown.length && <Empty>No one matches “{q}”.</Empty>}
            <ul className="max-h-[420px] divide-y divide-d-line overflow-y-auto">
              {shown.map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-2.5 text-[13px]">
                  <input
                    type="checkbox"
                    aria-label={`Check in ${a.name}`}
                    checked={a.checked_in}
                    disabled={toggling}
                    onChange={(e) =>
                      startToggle(async () => {
                        try {
                          await act.setCheckedIn(event.id, a.id, e.target.checked);
                        } catch (err) {
                          notify(false, err instanceof Error ? err.message : "Check-in failed");
                        }
                      })
                    }
                    className="size-4 accent-[#0aac23]"
                  />
                  <span className="flex-1 truncate">{a.name}</span>
                  <span className="hidden text-[12px] tabular-nums text-d-ink3 sm:inline">{a.usn}</span>
                  <span className="hidden truncate text-[12px] text-d-ink3 md:inline">{a.email}</span>
                  {a.certificate_sent && <span className="rounded-md bg-good/15 px-1.5 py-0.5 text-[10.5px] text-good">cert sent</span>}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <Empty>No registrations yet — share the link above.</Empty>
        )}
      </Card>
    </div>
  );
}

// ───────────── 05 reporting ─────────────

function Reporting({ event, attendees, sponsors }: Data) {
  const [pending, go] = useAction();
  const free = isFree(event);
  const checked = attendees.filter((a) => a.checked_in).length;
  const confirmed = sponsors.filter((s) => s.status === "confirmed");
  const amt = (s: Sponsor) => event.plan?.tiers?.find((t) => t.name === s.tier)?.amount ?? 0;
  const raised = confirmed.reduce((sum, s) => sum + amt(s), 0);
  const rate = attendees.length ? Math.round((checked / attendees.length) * 100) : 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Attended" value={checked} hint={`of ${attendees.length} registered`} dot="bg-s3" />
        <Stat label="Attendance rate" value={`${rate}%`} hint={<Meter value={checked} max={attendees.length || 1} color="bg-s3" track="bg-s3/15" height="h-1.5" />} />
        {free ? (
          <>
            <Stat label="Seats filled" value={event.expected_attendees ? `${Math.round((attendees.length / event.expected_attendees) * 100)}%` : "—"} hint={`${attendees.length} of ${event.expected_attendees ?? "?"} seats`} dot="bg-s2" />
            <Stat label="Certificates" value={attendees.filter((a) => a.certificate_sent).length} hint="Sent to checked-in attendees" />
          </>
        ) : (
          <>
            <Stat label="Partners" value={confirmed.length} dot="bg-s2" />
            <Stat label="Sponsorship" value={inr(raised)} hint={event.budget ? `${Math.round((raised / event.budget) * 100)}% of the budget` : undefined} />
          </>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <Card title={free ? "Event report" : "Partner report"} sub="Written by the Reporting agent from real numbers">
          {event.summary ? <p className="text-[14.5px] leading-[1.75] whitespace-pre-wrap text-d-ink">{event.summary}</p> : <Empty>Run the Reporting agent after the event.</Empty>}
        </Card>
        <div className="space-y-3">
          {!free && (
            <Card title="Partner contributions" sub="Confirmed sponsors by tier amount">
              {confirmed.length ? <BarList rows={confirmed.map((s) => ({ label: s.company, value: amt(s), note: s.tier ?? undefined }))} format={inr} color="bg-s2" /> : <Empty>No confirmed partners yet.</Empty>}
            </Card>
          )}
          <Card title="Deliver">
            <div className="flex flex-col gap-2">
              <a href={`/api/report/${event.id}`} target="_blank" className="inline-flex h-9 items-center justify-center rounded-lg border border-d-line bg-white/[0.03] text-[13px] font-medium transition-colors hover:bg-white/[0.07]">
                Open report PDF
              </a>
              {!free && (
                <Button variant="accent" pending={pending} disabled={!event.summary || !confirmed.length} onClick={() => go(() => act.sendReport(event.id))}>
                  Email report to {confirmed.length} partner{confirmed.length === 1 ? "" : "s"}
                </Button>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
