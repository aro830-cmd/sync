"use client";

import { useActionState, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { login, signup } from "@/app/actions";

const ease = [0.23, 1, 0.32, 1] as const;
// Public demo account for the finale (also in supabase/seed.sql).
const DEMO = { email: "ananya.krishnan@example.com", password: "Relay@2026" };

export function Field({ label, className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string }) {
  return (
    <label className="relative block">
      <input
        {...props}
        placeholder=" "
        className={`peer h-14 w-full rounded-xl border border-line bg-ink/[0.04] px-4 pt-5 text-[15px] transition-[border-color,background-color,box-shadow] duration-200 outline-none focus:border-signal focus:bg-ink/[0.07] focus:shadow-[0_0_0_4px_rgba(255,90,31,0.18)] focus-visible:outline-none ${className}`}
      />
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[15px] text-ink-3 transition-all duration-200 ease-out-quint peer-focus:top-[18px] peer-focus:text-[11px] peer-focus:tracking-wide peer-[:not(:placeholder-shown)]:top-[18px] peer-[:not(:placeholder-shown)]:text-[11px] peer-[:not(:placeholder-shown)]:tracking-wide">
        {label}
      </span>
    </label>
  );
}

export function PasswordField({ signup: isSignup, name = "password", label }: { signup: boolean; name?: string; label?: string }) {
  const [show, setShow] = useState(false);
  const [pw, setPw] = useState("");
  const score = [pw.length >= 8, /[^a-zA-Z]/.test(pw) && /[a-zA-Z]/.test(pw), pw.length >= 12].filter(Boolean).length;
  return (
    <div>
      <div className="relative">
        <Field
          label={label ?? (isSignup ? "Password (8+ characters)" : "Password")}
          name={name}
          type={show ? "text" : "password"}
          required
          minLength={isSignup ? 8 : undefined}
          maxLength={200}
          autoComplete={isSignup ? "new-password" : "current-password"}
          onChange={(e) => setPw(e.target.value)}
          className="pr-16"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
          aria-pressed={show}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3 transition-colors hover:text-ink"
        >
          {show ? "Hide" : "Show"}
        </button>
      </div>
      {isSignup && (
        <div className="mt-2.5 flex items-center gap-1.5" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-[3px] flex-1 overflow-hidden rounded-full bg-line">
              <motion.span
                className={`block h-full ${score === 3 ? "bg-ink" : "bg-signal"}`}
                animate={{ width: i < score ? "100%" : "0%" }}
                transition={{ duration: 0.3, ease }}
              />
            </span>
          ))}
          <span className="ml-1 w-14 text-right font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">
            {pw ? ["Weak", "Okay", "Good", "Strong"][score] : ""}
          </span>
        </div>
      )}
    </div>
  );
}

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const isSignup = mode === "signup";
  const [state, action, pending] = useActionState(isSignup ? signup : login, null);
  const form = useRef<HTMLFormElement>(null);
  const v = state?.values ?? {};

  function fillDemo() {
    const f = form.current;
    if (!f) return;
    (f.elements.namedItem("email") as HTMLInputElement).value = DEMO.email;
    (f.elements.namedItem("password") as HTMLInputElement).value = DEMO.password;
    f.requestSubmit();
  }

  return (
    <div>
      <h2 className="font-[family-name:var(--font-archivo)] font-black uppercase [font-stretch:125%] text-[34px] leading-none tracking-[-0.02em]">{isSignup ? "Create your account" : "Log in"}</h2>
      <p className="mt-3 text-[14px] text-ink-2">
        {isSignup ? "Takes ten seconds. Use your college email." : "Use the email you registered with."}
      </p>

      <form ref={form} action={action} className="mt-8 space-y-3">
        {isSignup && <Field label="Full name" name="name" required maxLength={100} autoComplete="name" defaultValue={v.name} />}
        <Field label="College email" name="email" type="email" required maxLength={200} autoComplete="email" defaultValue={v.email} />
        {isSignup && <Field label="USN (optional)" name="usn" maxLength={20} autoComplete="off" defaultValue={v.usn} />}
        <PasswordField signup={isSignup} />

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
              {isSignup ? "Creating account" : "Signing in"}
            </>
          ) : (
            <>
              {isSignup ? "Create account" : "Continue"}
              <span className="transition-transform duration-200 ease-out group-hover:translate-x-0.5">→</span>
            </>
          )}
        </button>
      </form>

      {!isSignup && (
        <button
          type="button"
          onClick={fillDemo}
          disabled={pending}
          className="mt-6 flex w-full items-center justify-between rounded-xl border border-dashed border-line px-4 py-3 text-left transition-colors hover:border-signal/60 hover:bg-ink/[0.05] disabled:opacity-60"
        >
          <span>
            <span className="block font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">For judges</span>
            <span className="mt-0.5 block text-[14px]">Use the demo student account</span>
          </span>
          <span className="text-ink-3">→</span>
        </button>
      )}
    </div>
  );
}

export function RegisterButton({ action }: { action: () => Promise<{ ok: boolean; message: string } | null> }) {
  const [state, run, pending] = useActionState(action, null);
  if (state?.ok) return <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-2">Registered ✓</span>;
  return (
    <form action={run} className="flex flex-col items-end gap-1">
      <button
        disabled={pending}
        className="inline-flex h-9 items-center rounded-full bg-ink px-4 text-[13px] text-paper transition-[transform,opacity] duration-150 ease-out active:scale-[0.97] disabled:opacity-50"
      >
        {pending ? "Registering…" : "Register"}
      </button>
      {state && !state.ok && <span className="text-[12px] text-signal">{state.message}</span>}
    </form>
  );
}
