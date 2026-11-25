"use client";

// Small SVG/HTML charts for the desk. Marks follow the dataviz spec: thin bars with 4px rounded data-ends,
// 2px gaps between touching fills, 2px lines, >=8px end dots with a surface ring, hairline grid,
// text in text tokens (never series colour), hover tooltip on every mark.

import { motion } from "motion/react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ease } from "./ui";

export const SERIES = ["bg-s1", "bg-s2", "bg-s3", "bg-s4", "bg-s5"];
const SERIES_VAR = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)"];
const OTHER = "#5b5b61";

import { inr } from "@/lib/format";
export { inr };
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

// ───────── tooltip ─────────

type Tip = { x: number; y: number; body: ReactNode } | null;

export function useTip() {
  const box = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip>(null);
  const show = (e: React.MouseEvent | React.FocusEvent, body: ReactNode) => {
    const r = box.current!.getBoundingClientRect();
    const t = (e.currentTarget as Element).getBoundingClientRect();
    const x = "clientX" in e ? e.clientX : t.left + t.width / 2;
    setTip({ x: x - r.left, y: t.top - r.top, body });
  };
  return { box, tip, show, hide: () => setTip(null) };
}

export function TipLayer({ tip }: { tip: Tip }) {
  if (!tip) return null;
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-[calc(100%+8px)] rounded-lg border border-d-line bg-d-raise px-2.5 py-1.5 text-[12px] whitespace-nowrap text-d-ink shadow-[0_10px_30px_-8px_rgba(0,0,0,.8)]"
      style={{ left: tip.x, top: tip.y }}
    >
      {tip.body}
    </div>
  );
}

export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

// ───────── meter: one ratio against a limit ─────────

export function Meter({ value, max, color = "bg-s1", track = "bg-s1/15", height = "h-2" }: { value: number; max: number; color?: string; track?: string; height?: string }) {
  const p = Math.min(100, pct(value, max));
  return (
    <div className={`${height} w-full overflow-hidden rounded-full ${track}`} role="meter" aria-valuenow={value} aria-valuemax={max} aria-valuemin={0}>
      <motion.div className={`h-full rounded-full ${color}`} initial={{ width: 0 }} animate={{ width: `${p}%` }} transition={{ duration: 0.8, ease }} />
    </div>
  );
}

// ───────── segmented bar: one whole split into parts (budget) ─────────

export function SegmentedBar({ parts, format = inr }: { parts: { label: string; value: number }[]; format?: (n: number) => string }) {
  const { box, tip, show, hide } = useTip();
  // Fixed slot order, never cycled: past five parts, the rest fold into "Other".
  const shown = parts.length > 5 ? [...parts.slice(0, 4), { label: "Other", value: parts.slice(4).reduce((s, p) => s + p.value, 0) }] : parts;
  const total = shown.reduce((s, p) => s + p.value, 0) || 1;
  const fill = (i: number, label: string) => (label === "Other" && parts.length > 5 ? OTHER : SERIES_VAR[i]);

  return (
    <div ref={box} className="relative">
      <div className="flex h-10 gap-[2px] overflow-hidden rounded-lg">
        {shown.map((p, i) => (
          <motion.div
            key={p.label}
            tabIndex={0}
            onMouseMove={(e) => show(e, <><b className="font-medium">{p.label}</b> · {format(p.value)} · {pct(p.value, total)}%</>)}
            onFocus={(e) => show(e, <><b className="font-medium">{p.label}</b> · {format(p.value)}</>)}
            onMouseLeave={hide}
            onBlur={hide}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.7, ease, delay: i * 0.06 }}
            className="h-full origin-left outline-none first:rounded-l-lg last:rounded-r-lg hover:brightness-125 focus-visible:brightness-125"
            style={{ width: `${(p.value / total) * 100}%`, background: fill(i, p.label) }}
          />
        ))}
      </div>
      <ul className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2">
        {shown.map((p, i) => (
          <li key={p.label} className="flex items-center gap-3 text-[13px]">
            <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: fill(i, p.label) }} />
            <span className="min-w-0 flex-1 truncate text-d-ink2">{p.label}</span>
            <span className="tabular-nums text-d-ink">{format(p.value)}</span>
            <span className="w-9 text-right tabular-nums text-d-ink3">{pct(p.value, total)}%</span>
          </li>
        ))}
      </ul>
      <TipLayer tip={tip} />
    </div>
  );
}

// ───────── bar list: one series, one colour (funnel, fit scores, partner amounts) ─────────

