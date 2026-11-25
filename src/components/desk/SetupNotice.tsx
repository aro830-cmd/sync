export function SetupNotice({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-crit/30 bg-crit/10 p-6">
      <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-crit">Setup needed</div>
      <p className="mt-2 text-[14px] text-d-ink">{message}</p>
      <p className="mt-3 text-[13px] text-d-ink2">
        Fill in <code className="font-mono">.env.local</code>, run <code className="font-mono">supabase/schema.sql</code> in the Supabase SQL editor, then restart{" "}
        <code className="font-mono">npm run dev</code>.
      </p>
    </div>
  );
}
