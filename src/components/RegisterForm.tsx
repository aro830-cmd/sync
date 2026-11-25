"use client";

import { AnimatePresence, motion } from "motion/react";
import { useActionState } from "react";
import { register } from "@/app/actions";

const ease = [0.23, 1, 0.32, 1] as const;
const input =
  "w-full border-b border-line bg-transparent py-3 text-[16px] outline-none transition-colors placeholder:text-ink-3 focus:border-ink";

export function RegisterForm({ eventId }: { eventId: string }) {
  const [state, action, pending] = useActionState(register.bind(null, eventId), null);

  return (
    <div className="rounded-2xl border border-line bg-paper-2 p-7">
      <AnimatePresence mode="wait" initial={false}>
        {state?.ok ? (
          <motion.div key="done" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease }}>
            <div className="font-[family-name:var(--font-archivo)] font-black uppercase [font-stretch:125%] text-4xl tracking-[-0.02em]">You’re in.</div>
            <p className="mt-3 text-[14px] text-ink-2">{state.message}</p>
          </motion.div>
        ) : (
          <motion.form key="form" action={action} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25, ease }} className="space-y-4">
            <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">Register</div>
            <input name="name" required maxLength={100} placeholder="Full name" aria-label="Full name" className={input} />
            <input name="email" type="email" required maxLength={200} placeholder="Email" aria-label="Email" className={input} />
            <input name="usn" maxLength={20} placeholder="USN (optional)" aria-label="USN" className={input} />
            {state && !state.ok && <p className="text-[13px] text-signal">{state.message}</p>}
            <button
              disabled={pending}
              className="mt-2 inline-flex h-11 w-full items-center justify-center rounded-full bg-ink text-[14px] text-paper transition-[transform,opacity] duration-150 ease-out active:scale-[0.98] disabled:opacity-50"
            >
              {pending ? "Registering…" : "Save my seat"}
            </button>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
