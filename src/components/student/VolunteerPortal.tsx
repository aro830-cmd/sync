"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { applyForRole, confirmCompletion, respondToRole, saveMyProfile } from "@/app/actions";
import { ROLES } from "@/lib/roster";
import type { MissionRole, VolunteerProfile } from "@/lib/types";

export type PortalData = {
  name: string;
  profile: VolunteerProfile | null;
  roles: MissionRole[];
  events: { id: string; name: string; date: string | null; venue: string | null }[];
  filled: string[];
  requests: { id: string; event_id: string; role_key: string; status: string; reason: string | null; event: string }[];
  shifts: { title: string; starts_at: string; ends_at: string; event: string }[];
  feedback: { kind: string; note: string | null; event: string | null }[];
  rewards: { kind: string; status: string; event: string | null }[];
};

const display = "font-[family-name:var(--font-archivo)] font-black uppercase [font-stretch:125%] tracking-[-0.025em]";
const kicker = "font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3";
const chip = (on: boolean) => `h-8 rounded-full border px-3 text-[13px] transition-colors ${on ? "border-signal bg-signal/15 text-ink" : "border-line text-ink-2 hover:border-ink"}`;
const field = "h-11 w-full rounded-xl border border-line bg-paper-2/40 px-3.5 text-[14px] text-ink outline-none focus:border-ink";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const REWARDS = ["certificate", "meal", "merch", "reimbursement", "recommendation", "mentor_session", "priority_access"];
const nice = (s: string) => s.replace(/_/g, " ");
const hm = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) router.refresh();
    });
  return [pending, run, msg] as const;
}

export function VolunteerPortal({ d }: { d: PortalData }) {
  const opted = !!d.profile?.opted_in;
  return (
    <>
      <p className={kicker}>Volunteer with the club</p>
      <h1 className={`mt-4 text-[clamp(2.2rem,5vw,3.6rem)] leading-[0.92] ${display}`}>{opted ? `Thanks, ${d.name.split(" ")[0]}.` : "Want to help run events?"}</h1>
      <p className="mt-4 max-w-2xl text-[15px] text-ink-2">
        Tell us what you like doing and when you&apos;re free. Organisers only see what you put here, and suggestions are based only on these answers — never on anything personal. You can opt out any time.
      </p>
      <ProfileForm d={d} />
      {opted && (
        <>
          <MyRoles d={d} />
          <OpenRoles d={d} />
          <History d={d} />
        </>
      )}
    </>
  );
}

