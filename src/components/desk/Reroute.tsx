"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import * as act from "@/app/actions";
import type { Disruption, Reroute as Result, Run, Sponsor, Task, Volunteer } from "@/lib/types";
import { Button, Card, Empty, Stat, ease, useToast } from "./ui";
import { VolunteerCard } from "./VolunteerCard";
import { Why } from "./Why";

type EventPick = { id: string; name: string | null; date: string | null };
type Props = { eventId: string; events: EventPick[]; volunteers: Volunteer[]; tasks: Task[]; sponsors: Sponsor[]; runs: Run[]; free: boolean };
type Kind = Disruption["kind"];

const field =
  "mt-2 h-10 w-full rounded-xl border border-d-line bg-black/30 px-3.5 text-[13px] text-d-ink outline-none transition-colors placeholder:text-d-ink3 focus:border-white/25";
const ROLE = { volunteer: "Volunteer", attendee: "Attendee", organiser: "Organiser" } as const;

/** Campus Chaos Re-Router: fire a live disruption, see exactly which records changed and who was told. */
export function Reroute({ eventId, events, volunteers, tasks, sponsors, runs, free }: Props) {
  const router = useRouter();
  const history = runs.filter((r) => r.agent === "rerouter" && r.output);
  const [pick, setPick] = useState<string | null>(null);
  const shown = history.find((r) => r.id === pick) ?? history[0];

  return (
    <div className="space-y-3">
      <div className="mb-7">
        <div className="flex items-center gap-2 text-[12.5px] text-d-ink3">
          <span className="size-1.5 animate-pulse rounded-full bg-crit" /> Live · Campus Chaos Re-Router
        </div>
        <h1 className="mt-2 text-[clamp(1.75rem,3.2vw,2.4rem)] leading-[1.1] font-semibold tracking-[-0.025em]">Something just changed?</h1>
        <label className="mt-4 flex max-w-md items-center gap-3 text-[12.5px] text-d-ink2">
          <span className="shrink-0">Event</span>
          <select
            value={eventId}
            onChange={(e) => router.push(`/dashboard/${e.target.value}?s=reroute`)}
            className="h-9 min-w-0 flex-1 rounded-lg border border-d-line bg-black/30 px-3 text-[13px] text-d-ink outline-none focus:border-white/25"
          >
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name ?? "Untitled event"}
                {e.date ? ` · ${new Date(e.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : ""}
                {e.date && e.date < new Date().toISOString().slice(0, 10) ? " (past)" : ""}
              </option>
            ))}
          </select>
        </label>
        <p className="mt-3 max-w-2xl text-[14px] text-d-ink2">
          Trigger a last-minute disruption. Relay recomputes only the records it touches, leaves everything else alone, and emails each affected person a before → after of what changed for them.
        </p>
      </div>

      <Trigger eventId={eventId} volunteers={volunteers} tasks={tasks} sponsors={sponsors} free={free} onDone={() => setPick(null)} />

      {shown ? <Diff r={shown.output as Result} /> : <Card title="Last disruption"><Empty>No disruptions yet. Trigger one above.</Empty></Card>}

      {history.length > 1 && (
        <Card title="Earlier disruptions">
          <ul className="divide-y divide-d-line">
            {history.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => setPick(r.id)} className={`flex w-full items-center justify-between gap-3 py-2.5 text-left text-[13px] ${r.id === shown?.id ? "text-d-ink" : "text-d-ink2 hover:text-d-ink"}`}>
                  <span className="truncate">{r.summary}</span>
                  <span className="shrink-0 text-[12px] text-d-ink3">{new Date(r.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Trigger({ eventId, volunteers, tasks, sponsors, free, onDone }: Omit<Props, "runs" | "events"> & { onDone: () => void }) {
  const kinds: { id: Kind; label: string }[] = [
    { id: "volunteer_out", label: "Volunteer drops out" },
    { id: "venue_change", label: "Venue / time change" },
    ...(free ? [] : [{ id: "sponsor_out" as const, label: "Sponsor pulls out" }]),
  ];
  const [kind, setKind] = useState<Kind>("volunteer_out");
  const [vol, setVol] = useState("");
  const [venue, setVenue] = useState("");
  const [from, setFrom] = useState("");
  const [minutes, setMinutes] = useState("");
  const [sponsor, setSponsor] = useState("");
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [asking, startAsk] = useTransition();
  const notify = useToast();

  const shifts = (id: string) => tasks.filter((t) => t.volunteer_id === id).length;
  const live = sponsors.filter((s) => s.status !== "declined");
  const ready = kind === "volunteer_out" ? !!vol : kind === "sponsor_out" ? !!sponsor : !!venue.trim() || !!Number(minutes);
  const done = (r: { ok: boolean; message: string }) => {
    notify(r.ok, r.message);
    if (!r.ok) return;
    onDone();
    setVol("");
    setSponsor("");
    setText("");
  };
  const fire = () =>
    start(async () => {
      const d: Disruption =
        kind === "volunteer_out"
          ? { kind, volunteerId: vol }
          : kind === "sponsor_out"
            ? { kind, sponsorId: sponsor }
            : { kind, venue: venue.trim() || undefined, from: from || undefined, minutes: Number(minutes) || 0 };
      done(await act.triggerDisruption(eventId, d));
    });

  return (
    <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
      <Card title="Disruption trigger" sub="Pick what broke">
        <div role="tablist" className="mb-4 flex flex-wrap gap-1.5">
          {kinds.map((k) => (
            <button
              key={k.id}
              type="button"
              role="tab"
              aria-selected={kind === k.id}
              onClick={() => setKind(k.id)}
              className={`h-8 rounded-lg border px-3 text-[12.5px] transition-colors ${kind === k.id ? "border-white/20 bg-white/[0.08] text-d-ink" : "border-d-line text-d-ink2 hover:text-d-ink"}`}
            >
              {k.label}
            </button>
          ))}
        </div>

        {kind === "volunteer_out" && (
          <label className="block text-[12.5px] text-d-ink2">
            Who can&apos;t make it?
            <select value={vol} onChange={(e) => setVol(e.target.value)} className={field}>
              <option value="">Choose a volunteer…</option>
              {volunteers.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} — {shifts(v.id)} shift{shifts(v.id) === 1 ? "" : "s"}
                </option>
              ))}
            </select>
          </label>
        )}
        {kind === "volunteer_out" && vol && (
          <div className="mt-3">
            <VolunteerCard v={volunteers.find((v) => v.id === vol)!} tasks={tasks} note="These shifts will be re-routed" />
          </div>
        )}
        {kind === "venue_change" && (
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-[12.5px] text-d-ink2 sm:col-span-3">
              New venue <span className="text-d-ink3">(leave empty if unchanged)</span>
              <input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="e.g. ESB Seminar Hall 2" className={field} />
            </label>
            <label className="block text-[12.5px] text-d-ink2">
              Shift everything from
              <input type="time" value={from} onChange={(e) => setFrom(e.target.value)} className={field} />
            </label>
            <label className="block text-[12.5px] text-d-ink2 sm:col-span-2">
              By how many minutes <span className="text-d-ink3">(negative = earlier)</span>
              <input type="number" step={15} value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="60" className={field} />
            </label>
          </div>
        )}
        {kind === "sponsor_out" && (
          <label className="block text-[12.5px] text-d-ink2">
            Which sponsor pulled out?
            <select value={sponsor} onChange={(e) => setSponsor(e.target.value)} className={field}>
              <option value="">Choose a sponsor…</option>
              {live.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.company} — {s.status}
                  {s.tier ? ` · ${s.tier}` : ""}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="mt-4 flex justify-end">
          <Button variant="accent" pending={pending} disabled={!ready || asking} onClick={fire}>
            Trigger disruption
          </Button>
        </div>
      </Card>

      <Card title="Or just say it" sub="Gemini reads it and picks the trigger">
        <textarea
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          placeholder="Seminar Hall B is flooded — move to the Apex auditorium and push everything after 2pm by an hour"
          className="w-full resize-y rounded-xl border border-d-line bg-black/30 px-3.5 py-3 text-[13px] leading-relaxed text-d-ink outline-none transition-colors placeholder:text-d-ink3 focus:border-white/25"
        />
        <div className="mt-2 flex justify-end">
          <Button variant="ghost" pending={asking} disabled={!text.trim() || pending} onClick={() => startAsk(async () => done(await act.describeDisruption(eventId, text)))}>
            Re-route
          </Button>
        </div>
      </Card>
    </div>
  );
}

function Diff({ r }: { r: Result }) {
  const roles = (["volunteer", "attendee", "organiser"] as const).map((k) => [k, r.alerts.filter((a) => a.role === k).length] as const).filter(([, n]) => n);
  const touched = r.changes.filter((c) => c.record !== "Venue" && c.record !== "Confirmed sponsorship").length;
  return (
    <AnimatePresence mode="wait">
      <motion.div key={r.headline + r.changes.length} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease }} className="space-y-3">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Records changed" value={r.changes.length} dot="bg-crit" hint={r.headline} />
          <Stat label="Untouched" value={Math.max(0, r.total - touched)} dot="bg-good" hint={`of ${r.total} ${r.scope}`} />
          <Stat label="People alerted" value={r.alerts.length} hint={roles.map(([k, n]) => `${n} ${ROLE[k].toLowerCase()}${n === 1 ? "" : "s"}`).join(" · ") || "Nobody affected"} />
          <Stat label="Emails sent" value={r.emailed} hint={r.failed ? `${r.failed} failed` : "All handed to Gmail"} dot={r.failed ? "bg-s2" : undefined} />
        </div>

        <Card title="Before → after" sub="Only these records were recomputed">
          {r.changes.length ? (
            <ul className="divide-y divide-d-line">
              {r.changes.map((c, i) => (
                <li key={i} className="grid gap-1 py-2.5 text-[13px] sm:grid-cols-[1.3fr_1fr_auto_1fr] sm:items-center sm:gap-3">
                  <span className="flex min-w-0 items-center gap-2"><span className="truncate text-d-ink">{c.record}</span>{c.decision && <Why id={c.decision} />}</span>
                  <span className="truncate text-crit line-through decoration-crit/60">{c.before}</span>
                  <span aria-hidden className="hidden text-d-ink3 sm:block">→</span>
                  <span className={`truncate ${c.after.startsWith("Unassigned") ? "text-s2" : "text-good"}`}>
                    <span className="sr-only">now </span>
                    {c.after}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Nothing needed to change.</Empty>
          )}
        </Card>

        <Card title="Targeted alerts" sub="Each person was emailed only their own lines">
          {r.alerts.length ? (
            <ul className="divide-y divide-d-line">
              {r.alerts.map((a) => (
                <li key={a.email} className="py-2.5 text-[13px]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate text-d-ink">{a.name}</span>
                    <span className="shrink-0 rounded-md border border-d-line px-1.5 py-0.5 text-[11px] text-d-ink3">{ROLE[a.role]}</span>
                  </div>
                  <div className="mt-1 text-[12px] text-d-ink3">
                    {a.lines.map((l) => `${l.record}: ${l.before} → ${l.after}`).join(" · ")}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Nobody needed an alert.</Empty>
          )}
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}
