"use client";

import { FoxMark } from "@/components/FoxMark";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { FoxBackdrop } from "@/components/FoxBackdrop";

const ease = [0.23, 1, 0.32, 1] as const;

const COPY = {
  login: { title: ["Welcome", "back."], lede: "Your registrations, check-ins and certificates — all in one place." },
  signup: { title: ["Every club event,", "one account."], lede: "Register in one tap. Your certificate lands here the moment you're checked in." },
};

export function AuthLayout({ children }: { children: React.ReactNode }) {
  const mode = usePathname().endsWith("/signup") ? "signup" : "login";
  const copy = COPY[mode];

  return (
    <div className="grid min-h-screen md:grid-cols-[1.05fr_1fr]">
      {/* Editorial panel */}
      <aside className="relative flex flex-col justify-between overflow-hidden bg-[#0b0806] px-6 py-8 text-ink md:px-14 md:py-12">
        <FoxBackdrop />
        <div className="relative flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2.5 font-[family-name:var(--font-archivo)] text-2xl font-semibold tracking-[-0.02em]"><FoxMark className="size-9 rounded-[11px]" />Relay<sup className="text-[.45em] text-signal">®</sup></Link>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink/60">Student portal</span>
        </div>

        <div className="relative mt-10 md:mt-0">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 12, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
              transition={{ duration: 0.45, ease }}
            >
              <h1 className="font-[family-name:var(--font-archivo)] font-black uppercase [font-stretch:125%] text-[clamp(2.2rem,4.6vw,4.4rem)] leading-[0.92] tracking-[-0.025em]">
                {copy.title[0]}
                <br />
                <span className="text-signal">{copy.title[1]}</span>
              </h1>
              <p className="mt-6 max-w-sm text-[15px] leading-relaxed text-ink/70">{copy.lede}</p>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="relative hidden md:block">
          <Ticket />
        </div>
      </aside>

      {/* Form side */}
      <main className="grain flex items-center justify-center px-6 py-14 md:py-12">
        <div className="w-full max-w-[380px]">
          <nav aria-label="Account" className="relative mb-10 grid grid-cols-2 rounded-full border border-line bg-paper-2 p-1 text-[13px]">
            {(["login", "signup"] as const).map((m) => (
              <Link
                key={m}
                href={`/student/${m}`}
                aria-current={mode === m ? "page" : undefined}
                className={`relative z-10 flex h-9 items-center justify-center rounded-full transition-colors duration-200 ${mode === m ? "text-paper" : "text-ink-2 hover:text-ink"}`}
              >
                {mode === m && (
                  <motion.span layoutId="auth-pill" transition={{ duration: 0.35, ease }} className="absolute inset-0 -z-10 rounded-full bg-ink" />
                )}
                {m === "login" ? "Log in" : "Sign up"}
              </Link>
            ))}
          </nav>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={mode}
              initial={{ opacity: 0, x: mode === "signup" ? 12 : -12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

/** Decorative event pass — pure CSS, no images. */
function Ticket() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28, rotate: -7 }}
      animate={{ opacity: 1, y: 0, rotate: -3 }}
      whileHover={{ rotate: 0, y: -4 }}
      transition={{ duration: 0.9, ease, delay: 0.15 }}
      className="w-[340px] origin-bottom-left rounded-2xl bg-[#f5ede5] text-[#160f0b] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]"
    >
      <div className="p-6">
        <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-[#7a6d62]">
          <span>Admit one</span>
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-signal" />
            Live
          </span>
        </div>
        <div className="mt-5 font-[family-name:var(--font-archivo)] text-4xl font-black uppercase leading-none tracking-[-0.02em] [font-stretch:115%]">HackRIT ’26</div>
        <div className="mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[#5b4f45]">15 Dec · Apex Block · 09:00</div>
      </div>
      <div className="relative border-t border-dashed border-[#d6c9bc]">
        <span className="absolute -left-3 -top-3 h-6 w-6 rounded-full bg-[#2a1208]" />
        <span className="absolute -right-3 -top-3 h-6 w-6 rounded-full bg-[#2a1208]" />
      </div>
      <div className="flex items-end justify-between p-6">
        <div className="space-y-1 font-mono text-[10px] uppercase tracking-[0.16em]">
          <div className="text-[#7a6d62]">Status</div>
          <div>Checked in ✓</div>
          <div className="text-signal">Certificate ready</div>
        </div>
        <div
          aria-hidden
          className="h-12 w-24 opacity-80"
          style={{
            background:
              "repeating-linear-gradient(90deg, #160f0b 0 2px, transparent 2px 4px, #160f0b 4px 5px, transparent 5px 8px, #160f0b 8px 11px, transparent 11px 13px)",
          }}
        />
      </div>
    </motion.div>
  );
}