function ProfileForm({ d }: { d: PortalData }) {
  const p = d.profile;
  const [f, setF] = useState({
    skills: p?.skills ?? [],
    preferred_roles: p?.preferred_roles ?? [],
    availability: p?.availability ?? [],
    available: p?.available ?? true,
    learning_goals: p?.learning_goals ?? "",
    reward_prefs: p?.reward_prefs ?? [],
    languages: p?.languages ?? [],
    accessibility_needs: p?.accessibility_needs ?? "",
    opted_in: p?.opted_in ?? true,
  });
  const [slot, setSlot] = useState({ weekday: 6, from: "09:00", to: "17:00" });
  const [pending, run, msg] = useRun();
  const toggle = (k: "skills" | "preferred_roles" | "reward_prefs", v: string) => setF((x) => ({ ...x, [k]: x[k].includes(v) ? x[k].filter((y) => y !== v) : [...x[k], v] }));

  return (
    <section className="mt-12 rounded-3xl border border-line p-6 md:p-8">
      <h2 className={kicker}>{p ? "Your volunteer profile" : "Create your volunteer profile"}</h2>

      <div className="mt-6">
        <div className="text-[14px] font-medium">Roles you&apos;d like</div>
        <div className="mt-2 flex flex-wrap gap-1.5">{d.roles.map((r) => <button key={r.key} type="button" aria-pressed={f.preferred_roles.includes(r.key)} onClick={() => toggle("preferred_roles", r.key)} className={chip(f.preferred_roles.includes(r.key))}>{r.name}</button>)}</div>
      </div>
      <div className="mt-6">
        <div className="text-[14px] font-medium">Skills</div>
        <div className="mt-2 flex flex-wrap gap-1.5">{[...new Set([...ROLES.map((r) => r.skill), "communication"])].map((s) => <button key={s} type="button" aria-pressed={f.skills.includes(s)} onClick={() => toggle("skills", s)} className={chip(f.skills.includes(s))}>{s}</button>)}</div>
      </div>

      <div className="mt-6">
        <div className="text-[14px] font-medium">When you&apos;re usually free</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {f.availability.map((s, i) => (
            <span key={i} className="inline-flex h-8 items-center gap-2 rounded-full border border-line px-3 text-[13px]">
              {s.date ?? DAYS[s.weekday ?? 0]} {s.from}–{s.to}
              <button type="button" aria-label="Remove slot" onClick={() => setF((x) => ({ ...x, availability: x.availability.filter((_, j) => j !== i) }))} className="text-ink-3 hover:text-ink">✕</button>
            </span>
          ))}
          {!f.availability.length && <span className="text-[13px] text-ink-3">No slots yet — organisers will check times with you.</span>}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
          <select value={slot.weekday} onChange={(e) => setSlot({ ...slot, weekday: Number(e.target.value) })} aria-label="Day" className="h-9 rounded-lg border border-line bg-paper px-2">{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select>
          <input type="time" value={slot.from} onChange={(e) => setSlot({ ...slot, from: e.target.value })} aria-label="From" className="h-9 rounded-lg border border-line bg-paper px-2 [color-scheme:dark]" />
          <span className="text-ink-3">to</span>
          <input type="time" value={slot.to} onChange={(e) => setSlot({ ...slot, to: e.target.value })} aria-label="To" className="h-9 rounded-lg border border-line bg-paper px-2 [color-scheme:dark]" />
          <button type="button" onClick={() => setF((x) => ({ ...x, availability: [...x.availability, { ...slot }] }))} className="h-9 rounded-full border border-line px-4 hover:border-ink">+ Add slot</button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <label className="block text-[14px] font-medium">What you want to learn<input value={f.learning_goals} onChange={(e) => setF({ ...f, learning_goals: e.target.value })} placeholder="e.g. operations, event production" className={`${field} mt-2`} /></label>
        <label className="block text-[14px] font-medium">Languages you&apos;re happy to help in (optional)<input value={f.languages.join(", ")} onChange={(e) => setF({ ...f, languages: e.target.value.split(",") })} placeholder="e.g. English, Kannada, Hindi" className={`${field} mt-2`} /></label>
        <label className="block text-[14px] font-medium md:col-span-2">Anything we should arrange so you can take part? (optional, only organisers see it)<input value={f.accessibility_needs} onChange={(e) => setF({ ...f, accessibility_needs: e.target.value })} placeholder="e.g. seated role, step-free access" className={`${field} mt-2`} /></label>
      </div>
      <div className="mt-6">
        <div className="text-[14px] font-medium">Rewards you&apos;d value</div>
        <div className="mt-2 flex flex-wrap gap-1.5">{REWARDS.map((r) => <button key={r} type="button" aria-pressed={f.reward_prefs.includes(r)} onClick={() => toggle("reward_prefs", r)} className={chip(f.reward_prefs.includes(r))}>{nice(r)}</button>)}</div>
      </div>

      <div className="mt-6 flex flex-wrap gap-5 text-[14px]">
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.opted_in} onChange={(e) => setF({ ...f, opted_in: e.target.checked })} className="size-4 accent-[#ff5a1f]" />I want to volunteer (opt in)</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={f.available} onChange={(e) => setF({ ...f, available: e.target.checked })} className="size-4 accent-[#ff5a1f]" />Available for upcoming events</label>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button disabled={pending} onClick={() => run(() => saveMyProfile(f))} className="inline-flex h-11 items-center rounded-full bg-ink px-6 text-[14px] text-paper transition-transform duration-150 active:scale-[0.97] disabled:opacity-50">
          {pending ? "Saving…" : p ? "Save profile" : "Opt in & save"}
        </button>
        {msg && <span className={`text-[13px] ${msg.ok ? "text-ink-2" : "text-signal"}`}>{msg.text}</span>}
      </div>
    </section>
  );
}

