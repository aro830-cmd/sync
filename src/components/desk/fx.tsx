"use client";

// Animated charts for the cross-event views (home, past events, agent pages). Same mark rules as charts.tsx:
// 2px lines, 4px rounded data-ends, 2px surface gaps, text in ink tokens, a tooltip on every mark.

import { animate, motion, useInView, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { TipLayer, niceMax, useTip, useWidth } from "./charts";
import { ease } from "./ui";
import { inr } from "@/lib/format";

// ───────── count-up number ─────────

// `kind` instead of a format function, so server pages can render it.
const FORMAT = { num: (n: number) => Math.round(n).toLocaleString("en-IN"), inr, pct: (n: number) => `${Math.round(n)}%` };

export function CountUp({ value, kind = "num", duration = 1.4 }: { value: number; kind?: keyof typeof FORMAT; duration?: number }) {
  const format = FORMAT[kind];
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const mv = useMotionValue(0);
  const text = useTransform(mv, format);
  useEffect(() => {
    if (!inView) return;
    if (reduce) return mv.set(value);
    const c = animate(mv, value, { duration, ease });
    return () => c.stop();
  }, [inView, value, reduce, duration, mv]);
  return <motion.span ref={ref} className="tabular-nums">{text}</motion.span>;
}

// ───────── sparkline: decorative trend inside a stat tile ─────────

export function Spark({ values, color = "var(--s1)" }: { values: number[]; color?: string }) {
  if (values.length < 2) return null;
  const w = 120, h = 34, max = Math.max(...values, 1);
  const d = values.map((v, i) => `${i ? "L" : "M"}${((i / (values.length - 1)) * w).toFixed(1)},${(h - 3 - (v / max) * (h - 6)).toFixed(1)}`).join("");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-[34px] w-[120px] overflow-visible" aria-hidden>
      <motion.path d={`${d}L${w},${h}L0,${h}Z`} fill={color} fillOpacity={0.12} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.8, delay: 0.4 }} />
      <motion.path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.2, ease }} />
    </svg>
  );
}

// ───────── area trend: one series over time, line draws itself, crosshair tooltip ─────────

export function AreaTrend({ points, unit, height = 220 }: { points: { t: number; v: number; label: string }[]; unit: string; height?: number }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const { box, tip, show, hide } = useTip();
  const [hover, setHover] = useState<number | null>(null);
  const h = height, pad = { l: 36, r: 16, t: 18, b: 28 };
  if (points.length < 2) return <div ref={ref} className="grid place-items-center text-[13px] text-d-ink3" style={{ height: h }}>Host a couple of events to see the trend.</div>;

  const t0 = points[0].t, t1 = points[points.length - 1].t;
  const vMax = niceMax(Math.max(...points.map((p) => p.v)));
  const X = (t: number) => pad.l + ((t - t0) / (t1 - t0 || 1)) * Math.max(0, w - pad.l - pad.r);
  const Y = (v: number) => pad.t + (1 - v / vMax) * (h - pad.t - pad.b);
  // Monotone-ish smoothing: horizontal control points, so the curve never overshoots a value.
  const d = points.map((p, i) => {
    if (!i) return `M${X(p.t)},${Y(p.v)}`;
    const a = points[i - 1], mx = (X(a.t) + X(p.t)) / 2;
    return `C${mx},${Y(a.v)} ${mx},${Y(p.v)} ${X(p.t)},${Y(p.v)}`;
  }).join("");
  const area = `${d}L${X(t1)},${Y(0)}L${X(t0)},${Y(0)}Z`;
  const day = (t: number) => new Date(t).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  const i = hover ?? points.length - 1;

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left + pad.l;
    let best = 0;
    points.forEach((p, k) => (Math.abs(X(p.t) - x) < Math.abs(X(points[best].t) - x) ? (best = k) : 0));
    setHover(best);
    show(e, <><b className="font-medium">{points[best].label}</b> · {points[best].v} {unit} · {day(points[best].t)}</>);
  };

  return (
    <div ref={box} className="relative">
      <div ref={ref}>
        {w > 0 && (
          <svg width={w} height={h} role="img" aria-label={`${unit} per event, latest ${points[points.length - 1].v}`}>
            <defs>
              <linearGradient id="fx-area" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--s1)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--s1)" stopOpacity={0} />
              </linearGradient>
            </defs>
            {[0, vMax / 2, vMax].map((v) => (
              <g key={v}>
                <line x1={pad.l} x2={w - pad.r} y1={Y(v)} y2={Y(v)} stroke="rgba(255,236,220,.07)" />
                <text x={pad.l - 8} y={Y(v)} dy="0.32em" textAnchor="end" className="fill-d-ink3 text-[11px] tabular-nums">{v}</text>
              </g>
            ))}
            <text x={pad.l} y={h - 6} className="fill-d-ink3 text-[11px]">{day(t0)}</text>
            <text x={w - pad.r} y={h - 6} textAnchor="end" className="fill-d-ink3 text-[11px]">{day(t1)}</text>
            <motion.path d={area} fill="url(#fx-area)" initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 1, delay: 0.5 }} />
            <motion.path d={d} fill="none" stroke="var(--s1)" strokeWidth={2} strokeLinecap="round" initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.6, ease }} />
            {points.map((p, k) => (
              <motion.circle key={k} cx={X(p.t)} cy={Y(p.v)} r={k === i ? 5 : 3} fill={k === i ? "var(--s1)" : "var(--d-panel)"} stroke="var(--s1)" strokeWidth={2}
                initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ duration: 0.3, delay: 0.4 + (k / points.length) * 1.2 }} />
            ))}
            {hover != null && <line x1={X(points[hover].t)} x2={X(points[hover].t)} y1={pad.t} y2={Y(0)} stroke="rgba(255,236,220,.18)" />}
            <text x={X(points[i].t)} y={Y(points[i].v) - 12} textAnchor={i === points.length - 1 ? "end" : "middle"} className="fill-d-ink text-[12px] font-medium tabular-nums">{points[i].v}</text>
            <rect x={pad.l} y={pad.t} width={Math.max(0, w - pad.l - pad.r)} height={h - pad.t - pad.b} fill="transparent" onMouseMove={onMove} onMouseLeave={() => (setHover(null), hide())} />
          </svg>
        )}
      </div>
      <TipLayer tip={tip} />
    </div>
  );
}

