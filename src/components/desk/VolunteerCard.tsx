"use client";

import type { Task, Volunteer } from "@/lib/types";
import { Why } from "./Why";

const hm = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });
const initials = (name: string) => name.split(" ").map((p) => p[0]).slice(0, 2).join("");

/** A volunteer's profile with their shifts. `note` labels the shift list (e.g. "These shifts will be re-routed"). */
export function VolunteerCard({ v, tasks, note = "Shifts", onClose }: { v: Volunteer; tasks: Task[]; note?: string; onClose?: () => void }) {
  const p = v.profile ?? {};
  const mine = tasks.filter((t) => t.volunteer_id === v.id);
  const hours = mine.reduce((s, t) => s + (Date.parse(t.ends_at) - Date.parse(t.starts_at)) / 3_600_000, 0);
  const facts = [
    p.dept && ["Department", p.dept],
    p.year && ["Year", `${p.year}${["st", "nd", "rd"][p.year - 1] ?? "th"} year`],
    p.availability && ["Available", p.availability],
    p.events_helped != null && ["Events helped", String(p.events_helped)],
  ].filter(Boolean) as [string, string][];

  return (
    <div className="rounded-xl border border-d-line bg-black/20 p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-s1 to-s5 text-[14px] font-semibold text-white">{initials(v.name)}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <div className="truncate text-[15px] font-medium text-d-ink">{v.name}</div>
            {onClose && <button type="button" onClick={onClose} className="shrink-0 text-[12.5px] text-d-ink3 hover:text-d-ink">Close</button>}
          </div>
          <div className="mt-0.5 truncate text-[12px] text-d-ink3">
            {v.email}
            {p.phone && ` · ${p.phone}`}
          </div>
          {v.skills && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {v.skills.split(",").map((s) => s.trim()).filter(Boolean).map((s) => (
                <span key={s} className="rounded-md border border-d-line bg-white/[0.04] px-1.5 py-0.5 text-[11px] text-d-ink2">{s}</span>
              ))}
            </div>
          )}
        </div>
      </div>
      {p.bio && <p className="mt-3 text-[13px] leading-relaxed text-d-ink2">{p.bio}</p>}
      {facts.length > 0 && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
          {facts.map(([k, val]) => (
            <div key={k}>
              <dt className="text-[11px] text-d-ink3">{k}</dt>
              <dd className="text-[13px] text-d-ink">{val}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="mt-4 text-[11px] font-medium uppercase tracking-[0.08em] text-d-ink3">
        {note} · {mine.length} · {hours.toFixed(1)}h
      </div>
      {mine.length ? (
        <ul className="mt-1.5 divide-y divide-d-line">
          {mine.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-[13px]">
              <span className="flex min-w-0 items-center gap-2"><span className="truncate text-d-ink">{t.title}</span><Why subject={t.id} /></span>
              <span className="shrink-0 tabular-nums text-d-ink3">{hm(t.starts_at)}–{hm(t.ends_at)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1.5 text-[12.5px] text-d-ink3">No shifts.</p>
      )}
    </div>
  );
}