function MyRoles({ d }: { d: PortalData }) {
  const [pending, run, msg] = useRun();
  const role = (k: string) => d.roles.find((r) => r.key === k);
  const mine = d.requests.filter((r) => r.status !== "suggested");
  return (
    <section className="mt-14">
      <h2 className={kicker}>My roles</h2>
      {mine.length ? (
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {mine.map((r) => {
            const applied = r.reason?.startsWith("Applied by");
            return (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-4 py-5">
                <div>
                  <div className="text-[18px] font-semibold tracking-[-0.01em]">{role(r.role_key)?.name ?? nice(r.role_key)}</div>
                  <div className="mt-1 text-[14px] text-ink-2">{r.event} · {role(r.role_key)?.expected_hours}h · reward: {role(r.role_key)?.reward}</div>
                  {r.status === "requested" && !applied && r.reason && <div className="mt-1 text-[13px] text-ink-3">{r.reason}</div>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {r.status === "requested" && !applied && (
                    <>
                      <button disabled={pending} onClick={() => run(() => respondToRole(r.id, true))} className="inline-flex h-9 items-center rounded-full bg-ink px-4 text-[13px] text-paper">Accept</button>
                      <button disabled={pending} onClick={() => run(() => respondToRole(r.id, false))} className="inline-flex h-9 items-center rounded-full border border-line px-4 text-[13px]">Decline</button>
                    </>
                  )}
                  {r.status === "requested" && applied && <span className="font-mono text-[11px] tracking-[0.14em] text-ink-2 uppercase">Applied · waiting</span>}
                  {r.status === "accepted" && <button disabled={pending} onClick={() => run(() => confirmCompletion(r.id))} className="inline-flex h-9 items-center rounded-full border border-line px-4 text-[13px] hover:border-ink">I&apos;ve completed this</button>}
                  {(r.status === "declined" || r.status === "completed") && <span className="font-mono text-[11px] tracking-[0.14em] text-ink-2 uppercase">{r.status}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-4 text-[15px] text-ink-2">No roles yet — apply for one below, or wait for an organiser to offer you one.</p>
      )}
      {msg && <p className={`mt-3 text-[13px] ${msg.ok ? "text-ink-2" : "text-signal"}`}>{msg.text}</p>}
    </section>
  );
}

function OpenRoles({ d }: { d: PortalData }) {
  const [pending, run, msg] = useRun();
  const filled = new Set(d.filled);
  const asked = new Set(d.requests.map((r) => `${r.event_id}:${r.role_key}`));
  return (
    <section className="mt-14">
      <h2 className={kicker}>Open roles</h2>
      {d.events.length ? (
        d.events.map((e) => {
          const open = d.roles.filter((r) => !filled.has(`${e.id}:${r.key}`));
          return (
            <div key={e.id} className="mt-5">
              <div className="text-[16px] font-semibold">{e.name} <span className="text-[13px] font-normal text-ink-3">· {e.date ? new Date(e.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "TBA"}</span></div>
              <ul className="mt-2 grid gap-2 md:grid-cols-2">
                {open.map((r) => (
                  <li key={r.key} className="flex items-start justify-between gap-3 rounded-2xl border border-line p-4">
                    <div>
                      <div className="text-[15px] font-medium">{r.name}</div>
                      <div className="mt-0.5 text-[12.5px] text-ink-2">{r.responsibilities}</div>
                      <div className="mt-1 text-[12px] text-ink-3">{r.expected_hours}h · learn: {r.learning_outcomes} · {r.reward}</div>
                    </div>
                    {asked.has(`${e.id}:${r.key}`) ? (
                      <span className="shrink-0 font-mono text-[10.5px] tracking-[0.12em] text-ink-3 uppercase">Applied</span>
                    ) : (
                      <button disabled={pending} onClick={() => run(() => applyForRole(e.id, r.key))} className="h-8 shrink-0 rounded-full border border-line px-3 text-[12.5px] hover:border-ink">Apply</button>
                    )}
                  </li>
                ))}
                {!open.length && <li className="text-[14px] text-ink-3">All roles are filled.</li>}
              </ul>
            </div>
          );
        })
      ) : (
        <p className="mt-4 text-[15px] text-ink-2">No upcoming events right now.</p>
      )}
      {msg && <p className={`mt-3 text-[13px] ${msg.ok ? "text-ink-2" : "text-signal"}`}>{msg.text}</p>}
    </section>
  );
}

function History({ d }: { d: PortalData }) {
  return (
    <section className="mt-14 grid gap-10 md:grid-cols-3">
      <div>
        <h2 className={kicker}>My shifts</h2>
        {d.shifts.length ? (
          <ul className="mt-3 space-y-2 text-[14px]">{d.shifts.map((s, i) => <li key={i}><span className="tabular-nums text-ink-3">{hm(s.starts_at)}–{hm(s.ends_at)}</span> {s.title}<div className="text-[12px] text-ink-3">{s.event}</div></li>)}</ul>
        ) : (
          <p className="mt-3 text-[14px] text-ink-3">No shifts assigned.</p>
        )}
      </div>
      <div>
        <h2 className={kicker}>Rewards</h2>
        {d.rewards.length ? (
          <ul className="mt-3 space-y-2 text-[14px]">{d.rewards.map((r, i) => <li key={i} className="capitalize">{nice(r.kind)} <span className={`text-[12px] ${r.status === "delivered" ? "text-signal" : "text-ink-3"}`}>· {r.status}</span>{r.event && <div className="text-[12px] text-ink-3 normal-case">{r.event}</div>}</li>)}</ul>
        ) : (
          <p className="mt-3 text-[14px] text-ink-3">Complete a role to earn rewards.</p>
        )}
      </div>
      <div>
        <h2 className={kicker}>Feedback for you</h2>
        {d.feedback.length ? (
          <ul className="mt-3 space-y-2 text-[14px]">{d.feedback.map((f, i) => <li key={i} className="capitalize">{nice(f.kind)}{f.note && <span className="normal-case text-ink-2"> — {f.note}</span>}{f.event && <div className="text-[12px] text-ink-3 normal-case">{f.event}</div>}</li>)}</ul>
        ) : (
          <p className="mt-3 text-[14px] text-ink-3">Nothing yet. If something here looks wrong, tell an organiser — they can correct it.</p>
        )}
      </div>
    </section>
  );
}