export function BarList({ rows, max, format: f = String, color = "bg-s1" }: { rows: { label: string; value: number; note?: string }[]; max?: number; format?: ((n: number) => string) | "inr"; color?: string }) {
  const format = f === "inr" ? inr : f; // "inr" lets server pages pick the formatter without passing a function
  const { box, tip, show, hide } = useTip();
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <div ref={box} className="relative space-y-3">
      {rows.map((r, i) => (
        <div
          key={r.label}
          tabIndex={0}
          onMouseMove={(e) => show(e, <><b className="font-medium">{r.label}</b> · {format(r.value)}{r.note ? ` · ${r.note}` : ""}</>)}
          onFocus={(e) => show(e, <><b className="font-medium">{r.label}</b> · {format(r.value)}</>)}
          onMouseLeave={hide}
          onBlur={hide}
          className="group grid grid-cols-[minmax(84px,30%)_1fr_auto] items-center gap-3 rounded-md outline-none"
        >
          <span className="truncate text-[13px] text-d-ink2 group-hover:text-d-ink">{r.label}</span>
          <div className="h-2.5 rounded-r-[4px] bg-white/[0.04]">
            <motion.div
              className={`h-full rounded-r-[4px] ${color} group-hover:brightness-125`}
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(r.value ? 2 : 0, pct(r.value, top))}%` }}
              transition={{ duration: 0.7, ease, delay: i * 0.05 }}
            />
          </div>
          <span className="min-w-10 text-right text-[13px] tabular-nums text-d-ink">{format(r.value)}</span>
        </div>
      ))}
      <TipLayer tip={tip} />
    </div>
  );
}

// ───────── line: cumulative count over time (registrations) ─────────

export function LineChart({ points, label }: { points: { t: number; v: number }[]; label: string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const { box, tip, show, hide } = useTip();
  const [hover, setHover] = useState<number | null>(null);
  const h = 200, pad = { l: 34, r: 14, t: 12, b: 26 };
  if (points.length < 2) return <div ref={ref} className="grid h-[200px] place-items-center text-[13px] text-d-ink3">Not enough registrations to chart yet.</div>;

  const t0 = points[0].t, t1 = points[points.length - 1].t || t0 + 1;
  const vMax = niceMax(Math.max(...points.map((p) => p.v)));
  const X = (t: number) => pad.l + ((t - t0) / (t1 - t0 || 1)) * Math.max(0, w - pad.l - pad.r);
  const Y = (v: number) => pad.t + (1 - v / vMax) * (h - pad.t - pad.b);
  const d = points.map((p, i) => `${i ? "L" : "M"}${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`).join("");
  const area = `${d}L${X(t1)},${Y(0)}L${X(t0)},${Y(0)}Z`;
  const last = points[points.length - 1];
  const day = (t: number) => new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left + pad.l;
    let best = 0;
    points.forEach((p, i) => (Math.abs(X(p.t) - x) < Math.abs(X(points[best].t) - x) ? (best = i) : 0));
    setHover(best);
    show(e, <><b className="font-medium">{points[best].v}</b> {label} · {day(points[best].t)}</>);
  };

  return (
    <div ref={box} className="relative">
      <div ref={ref}>
        {w > 0 && (
          <svg width={w} height={h} role="img" aria-label={`${label}: ${last.v} by ${day(last.t)}`}>
            {[0, vMax / 2, vMax].map((v) => (
              <g key={v}>
                <line x1={pad.l} x2={w - pad.r} y1={Y(v)} y2={Y(v)} stroke="#303030" strokeWidth={1} />
                <text x={pad.l - 8} y={Y(v)} dy="0.32em" textAnchor="end" className="fill-d-ink3 text-[11px] tabular-nums">{v}</text>
              </g>
            ))}
            <text x={pad.l} y={h - 6} className="fill-d-ink3 text-[11px]">{day(t0)}</text>
            <text x={w - pad.r} y={h - 6} textAnchor="end" className="fill-d-ink3 text-[11px]">{day(t1)}</text>
            <motion.path d={area} fill="var(--s1)" fillOpacity={0.1} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }} />
            <motion.path d={d} fill="none" stroke="var(--s1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1, ease }} />
            {hover != null && <line x1={X(points[hover].t)} x2={X(points[hover].t)} y1={pad.t} y2={Y(0)} stroke="#474747" strokeWidth={1} />}
            {[hover ?? points.length - 1].map((i) => (
              <circle key={i} cx={X(points[i].t)} cy={Y(points[i].v)} r={4.5} fill="var(--s1)" stroke="var(--d-panel)" strokeWidth={2} />
            ))}
            <text x={X(last.t) - 8} y={Y(last.v) - 10} textAnchor="end" className="fill-d-ink text-[12px] font-medium tabular-nums">{last.v}</text>
            <rect x={pad.l} y={pad.t} width={Math.max(0, w - pad.l - pad.r)} height={h - pad.t - pad.b} fill="transparent" onMouseMove={onMove} onMouseLeave={() => (setHover(null), hide())} />
          </svg>
        )}
      </div>
      <TipLayer tip={tip} />
    </div>
  );
}

export function niceMax(n: number) {
  if (n <= 4) return 4;
  const mag = 10 ** Math.floor(Math.log10(n));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((m) => m >= n)!;
}

// ───────── shift timeline (Gantt): rows = volunteers, bars = tasks ─────────

export type Shift = { title: string; start: number; end: number };

export function ShiftTimeline({ rows }: { rows: { name: string; open?: boolean; shifts: Shift[] }[] }) {
  const { box, tip, show, hide } = useTip();
  const all = rows.flatMap((r) => r.shifts);
  if (!all.length) return null;
  const hour = 3_600_000;
  const from = Math.floor(Math.min(...all.map((s) => s.start)) / hour) * hour;
  const to = Math.ceil(Math.max(...all.map((s) => s.end)) / hour) * hour;
  const L = (t: number) => ((t - from) / (to - from)) * 100;
  const fmt = (t: number) => new Date(t).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });
  const ticks = Array.from({ length: Math.floor((to - from) / hour / 2) + 1 }, (_, i) => from + i * 2 * hour);

  return (
    <div ref={box} className="relative">
      <div className="grid grid-cols-[110px_1fr] gap-x-3">
        <div />
        <div className="relative mb-2 h-4">
          {ticks.map((t) => (
            <span key={t} className="absolute -translate-x-1/2 text-[11px] tabular-nums text-d-ink3" style={{ left: `${L(t)}%` }}>{fmt(t)}</span>
          ))}
        </div>
        {rows.map((r) => (
          <div key={r.name} className="contents">
            <div className={`truncate py-2 text-[13px] ${r.open ? "text-d-ink3 italic" : "text-d-ink2"}`}>{r.name}</div>
            <div className="relative border-t border-white/[0.06]">
              {ticks.map((t) => <span key={t} className="absolute inset-y-0 w-px bg-white/[0.05]" style={{ left: `${L(t)}%` }} />)}
              {r.shifts.map((s, i) => (
                <motion.div
                  key={s.title + s.start}
                  tabIndex={0}
                  onMouseMove={(e) => show(e, <><b className="font-medium">{s.title}</b> · {fmt(s.start)}–{fmt(s.end)}</>)}
                  onFocus={(e) => show(e, <><b className="font-medium">{s.title}</b> · {fmt(s.start)}–{fmt(s.end)}</>)}
                  onMouseLeave={hide}
                  onBlur={hide}
                  initial={{ opacity: 0, scaleX: 0.6 }}
                  animate={{ opacity: 1, scaleX: 1 }}
                  transition={{ duration: 0.5, ease, delay: i * 0.04 }}
                  className={`absolute top-1/2 h-5 -translate-y-1/2 origin-left overflow-hidden rounded-[4px] px-1.5 text-[10.5px] leading-5 whitespace-nowrap text-white outline-none hover:brightness-125 focus-visible:brightness-125 ${r.open ? "bg-s2" : "bg-s1"}`}
                  style={{ left: `calc(${L(s.start)}% + 1px)`, width: `calc(${L(s.end) - L(s.start)}% - 2px)` }}
                >
                  {s.title}
                </motion.div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex gap-5 text-[12px] text-d-ink2">
        <span className="flex items-center gap-2"><span className="size-2.5 rounded-[3px] bg-s1" />Assigned shift</span>
        <span className="flex items-center gap-2"><span className="size-2.5 rounded-[3px] bg-s2" />Needs a volunteer</span>
      </div>
      <TipLayer tip={tip} />
    </div>
  );
}

// ───────── milestones on a date track ─────────

export function MilestoneTrack({ items }: { items: { date: string; milestone: string }[] }) {
  const { box, tip, show, hide } = useTip();
  const [now] = useState(Date.now); // read the clock once, not on every render
  const ts = items.map((m) => Date.parse(m.date)).filter((t) => !Number.isNaN(t));
  if (!ts.length) return null;
  const a = Math.min(...ts), b = Math.max(...ts) || a + 1;
  const L = (t: number) => 4 + ((t - a) / (b - a || 1)) * 92;
  const day = (t: number) => new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

  return (
    <div ref={box} className="relative">
      <div className="relative h-14">
        <div className="absolute inset-x-0 top-6 h-px bg-white/10" />
        {now > a && now < b && (
          <div className="absolute top-2 bottom-0 w-px bg-s2" style={{ left: `${L(now)}%` }}>
            <span className="absolute -top-0.5 left-1.5 text-[10.5px] text-d-ink2">Today</span>
          </div>
        )}
        {items.map((m, i) => {
          const t = Date.parse(m.date);
          const done = t < now;
          return (
            <motion.button
              key={m.date + m.milestone}
              type="button"
              aria-label={`${day(t)}: ${m.milestone}`}
              onMouseMove={(e) => show(e, <><b className="font-medium">{day(t)}</b> · {m.milestone}</>)}
              onFocus={(e) => show(e, <><b className="font-medium">{day(t)}</b> · {m.milestone}</>)}
              onMouseLeave={hide}
              onBlur={hide}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.4, ease, delay: 0.1 + i * 0.06 }}
              className={`absolute top-6 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-d-panel outline-none ${done ? "bg-s1" : "border border-s1 bg-d-panel"}`}
              style={{ left: `${L(t)}%` }}
            />
          );
        })}
        <span className="absolute bottom-0 left-0 text-[11px] text-d-ink3">{day(a)}</span>
        <span className="absolute right-0 bottom-0 text-[11px] text-d-ink3">{day(b)}</span>
      </div>
      <TipLayer tip={tip} />
    </div>
  );
}