// ───────── rings: a few ratios as concentric arcs, each direct-labelled ─────────

export function Rings({ rings }: { rings: { label: string; value: number; max: number; color: string; detail: string }[] }) {
  const { box, tip, show, hide } = useTip();
  const size = 176, stroke = 11, gap = 5;
  return (
    <div ref={box} className="relative flex flex-col items-center gap-6 sm:flex-row">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90" role="img" aria-label={rings.map((r) => `${r.label} ${Math.round((r.value / (r.max || 1)) * 100)}%`).join(", ")}>
        {rings.map((r, i) => {
          const rad = size / 2 - stroke / 2 - i * (stroke + gap);
          const p = Math.min(1, r.value / (r.max || 1));
          return (
            <g key={r.label} onMouseMove={(e) => show(e, <><b className="font-medium">{r.label}</b> · {r.detail}</>)} onMouseLeave={hide}>
              <circle cx={size / 2} cy={size / 2} r={rad} fill="none" stroke="rgba(255,236,220,.06)" strokeWidth={stroke} />
              <motion.circle cx={size / 2} cy={size / 2} r={rad} fill="none" stroke={r.color} strokeWidth={stroke} strokeLinecap="round"
                initial={{ pathLength: 0 }} whileInView={{ pathLength: p }} viewport={{ once: true }} transition={{ duration: 1.4, ease, delay: 0.15 * i }} />
            </g>
          );
        })}
      </svg>
      <ul className="w-full space-y-3">
        {rings.map((r) => (
          <li key={r.label} className="flex items-center gap-3 text-[13px]">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: r.color }} />
            <span className="min-w-0 flex-1">
              <span className="block text-d-ink2">{r.label}</span>
              <span className="block text-[11.5px] text-d-ink3">{r.detail}</span>
            </span>
            <span className="text-[18px] font-semibold tabular-nums text-d-ink"><CountUp value={Math.round((r.value / (r.max || 1)) * 100)} />%</span>
          </li>
        ))}
      </ul>
      <TipLayer tip={tip} />
    </div>
  );
}

// ───────── heatmap: agent runs per day, sequential single hue ─────────

