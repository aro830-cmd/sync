"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { FoxCanvas } from "@/components/FoxCanvas";
import { CAST_SHEET, foxStill, stillWidth } from "@/lib/fox";

const noop = () => () => {};
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const ease = (t: number) => 1 - (1 - t) ** 3;
const LENIS = "https://cdn.jsdelivr.net/npm/lenis@1.1.13/dist/lenis.min.js";

// The six characters from the sheet: the five agents plus you, the organiser who approves.
const CAST = [
  { name: "The Planner", n: "01", type: "BUDGET & TIMELINE", col: 0, row: 0 },
  { name: "The Pitcher", n: "02", type: "SPONSORSHIP", col: 1, row: 0 },
  { name: "The Fixer", n: "03", type: "LOGISTICS", col: 2, row: 0 },
  { name: "The Herald", n: "04", type: "COMMS", col: 0, row: 1 },
  { name: "The Analyst", n: "05", type: "REPORTING", col: 1, row: 1 },
  { name: "You", n: "06", type: "APPROVER", col: 2, row: 1 },
];
const POS_X = [".15%", "50.07%", "99.94%"];
const POS_Y = [".2%", "99.7%"];

/* eslint-disable @typescript-eslint/no-explicit-any -- Lenis is loaded from the CDN at runtime */
declare global {
  interface Window { Lenis?: any }
}

const chars = (s: string) => s.split("").map((c, i) => <span key={i} className="ch">{c}</span>);
const Arrow = () => (
  <svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M3 7 7 3M3.6 3H7v3.4" /></svg>
);

