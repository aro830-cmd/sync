/** Shown by features that need migration 002 until the database owner has run it. */
export function MigrationNotice({ feature }: { feature: string }) {
  return (
    <div className="rounded-2xl border border-s4/40 bg-s4/10 p-6">
      <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-s4">Database update needed</div>
      <p className="mt-2 text-[14px] text-d-ink">{feature} needs new tables that aren&apos;t in this database yet.</p>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-[13px] text-d-ink2">
        <li>Open the Supabase dashboard for this project → <b>SQL Editor</b> → <b>New query</b>.</li>
        <li>Paste the whole file <code className="font-mono">supabase/migrations/002_sponsor_crm_volunteers.sql</code> and press <b>Run</b>.</li>
        <li>Reload this page. Nothing existing is changed or deleted, and it&apos;s safe to run twice.</li>
      </ol>
    </div>
  );
}
