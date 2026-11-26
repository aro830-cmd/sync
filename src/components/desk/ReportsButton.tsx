"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { generateMissingReports } from "@/app/actions";
import { Button } from "./ui";

/** Writes the post-event report (and so the PDF) for every past event that's missing one. */
export function ReportsButton({ missing }: { missing: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");
  return (
    <span className="flex items-center gap-3">
      {msg && <span className="text-[12px] text-d-ink2">{msg}</span>}
      <Button variant="accent" pending={pending} disabled={!missing} onClick={() => start(async () => { const r = await generateMissingReports(); setMsg(r.message); router.refresh(); })}>
        {missing ? `Write ${missing} missing report${missing === 1 ? "" : "s"}` : "All reports written"}
      </Button>
    </span>
  );
}
