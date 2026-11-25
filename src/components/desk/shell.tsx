"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { FoxCanvas } from "@/components/FoxCanvas";
import { adminLogout } from "@/app/actions";
import { ease } from "./ui";
import { Icon, P } from "./icons";


export type NavItem = { key: string; label: string; icon: ReactNode; active?: boolean; href?: string; onClick?: () => void; dot?: string; hint?: string };

function Item({ it }: { it: NavItem }) {
  const body = (
    <>
      {it.active && <motion.span layoutId="nav-active" transition={{ duration: 0.3, ease }} className="absolute inset-0 rounded-lg border border-d-line bg-white/[0.06]" />}
      <span className={`relative ${it.active ? "text-d-ink" : "text-d-ink3 group-hover:text-d-ink2"}`}>{it.icon}</span>
      <span className="relative min-w-0 flex-1 truncate">{it.label}</span>
      {it.hint && <span className="relative text-[11px] tabular-nums text-d-ink3">{it.hint}</span>}
      {it.dot && <span className={`relative size-1.5 rounded-full ${it.dot}`} />}
    </>
  );
  const cls = `group relative flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-left text-[13.5px] transition-colors ${it.active ? "text-d-ink" : "text-d-ink2 hover:text-d-ink"}`;
  return it.href ? <Link href={it.href} className={cls}>{body}</Link> : <button type="button" onClick={it.onClick} aria-current={it.active ? "page" : undefined} className={cls}>{body}</button>;
}

/** Dark app frame: sidebar on desktop, scrollable pill bar on mobile. */
const scrollFrac = () => {
  const max = document.documentElement.scrollHeight - innerHeight;
  return max > 0 ? scrollY / max : 0;
};

export function Shell({ head, groups, children, fox = scrollFrac }: { head?: ReactNode; groups: { label?: string; items: NavItem[] }[]; children: ReactNode; fox?: () => number }) {
  const [foxOn, setFoxOn] = useState(false);
  const flat = groups.flatMap((g) => g.items);
  return (
    <div className="relative flex min-h-screen">
      {/* ambient glow */}
      <div aria-hidden className="pointer-events-none fixed -top-48 right-[-10%] h-[520px] w-[720px] rounded-full opacity-[0.10] blur-[120px]" style={{ background: "radial-gradient(circle, var(--s1), transparent 60%)" }} />

      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-d-line bg-d-bg/80 px-3 py-4 backdrop-blur md:flex">
        <Link href="/dashboard" className="flex items-center gap-2.5 px-2 py-1">
          <span className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-s1 to-s5 text-[13px] font-semibold text-white">R</span>
          <span className="text-[15px] font-semibold tracking-[-0.01em]">Relay</span>
          <span className="rounded-md border border-d-line px-1.5 py-0.5 text-[10px] font-medium text-d-ink3">DESK</span>
        </Link>
        {head && <div className="mt-6 px-2">{head}</div>}
        <nav className="mt-6 flex-1 space-y-6 overflow-y-auto">
          {groups.map((g, i) => (
            <div key={i}>
              {g.label && <div className="mb-1.5 px-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-d-ink3">{g.label}</div>}
              <div className="space-y-0.5">{g.items.map((it) => <Item key={it.key} it={it} />)}</div>
            </div>
          ))}
        </nav>
        {/* Mascot: walks and orbits as you scroll and switch sections. Multiply over the gradient = orange duotone. */}
        <div className="relative mb-3 h-[150px] overflow-hidden rounded-2xl border border-d-line" style={{ background: "radial-gradient(120% 90% at 50% 35%, #ff7a2e 0%, #c2410c 38%, #3b1407 75%, #120805 100%)" }}>
          <div className={`absolute inset-0 transition-opacity duration-700 ${foxOn ? "opacity-100" : "opacity-0"}`}>
            <FoxCanvas progress={fox} mode="card" onReady={() => setFoxOn(true)} className="mix-blend-multiply [filter:grayscale(1)_contrast(1.25)_brightness(1.05)]" />
          </div>
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
          <div className="absolute bottom-2.5 left-3 text-[10px] font-medium uppercase tracking-[0.16em] text-white/80">Relay · on the move</div>
          {!foxOn && <div className="absolute inset-0 grid place-items-center text-[11px] text-white/60">Loading mascot…</div>}
        </div>
        <div className="space-y-0.5 border-t border-d-line pt-3">
          <Item it={{ key: "students", label: "Student portal", icon: Icon.student, href: "/student" }} />
          <form action={adminLogout}>
            <button className="flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-[13.5px] text-d-ink3 transition-colors hover:text-d-ink">
              <svg viewBox="0 0 24 24" className="size-[18px]" {...P}><path d="M15 4.5h3.5a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H15M10 16.5 14.5 12 10 7.5M14.5 12H4" /></svg>
              Log out
            </button>
          </form>
        </div>
      </aside>

      <div className="relative min-w-0 flex-1">
        <div className="sticky top-0 z-30 border-b border-d-line bg-d-bg/85 backdrop-blur md:hidden">
          <div className="flex items-center justify-between px-4 pt-3">
            <Link href="/dashboard" className="flex items-center gap-2">
              <span className="grid size-6 place-items-center rounded-md bg-gradient-to-br from-s1 to-s5 text-[11px] font-semibold text-white">R</span>
              <span className="text-[14px] font-semibold">Relay</span>
            </Link>
            <form action={adminLogout}><button className="text-[12.5px] text-d-ink3">Log out</button></form>
          </div>
          <div className="flex gap-1 overflow-x-auto px-3 py-2.5 [scrollbar-width:none]">
            {flat.map((it) => {
              const cls = `flex h-8 shrink-0 items-center gap-2 rounded-full px-3 text-[12.5px] ${it.active ? "bg-white/10 text-d-ink" : "text-d-ink2"}`;
              const inner = <>{it.dot && <span className={`size-1.5 rounded-full ${it.dot}`} />}{it.label}</>;
              return it.href ? (
                <Link key={it.key} href={it.href} className={cls}>{inner}</Link>
              ) : (
                <button key={it.key} onClick={it.onClick} className={cls} ref={(el) => { if (it.active) el?.scrollIntoView({ inline: "center", block: "nearest" }); }}>
                  {inner}
                </button>
              );
            })}
          </div>
        </div>
        <main className="relative mx-auto max-w-[1240px] px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
