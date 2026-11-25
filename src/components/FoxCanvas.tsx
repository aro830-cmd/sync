"use client";

import { useEffect, useRef } from "react";
import { FRAMES, bitmapExact, bitmapNear, foxFrames, warm } from "@/lib/fox";

type Mode = "landing" | "card";
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Where to draw the frame. "landing": hero close-up framing → full-body framing (brief §8). "card": cover. */
function frameRect(mode: Mode, cur: number, W: number, H: number, w: number, h: number) {
  if (mode === "card") {
    const s = Math.max(W / w, H / h);
    return { x: (W - w * s) / 2, y: (H - h * s) * 0.3, dw: w * s, dh: h * s, t: 0 };
  }
  const boxH = Math.max((W * 900) / 1440, H);
  const s0 = Math.max(W / w, boxH / h);
  const r0 = { x: (W - w * s0) / 2, y: 0, dw: w * s0, dh: h * s0 };
  const r1 = { x: (W - (H * w) / h) / 2, y: 0, dw: (H * w) / h, dh: H };
  const t = easeInOut(clamp((cur / (FRAMES - 1) - 0.35) / 0.55));
  const L = (a: number, b: number) => a + (b - a) * t;
  return { x: L(r0.x, r1.x), y: L(r0.y, r1.y), dw: L(r0.dw, r1.dw), dh: L(r0.dh, r1.dh), t };
}

/**
 * Scroll-scrubbed fox. `progress()` returns 0–1 and is read every animation frame (no re-renders).
 * Style the wrapper, not this: the duotone comes from `mix-blend-mode: multiply` over a gradient.
 */
export function FoxCanvas({ progress, mode = "card", k = 0.25, onReady, className = "" }: { progress: () => number; mode?: Mode; k?: number | (() => number); onReady?: () => void; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const latest = useRef({ progress, k, onReady });
  useEffect(() => {
    latest.current = { progress, k, onReady };
  });

  useEffect(() => {
    const s = foxFrames();
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    let cur = clamp(latest.current.progress()) * (FRAMES - 1);
    let raf = 0, last = performance.now(), drawn = "", shown = false;

    const size = () => {
      const r = c.getBoundingClientRect();
      const d = Math.min(devicePixelRatio, 1.5);
      c.width = Math.max(1, Math.round(r.width * d));
      c.height = Math.max(1, Math.round(r.height * d));
      drawn = "";
    };
    const ro = new ResizeObserver(size);
    ro.observe(c);
    size();

    const tick = (now: number) => {
      const { progress, k } = latest.current;
      const kk = typeof k === "function" ? k() : k;
      const dt = Math.min(64, now - last);
      last = now;
      const target = clamp(progress()) * (FRAMES - 1);
      cur += (target - cur) * (1 - (1 - kk) ** (dt / 16.7));
      if (Math.abs(target - cur) < 0.02) cur = target;

      warm(s, Math.floor(Math.min(cur, target)) - 4, Math.ceil(Math.max(cur, target)) + 14, () => (drawn = ""));
      const i = Math.floor(cur);
      const f = cur - i;
      const a = bitmapNear(i);
      if (a) {
        const r = frameRect(mode, cur, c.width, c.height, s.w, s.h);
        const next = f > 0.01 && a.i === i ? bitmapExact(i + 1) : undefined;
        const key = `${a.i}|${next ? f.toFixed(2) : 0}|${r.t.toFixed(3)}|${c.width}x${c.height}`;
        if (key !== drawn) {
          drawn = key;
          ctx.clearRect(0, 0, c.width, c.height);
          ctx.globalAlpha = 1;
          ctx.drawImage(a.bmp, r.x, r.y, r.dw, r.dh);
          if (next) {
            ctx.globalAlpha = f; // sub-frame blend
            ctx.drawImage(next, r.x, r.y, r.dw, r.dh);
            ctx.globalAlpha = 1;
          }
          if (!shown) {
            shown = true;
            requestAnimationFrame(() => requestAnimationFrame(() => latest.current.onReady?.()));
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [mode]);

  return <canvas ref={ref} aria-hidden className={`block h-full w-full ${className}`} />;
}
