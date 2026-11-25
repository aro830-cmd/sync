"use client";

import { AnimatePresence, motion } from "motion/react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

export const ease = [0.23, 1, 0.32, 1] as const;

export function Button({
  children,
  variant = "solid",
  pending,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "solid" | "ghost" | "accent"; pending?: boolean }) {
  const base =
    "inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3.5 text-[13px] font-medium whitespace-nowrap transition-[transform,background-color,border-color,opacity] duration-150 ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40";
  const look = {
    solid: "bg-d-ink text-d-bg hover:bg-white",
    ghost: "border border-d-line bg-white/[0.03] text-d-ink hover:bg-white/[0.07]",
    accent: "bg-s1 text-white hover:brightness-110",
  }[variant];
  return (
    <button {...props} disabled={props.disabled || pending} className={`${base} ${look} ${className}`}>
      {pending && <span className="size-3 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />}
      {children}
    </button>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-d-ink3">{children}</div>;
}

/** A panel with an optional title row and action. */
export function Card({ title, sub, action, children, className = "" }: { title?: string; sub?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-d-line bg-d-panel p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            {title && <h3 className="text-[14px] font-medium text-d-ink">{title}</h3>}
            {sub && <p className="mt-0.5 text-[12.5px] text-d-ink2">{sub}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

/** Stat tile: label · value · optional hint. */
export function Stat({ label, value, hint, dot }: { label: string; value: ReactNode; hint?: ReactNode; dot?: string }) {
  return (
    <div className="rounded-2xl border border-d-line bg-d-panel p-5">
      <div className="flex items-center gap-2 text-[12.5px] text-d-ink2">
        {dot && <span className={`size-2 rounded-full ${dot}`} />}
        {label}
      </div>
      <div className="mt-3 text-[28px] font-semibold leading-none tracking-[-0.02em] text-d-ink">{value}</div>
      {hint && <div className="mt-2 text-[12px] text-d-ink3">{hint}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-d-line px-5 py-8 text-center text-[13px] text-d-ink3">{children}</p>;
}

// ── toast ── one at a time, bottom centre, auto-dismiss
type Toast = { id: number; ok: boolean; message: string };
const ToastCtx = createContext<(ok: boolean, message: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const notify = useCallback((ok: boolean, message: string) => {
    const id = Date.now();
    setToast({ id, ok, message });
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), ok ? 3500 : 7000);
  }, []);
  return (
    <ToastCtx.Provider value={notify}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
        <AnimatePresence>
          {toast && (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.35, ease }}
              className="pointer-events-auto flex max-w-lg items-start gap-3 rounded-xl border border-d-line bg-d-raise px-4 py-3 text-[13px] text-d-ink shadow-[0_20px_50px_-12px_rgba(0,0,0,.8)]"
            >
              <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${toast.ok ? "bg-good" : "bg-crit"}`} />
              {toast.message}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}
