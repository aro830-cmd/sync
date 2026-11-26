import { FoxMark } from "@/components/FoxMark";
import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { FoxBackdrop } from "@/components/FoxBackdrop";
import { AdminLoginForm, AgentStack } from "@/components/AdminLogin";

export const metadata: Metadata = { title: "Organiser login — Relay" };

export default function Page() {
  return (
    <div className="grid min-h-screen md:grid-cols-[1.05fr_1fr]">
      <aside className="relative flex flex-col justify-between gap-10 overflow-hidden bg-[#0b0806] px-6 py-8 text-ink md:px-14 md:py-12">
        <FoxBackdrop />
        <div className="relative flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2.5 font-[family-name:var(--font-archivo)] text-2xl font-semibold tracking-[-0.02em]"><FoxMark className="size-9 rounded-[11px]" />Relay<sup className="text-[.45em] text-signal">®</sup></Link>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink/60">Organiser desk</span>
        </div>
        <div className="relative">
          <h1 className="font-[family-name:var(--font-archivo)] font-black uppercase [font-stretch:125%] text-[clamp(2.2rem,4.6vw,4.4rem)] leading-[0.92] tracking-[-0.025em]">
            One brief in,
            <br />
            <span className="text-signal">five agents out.</span>
          </h1>
          <p className="mt-6 max-w-sm text-[15px] leading-relaxed text-ink/70">
            Plan, pitch sponsors, schedule volunteers, run registration and report — you approve, they do the rest.
          </p>
        </div>
        <div className="relative hidden md:block">
          <AgentStack />
        </div>
      </aside>

      <main className="grain flex items-center justify-center px-6 py-14 md:py-12">
        <div className="w-full max-w-[380px]">
          {/* useSearchParams (for ?next=) needs a boundary under Cache Components */}
          <Suspense fallback={<div className="h-72" />}>
            <AdminLoginForm />
          </Suspense>
        </div>
      </main>
    </div>
  );
}