export function Heatmap({ counts, weeks = 18, now }: { counts: Record<string, number>; weeks?: number; now: number }) {
  const { box, tip, show, hide } = useTip();
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - (weeks * 7 - 1) - start.getDay()); // align to a Sunday
  const days = Array.from({ length: Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1 }, (_, i) => new Date(start.getTime() + i * 86_400_000));
  const max = Math.max(1, ...Object.values(counts));
  const key = (d: Date) => d.toISOString().slice(0, 10);
  const step = (n: number) => (n ? [0.28, 0.5, 0.75, 1][Math.min(3, Math.floor((n / max) * 3.999))] : 0);
  const total = days.reduce((s, d) => s + (counts[key(d)] ?? 0), 0);

  return (
    <div ref={box} className="relative">
      <div className="overflow-x-auto">
        <div className="grid w-max grid-flow-col grid-rows-7 gap-[3px]">
          {days.map((d, i) => {
            const n = counts[key(d)] ?? 0;
            return (
              <motion.div
                key={i}
                tabIndex={-1}
                onMouseMove={(e) => show(e, <><b className="font-medium">{n} run{n === 1 ? "" : "s"}</b> · {d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</>)}
                onMouseLeave={hide}
                initial={{ opacity: 0, scale: 0.4 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.35, delay: (i / days.length) * 0.9 }}
                className="size-[13px] rounded-[3px] hover:ring-1 hover:ring-d-ink2"
                style={{ background: n ? `color-mix(in oklab, var(--s1) ${step(n) * 100}%, var(--d-panel))` : "rgba(255,236,220,.05)" }}
              />
            );
          })}
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between text-[11.5px] text-d-ink3">
        <span>{total} agent runs in {weeks} weeks</span>
        <span className="flex items-center gap-1.5">
          Less
          {[0, 0.28, 0.5, 0.75, 1].map((s) => (
            <span key={s} className="size-[11px] rounded-[3px]" style={{ background: s ? `color-mix(in oklab, var(--s1) ${s * 100}%, var(--d-panel))` : "rgba(255,236,220,.05)" }} />
          ))}
          More
        </span>
      </div>
      <TipLayer tip={tip} />
    </div>
  );
}

// ───────── paired bars: registered vs attended per event ─────────

export function PairBars({ rows }: { rows: { label: string; a: number; b: number }[] }) {
  const { box, tip, show, hide } = useTip();
  const max = niceMax(Math.max(1, ...rows.map((r) => Math.max(r.a, r.b))));
  const H = 180;
  return (
    <div ref={box} className="relative">
      <div className="flex h-[200px] items-end gap-5 border-b border-white/[0.07] px-1">
        {rows.map((r, i) => (
          <div key={r.label} className="flex h-full flex-1 flex-col justify-end"
            onMouseMove={(e) => show(e, <><b className="font-medium">{r.label}</b> · {r.a} registered · {r.b} attended ({r.a ? Math.round((r.b / r.a) * 100) : 0}%)</>)} onMouseLeave={hide}>
            <div className="flex items-end justify-center gap-[2px]">
              {[["a", "var(--s2)"], ["b", "var(--s3)"]].map(([k, c], j) => (
                <motion.div key={k} className="w-full max-w-[22px] rounded-t-[4px] hover:brightness-125" style={{ background: c }}
                  initial={{ height: 0 }} whileInView={{ height: (r[k as "a" | "b"] / max) * H }} viewport={{ once: true }} transition={{ duration: 0.9, ease, delay: i * 0.08 + j * 0.05 }} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-5 px-1">
        {rows.map((r) => <div key={r.label} className="flex-1 truncate text-center text-[11px] text-d-ink3">{r.label}</div>)}
      </div>
      <div className="mt-4 flex gap-5 text-[12px] text-d-ink2">
        <span className="flex items-center gap-2"><span className="size-2.5 rounded-[3px] bg-s2" />Registered</span>
        <span className="flex items-center gap-2"><span className="size-2.5 rounded-[3px] bg-s3" />Attended</span>
      </div>
      <TipLayer tip={tip} />
    </div>
  );
}

// ───────── single progress ring for cards ─────────

export function Ring({ value, max, size = 46, color = "var(--s1)", children }: { value: number; max: number; size?: number; color?: string; children?: React.ReactNode }) {
  const p = Math.min(1, value / (max || 1)), r = size / 2 - 4;
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,236,220,.08)" strokeWidth={4} />
        <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={4} strokeLinecap="round" initial={{ pathLength: 0 }} whileInView={{ pathLength: p }} viewport={{ once: true }} transition={{ duration: 1.2, ease }} />
      </svg>
      <span className="relative text-[11px] font-medium tabular-nums">{children}</span>
    </div>
  );
}
