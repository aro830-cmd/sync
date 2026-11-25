import Link from "next/link";
import { agentsFor } from "@/lib/agents";
import { raised, type DeskEvent } from "@/lib/desk";
import { isFree } from "@/lib/types";
import { inr } from "@/lib/format";
import { Ring } from "./fx";

const short = (d: string) => new Date(d).toLocaleDateString("en-IN", { month: "short" }).toUpperCase();

/** Upcoming event card: date block, countdown, registrations ring, money or "free", agent progress. */
export function EventCard({ e, now }: { e: DeskEvent; now: number }) {
  const free = isFree(e);
  const days = e.date ? Math.ceil((Date.parse(e.date) - now) / 86_400_000) : null;
  const agents = agentsFor(free);
  const done = new Set(e.agent_runs.filter((r) => r.ok).map((r) => r.agent));
  const reg = e.attendees.length;
  const confirmed = e.sponsors.filter((s) => s.status === "confirmed").length;
  return (
    <Link
      href={`/dashboard/${e.id}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-d-line bg-d-panel p-5 transition-[border-color,transform,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:border-s1/40 hover:shadow-[0_30px_60px_-30px_rgba(236,100,38,.45)]"
    >
      <span aria-hidden className="pointer-events-none absolute -top-24 -right-24 size-48 rounded-full bg-s1/0 blur-3xl transition-colors duration-500 group-hover:bg-s1/20" />
      <div className="flex items-start gap-4">
        <div className="grid w-12 shrink-0 place-items-center rounded-xl border border-d-line bg-white/[0.03] py-1.5 text-center">
          <span className="text-[10px] font-medium tracking-[0.12em] text-s1">{e.date ? short(e.date) : "TBA"}</span>
          <span className="text-[20px] leading-none font-semibold tabular-nums">{e.date ? new Date(e.date).getDate() : "—"}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${free ? "bg-s3/15 text-s3" : "bg-s1/15 text-s1"}`}>{free ? "Free" : "Funded"}</span>
            {days != null && <span className="text-[11.5px] text-d-ink3">{days === 0 ? "Today" : days === 1 ? "Tomorrow" : `in ${days} days`}</span>}
          </div>
          <div className="mt-1.5 truncate text-[17px] leading-snug font-semibold tracking-[-0.01em]">{e.name ?? <span className="text-d-ink3">Planning…</span>}</div>
          <div className="truncate text-[12.5px] text-d-ink3">{e.venue ?? e.brief}</div>
        </div>
        <Ring value={reg} max={e.expected_attendees ?? reg} color="var(--s3)">{e.expected_attendees ? `${Math.min(100, Math.round((reg / e.expected_attendees) * 100))}%` : reg}</Ring>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2 border-t border-d-line pt-4">
        {[
          [free ? "Entry" : "Raised", free ? "Free" : inr(raised(e))],
          [free ? "Seats" : "Partners", free ? String(e.expected_attendees ?? "—") : `${confirmed}/${e.sponsors.length}`],
          ["Registered", `${reg}${e.expected_attendees ? `/${e.expected_attendees}` : ""}`],
        ].map(([l, v]) => (
          <div key={l}>
            <div className="text-[15px] font-medium tabular-nums">{v}</div>
            <div className="text-[11px] text-d-ink3">{l}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-1.5" aria-label={`${agents.filter((a) => done.has(a.id)).length} of ${agents.length} agents done`}>
        {agents.map((a) => (
          <span key={a.id} title={a.name} className={`h-1 flex-1 rounded-full transition-colors ${done.has(a.id) ? "bg-s1" : "bg-white/10"}`} />
        ))}
        <span className="ml-2 text-[11px] tabular-nums text-d-ink3">{agents.filter((a) => done.has(a.id)).length}/{agents.length}</span>
      </div>
    </Link>
  );
}