export function RelayLanding() {
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const story = useRef<HTMLElement>(null);
  const cast = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const prog = useRef<HTMLElement>(null);
  const word = useRef<HTMLHeadingElement>(null);
  const keyRef = useRef<HTMLButtonElement>(null);
  const lenis = useRef<any>(null);
  // Video on desktop with motion allowed, stills otherwise. null on the server / first hydration pass.
  const mode = useSyncExternalStore(
    noop,
    () => (matchMedia("(prefers-reduced-motion: reduce)").matches || matchMedia("(max-width: 820px)").matches ? "stills" : "video"),
    () => null,
  );

  // ── --vw, scroll effects, panels ──
  useEffect(() => {
    const el = root.current!;
    const setVw = () => el.style.setProperty("--vw", `${document.documentElement.clientWidth}px`);
    setVw();
    addEventListener("resize", setVw);

    let raf = 0;
    const panels = [...el.querySelectorAll<HTMLElement>(".rl-panel")];
    const fills = [...el.querySelectorAll<HTMLElement>(".rl-dash b")];
    const dash = el.querySelector<HTMLElement>(".rl-dash");
    const frame = () => {
      const vh = innerHeight;
      el.classList.toggle("scrolled", scrollY > vh * 0.35);
      const ct = cast.current?.getBoundingClientRect().top ?? 1e9;
      el.classList.toggle("at-end", ct < vh * 0.55);
      if (word.current && matchMedia("(min-width: 821px)").matches) word.current.style.transform = `translateY(${-40 * Math.min(1, scrollY / vh)}%)`;

      const sr = story.current?.getBoundingClientRect();
      if (sr && matchMedia("(min-width: 821px)").matches) {
        const p = clamp(-sr.top / (sr.height - vh));
        const video = el.classList.contains("scene-run");
        const a1 = video ? clamp((p - 0.2) / 0.06) * (1 - clamp((p - 0.43) / 0.06)) : p < 0.5 ? 1 : 0;
        const a2 = video ? clamp((p - 0.64) / 0.08) : p >= 0.5 ? 1 : 0;
        [a1, a2].forEach((a, i) => {
          const pn = panels[i];
          pn.style.opacity = String(a);
          const e = 1 - ease(a);
          pn.querySelectorAll<HTMLElement>("h2 .rl-line > span").forEach((l, j) => (l.style.transform = `translateY(${e * (105 + j * 20)}%)`));
          pn.querySelector<HTMLElement>("p")!.style.transform = `translateY(${e * 24}px)`;
          pn.querySelector<HTMLElement>(".rl-plabel")!.style.transform = `translateX(${(i === 0 ? 1 : -1) * e * 16}px)`;
        });
        el.classList.toggle("on-p1", a1 >= a2);
        if (dash) dash.style.opacity = String(Math.max(a1, a2));
        if (fills[0]) fills[0].style.transform = `scaleX(${clamp((p - 0.2) / 0.35)})`;
        if (fills[1]) fills[1].style.transform = `scaleX(${clamp((p - 0.55) / 0.45)})`;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("resize", setVw);
    };
  }, []);

  // ── smooth scroll (Lenis from the CDN) ──
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0, dead = false;
    const start = () => {
      if (dead || !window.Lenis) return;
      lenis.current = new window.Lenis({ lerp: 0.085, smoothWheel: true, wheelMultiplier: 1, anchors: true });
      const loop = (t: number) => {
        lenis.current?.raf(t);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    };
    if (window.Lenis) start();
    else {
      const s = document.createElement("script");
      s.src = LENIS;
      s.onload = start;
      document.head.appendChild(s);
    }
    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      lenis.current?.destroy();
      lenis.current = null;
      document.documentElement.classList.remove("lenis", "lenis-smooth", "lenis-stopped");
    };
  }, []);

  // ── wordmark fitting: letter-spacing so the ink spans exactly the mockup ──
  useEffect(() => {
    const fit = () => {
      const w = word.current;
      if (!w || !matchMedia("(min-width: 821px)").matches) {
        w?.querySelectorAll<HTMLElement>(".rl-w1, .rl-w3").forEach((p) => (p.style.letterSpacing = ""));
        return;
      }
      const u = document.documentElement.clientWidth / 1440;
      for (const [sel, target] of [[".rl-w1", 464], [".rl-w3", 737]] as const) {
        const p = w.querySelector<HTMLElement>(sel)!;
        p.style.letterSpacing = "0px";
        const n = p.textContent!.length;
        p.style.letterSpacing = `${(target * u - p.getBoundingClientRect().width) / (n - 1)}px`;
      }
    };
    document.fonts.ready.then(fit);
    addEventListener("resize", fit);
    return () => removeEventListener("resize", fit);
  }, []);

  // ── opening animation ──
  useEffect(() => {
    const el = root.current!;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let done = false;
    const reveal = () => {
      if (done) return;
      done = true;
      el.classList.remove("pre");
    };
    const t1 = setTimeout(reveal, 4000);
    document.fonts.ready.then(() => {
      if (reduce) return reveal();
      const E = { easing: "cubic-bezier(.16,1,.3,1)", fill: "backwards" as const };
      const anims: Animation[] = [];
      const q = (s: string) => [...el.querySelectorAll<HTMLElement>(s)];
      el.classList.remove("pre");
      done = true;
      q(".rl-still").forEach((x) => anims.push(x.animate([{ opacity: 0, transform: "scale(1.08)", filter: "blur(10px)" }, {}], { ...E, duration: 1800 })));
      q(".rl-word .ch").forEach((x, i) => anims.push(x.animate([{ opacity: 0, transform: "translateY(60%) rotate(4deg)" }, { opacity: 1, transform: "none" }], { ...E, duration: 1100, delay: 250 + i * 55 })));
      q(".rl-hero .rl-line > span").forEach((x, i) => anims.push(x.animate([{ opacity: 0, transform: "translateY(100%)" }, { opacity: 1, transform: "none" }], { ...E, duration: 900, delay: 850 + i * 70 })));
      q(".rl-tag").forEach((x) => anims.push(x.animate([{ opacity: 0, transform: "translateX(-20px)" }, { opacity: 1, transform: "none" }], { ...E, duration: 900, delay: 1300 })));
      q(".rl-nav > :not(.rl-mini):not(.rl-menu)").forEach((x, i) => anims.push(x.animate([{ opacity: 0, transform: "translateY(-24px)" }, { opacity: 1, transform: "none" }], { ...E, duration: 900, delay: 500 + i * 80 })));
      q(".rl-bar > *").forEach((x, i) => {
        const base = x.classList.contains("rl-switch") ? "translateX(-50%) " : "";
        anims.push(x.animate([{ opacity: 0, transform: `${base}translateY(24px)` }, { opacity: 1, transform: base || "none" }], { ...E, duration: 900, delay: 700 + i * 80 }));
      });
      Promise.all(anims.map((a) => a.finished)).then(() => anims.forEach((a) => a.cancel()), () => {});
    });
    return () => clearTimeout(t1);
  }, []);

  // ── menu + RELAYBAR stepper (click or Space) ──
  const [open, setOpen] = useState(false);
  useEffect(() => {
    root.current!.classList.toggle("menu-open", open);
  }, [open]);
  const go = (y: number) => (lenis.current ? lenis.current.scrollTo(y, { duration: 1.6 }) : scrollTo({ top: y, behavior: "smooth" }));
  const step = () => {
    const k = keyRef.current;
    k?.classList.add("hit");
    setTimeout(() => k?.classList.remove("hit"), 140);
    const st = story.current!.offsetTop, vh = innerHeight;
    const stops = [0, st + vh * 0.02, st + vh * 1.35, cast.current!.offsetTop];
    const next = stops.find((y) => y > scrollY + 8);
    go(next ?? 0);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.code === "Space" && !(e.target as HTMLElement).closest("input, textarea, button, a, select")) {
        e.preventDefault();
        step();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });

  // ── cast track: drag, drift, progress ──
  useEffect(() => {
    const t = track.current!;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let drifting = !reduce, raf = 0, last = performance.now(), down = false, sx = 0, sl = 0;
    const stop = () => (drifting = false);
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      if (drifting) {
        t.scrollLeft += 0.03 * dt;
        if (t.scrollLeft >= t.scrollWidth / 2) t.scrollLeft -= t.scrollWidth / 2; // cards are doubled, so wrap seamlessly
      }
      const vis = t.clientWidth / t.scrollWidth;
      const frac = t.scrollLeft / Math.max(1, t.scrollWidth - t.clientWidth);
      if (prog.current) prog.current.style.width = `${(vis + (1 - vis) * frac) * 100}%`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const pd = (e: PointerEvent) => {
      stop();
      if (e.pointerType !== "mouse") return;
      down = true;
      sx = e.clientX;
      sl = t.scrollLeft;
      t.classList.add("dragging");
    };
    const pm = (e: PointerEvent) => down && (t.scrollLeft = sl - (e.clientX - sx));
    const pu = () => {
      down = false;
      t.classList.remove("dragging");
    };
    t.addEventListener("pointerdown", pd);
    t.addEventListener("wheel", stop, { passive: true });
    t.addEventListener("touchstart", stop, { passive: true });
    addEventListener("pointermove", pm);
    addEventListener("pointerup", pu);
    return () => {
      cancelAnimationFrame(raf);
      t.removeEventListener("pointerdown", pd);
      removeEventListener("pointermove", pm);
      removeEventListener("pointerup", pu);
    };
  }, []);

  const stageProgress = () => {
    const s = stage.current;
    if (!s) return 0;
    const r = s.getBoundingClientRect();
    return clamp(-r.top / (r.height - innerHeight) / 0.85);
  };

  return (
    <div ref={root} className={`rl pre ${mode === "stills" ? "stills" : ""} ${mode === "video" ? "scene-run" : ""}`}>
      <div className="rl-grain" aria-hidden />
      <div className="rl-vignette" aria-hidden />

      {/* ── nav ── */}
      <header className="rl-nav">
        <Link href="/admin/login" className="rl-pill rl-label rl-p1">
          Open the desk
          <span className="rl-circ"><svg viewBox="0 0 10 10"><path d="M2.5 1.2 L9 5 L2.5 8.8 z" fill="currentColor" /></svg></span>
        </Link>
        <span className="rl-label rl-center">Club events, on autopilot</span>
        <Link href="/student/login" className="rl-pill rl-label rl-p2">
          Student login
          <span className="rl-circ"><svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M3.5 2v6M6.5 2v6" /></svg></span>
        </Link>
        <button className="rl-menu-btn" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <i /><i /><i />
        </button>
        <a href="#top" className="rl-mini" onClick={(e) => (e.preventDefault(), go(0))}>Relay<sup>®</sup></a>
        <nav className="rl-menu" aria-hidden={!open} onClick={(e) => (e.target as HTMLElement).closest("a") && setOpen(false)}>
          <a href="#top"><span>01</span>The Brief</a>
          <a href="#walk"><span>02</span>The Agents</a>
          <a href="#cast"><span>03</span>The Cast</a>
          <Link href="/admin/login"><span>04</span>Open the desk</Link>
        </nav>
      </header>

      {/* ── bottom bar ── */}
      <div className="rl-bar">
        <a href="#walk" className="rl-pill rl-label rl-p3">
          Our agents
          <span className="rl-circ"><svg viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><circle cx="2.4" cy="2.4" r="1.4" /><circle cx="7.6" cy="7.6" r="1.4" /><path d="M2.4 3.8c0 3 5.2 0 5.2 2.4" /></svg></span>
        </a>
        <button className="rl-icon" aria-label="Meet a random agent" onClick={() => go(cast.current!.offsetTop)}>
          <svg viewBox="0 0 28 28"><path d="M4 5l5 6h10l5-6-1 12c0 4-4 7-9 7s-9-3-9-7z" fill="#fbefe4" /><rect x="8.6" y="12.6" width="10.8" height="3.4" rx="1.4" fill="#ff5a1f" /><circle cx="14" cy="20" r="1.1" fill="#0b0806" /></svg>
        </button>
        <div className="rl-switch rl-label">
          <small>PRESS</small>
          <button ref={keyRef} className="rl-key rl-label" onClick={step}>RELAYBAR</button>
          <small>TO SWITCH</small>
        </div>
        <Link href="/e/de000000-0000-4000-a000-000000000001" className="rl-flink rl-label">
          See a live event <Arrow />
        </Link>
        <div className="rl-dots" aria-hidden><i /><i /><i /><i /><i /></div>
      </div>

      {/* ── stage: hero + story over the scrubbed fox ── */}
      <div ref={stage} className="rl-stage" id="top">
        <div className="rl-scene" aria-hidden>
          {mode === "video" && (
            <FoxCanvas
              mode="landing"
              progress={stageProgress}
              k={() => (lenis.current ? 0.6 : 0.25)}
              onReady={() => root.current?.classList.add("scene-on")}
            />
          )}
        </div>

        <section className="rl-hero">
          <div className="rl-frame">
            <div className="rl-stillwrap">
              {mode === "stills" && (
                // eslint-disable-next-line @next/next/no-img-element -- brief: use the resizer URL as-is, never re-host
                <img className="rl-still" src={foxStill("hero", stillWidth())} alt="A fennec fox character in orange shield sunglasses, a silver chain and a white varsity jacket" />
              )}
            </div>
            <h1 ref={word} className="rl-word" aria-label="Relay Agents">
              <span className="rl-w1" aria-hidden>{chars("Relay")}</span>
              <span className="rl-reg ch" aria-hidden>
                <svg viewBox="0 0 70 70"><circle cx="35" cy="35" r="31" fill="none" stroke="currentColor" strokeWidth="7" /><path d="M24 50V20h13c7 0 11 4 11 9.5 0 4.5-3 7.6-7.4 8.6L49 50h-8.5l-7.6-11.2H31.5V50zm7.5-17.6h5.2c3 0 4.6-1.3 4.6-3.6s-1.6-3.5-4.6-3.5h-5.2z" fill="currentColor" /></svg>
              </span>
              <span className="rl-w3" aria-hidden>{chars("AGENTS")}</span>
            </h1>
            <p className="rl-copy c1">
              <span className="rl-line"><span><b>BUILT FOR CLUBS,</b> ONE</span></span>
              <span className="rl-line"><span>BRIEF IN, A WHOLE</span></span>
              <span className="rl-line"><span>EVENT OUT</span></span>
            </p>
            <p className="rl-copy c2">
              <span className="rl-line"><span>PLAN, PITCH,</span></span>
              <span className="rl-line"><span><b>SCHEDULE, SHIP</b></span></span>
              <span className="rl-line"><span>AND REPORT</span></span>
            </p>
            <div className="rl-tag rl-label">
              PS-CA2.
              <svg viewBox="0 0 46 8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><line x1="1" y1="4" x2="45" y2="4" /><path d="M41 1l4 3-4 3" /></svg>
            </div>
          </div>
        </section>

        <section ref={story} className="rl-story" id="walk">
          <div className="rl-stick">
            <div className="rl-frame">
              <div className="rl-storystill">
                {mode === "stills" && (
                  // eslint-disable-next-line @next/next/no-img-element -- brief: use the resizer URL as-is, never re-host
                  <img src={foxStill("story", stillWidth())} alt="The fox walking in a white varsity jacket" />
                )}
              </div>
              <article className="rl-panel p1">
                <div className="rl-plabel">01 /</div>
                <h2>
                  <span className="rl-line"><span>ONE LINE IN,</span></span>
                  <span className="rl-line"><span>A WHOLE EVENT OUT</span></span>
                </h2>
                <p>
                  Type “Hackathon, 15 Dec, ₹50k, 200 people”. <em>The Planner</em> splits the budget, sets sponsor tiers and builds the timeline — then hands off to the next agent.
                </p>
              </article>
              <article className="rl-panel p2">
                <div className="rl-plabel">02 /</div>
                <h2>
                  <span className="rl-line"><span>YOU APPROVE,</span></span>
                  <span className="rl-line"><span>THEY DO THE REST</span></span>
                </h2>
                <p>
                  Sponsor pitches, clash-free volunteer shifts, registration, certificates and the sponsor report. <em>Every agent ends in a real email, row or PDF.</em>
                </p>
              </article>
              <div className="rl-dash" aria-hidden><i><b /></i><i><b /></i></div>
            </div>
          </div>
        </section>
      </div>

      {/* ── the cast ── */}
      <section ref={cast} className="rl-cast" id="cast">
        <div className="rl-plabel">03 /</div>
        <h2>
          MEET THE
          <br />
          <em>CAST</em>
        </h2>
        <div ref={track} className="rl-track" aria-label="The five agents and you">
          {[...CAST, ...CAST].map((c, i) => (
            <div key={i} className="rl-card" tabIndex={i < CAST.length ? 0 : -1} aria-hidden={i >= CAST.length}>
              <div className="rl-art" style={{ backgroundImage: `url("${CAST_SHEET}")`, backgroundPosition: `${POS_X[c.col]} ${POS_Y[c.row]}` }} />
              <div className="rl-cap rl-label">
                <span>{c.name}</span>
                <span>{c.n} · {c.type}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="rl-prog"><b ref={prog} /></div>

        <footer className="rl-foot">
          <div>
            <div className="rl-quote">WE PLAN, WE PITCH,<br /><em>WE SHIP.</em> WE REPORT.</div>
            <div className="rl-sub">Relay Agent Manifest · Synchronise 2026 · PS-CA2</div>
          </div>
          <div className="rl-quote rl-connect">OPEN <br />THE <br />DESK</div>
          <div className="rl-links">
            <Link href="/admin/login">Organiser desk <span>↗</span></Link>
            <Link href="/student/login">Student login <span>↗</span></Link>
            <Link href="/student/signup">Create an account <span>↗</span></Link>
            <Link href="/e/de000000-0000-4000-a000-000000000001">Live demo event <span>↗</span></Link>
          </div>
          <div className="rl-links">
            <a href="#walk">The agents <span>↗</span></a>
            <a href="#cast">The cast <span>↗</span></a>
            <a href="#top" onClick={(e) => (e.preventDefault(), go(0))}>Back to top <span>↗</span></a>
          </div>
        </footer>
        <div className="rl-legal">
          <span className="m">© 2026 • RELAY</span>
          <span><span className="m">BUILT FOR </span>SYNCHRONISE 2026</span>
          <span className="grow" />
          <span className="m">DEPT. OF ISE, RIT</span>
          <div className="rl-dots" aria-hidden><i /><i /><i /><i /><i /></div>
        </div>
      </section>
    </div>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */
