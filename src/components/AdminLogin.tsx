"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { adminLogin } from "@/app/actions";
import { AGENTS } from "@/lib/agents";
import { PasswordField } from "@/components/student/AuthForm";

const ease = [0.23, 1, 0.32, 1] as const;

/** Decorative: the five agents lighting up in order, the way the desk runs them. */
export function AgentStack() {
  return (
    <ol className="w-full max-w-[360px] overflow-hidden rounded-2xl border border-ink/10 bg-[#0b0806]/55 backdrop-blur-md">
      {AGENTS.map((a, i) => (
        <motion.li
          key={a.id}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, ease, delay: 0.2 + i * 0.12 }}
          className="flex items-center gap-4 border-ink/10 px-5 py-3.5 not-last:border-b"
        >
          <span className="font-mono text-[10px] text-ink/50">0{i + 1}</span>
          <span className="flex-1">
            <span className="block text-[17px] font-semibold leading-none">{a.name}</span>
            <span className="mt-1 block text-[12px] text-ink/60">{a.does}</span>
          </span>
          <motion.span
            initial={{ backgroundColor: "rgba(245,237,229,0.15)" }}
            animate={{ backgroundColor: "#7fb77e" }}
            transition={{ duration: 0.3, delay: 0.9 + i * 0.35 }}
            className="size-2 rounded-full"
          />
        </motion.li>
      ))}
    </ol>
  );
}

export function AdminLoginForm() {
  const next = useSearchParams().get("next") ?? "/dashboard";
  const [state, action, pending] = useActionState(adminLogin, null);

  return (
    <div>
      <h2 className="font-[family-name:var(--font-archivo)] font-black uppercase [font-stretch:125%] text-[34px] leading-none tracking-[-0.02em]">Organiser login</h2>
      <p className="mt-3 text-[14px] text-ink-2">Enter the club passcode to open the event desk.</p>

      <form action={action} className="mt-8 space-y-3">
        <input type="hidden" name="next" value={next} />
        <PasswordField signup={false} name="passcode" label="Passcode" />
        <AnimatePresence initial={false}>
          {state && !state.ok && (
            <motion.p
              key={state.message}
              role="alert"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease }}
              className="flex items-center gap-2 pt-1 text-[13px] text-signal"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-signal" />
              {state.message}
            </motion.p>
          )}
        </AnimatePresence>
        <button
          disabled={pending}
          className="group mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-ink text-[14px] text-paper transition-[transform,opacity] duration-150 ease-out active:scale-[0.985] disabled:opacity-60"
        >
          {pending ? (
            <>
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-paper/30 border-t-paper" />
              Opening the desk
            </>
          ) : (
            <>
              Open the desk
              <span className="transition-transform duration-200 ease-out group-hover:translate-x-0.5">→</span>
            </>
          )}
        </button>
      </form>

      <p className="mt-8 border-t border-line pt-6 text-[13px] text-ink-2">
        Attending an event?{" "}
        <Link href="/student/login" className="text-ink underline underline-offset-4">
          Student login
        </Link>
      </p>
    </div>
  );
}
