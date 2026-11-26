import { FoxMark } from "@/components/FoxMark";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { db } from "@/lib/server";
import { RegisterForm } from "@/components/RegisterForm";
import Link from "next/link";

async function Registration({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  // Public page: select only what attendees should see.
  const { data: ev } = await db().from("events").select("id, name, theme, date, venue").eq("id", id).maybeSingle();
  if (!ev?.name) notFound();

  const date = ev.date
    ? new Date(ev.date).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : "Date to be announced";

  return (
    <div className="grid gap-16 md:grid-cols-[1.2fr_1fr] md:items-end">
      <div>
        {/* eslint-disable-next-line @next/next/no-img-element -- generated PNG from our own route */}
        <img src={`/api/poster/${ev.id}`} alt={`${ev.name} poster`} className="mb-10 w-full max-w-sm rounded-2xl border border-line" />
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-2">{ev.theme}</p>
        <h1 className="mt-4 font-[family-name:var(--font-archivo)] font-black uppercase [font-stretch:125%] text-[clamp(2.6rem,7vw,5.8rem)] leading-[0.9] tracking-[-0.03em]">{ev.name}</h1>
        <div className="mt-8 space-y-1 border-l border-signal pl-4 text-[15px] text-ink-2">
          <p>{date}</p>
          <p>{ev.venue}</p>
        </div>
      </div>
      <div>
        <RegisterForm eventId={ev.id} />
        <p className="mt-4 text-center text-[13px] text-ink-2">
          Have a Relay account?{" "}
          <Link href="/student/login" className="text-ink underline underline-offset-4">
            Log in
          </Link>{" "}
          to register in one tap and get your certificate.
        </p>
      </div>
    </div>
  );
}

export default function Page({ params }: PageProps<"/e/[id]">) {
  return (
    <main className="grain min-h-screen px-6 py-16 md:py-28">
      <div className="mx-auto max-w-5xl">
        <Link href="/" className="inline-flex items-center gap-2.5 font-[family-name:var(--font-archivo)] text-2xl font-semibold tracking-[-0.02em]"><FoxMark className="size-9 rounded-[11px]" />Relay<sup className="text-[.45em] text-signal">®</sup></Link>
        <div className="mt-16 md:mt-24">
          <Suspense fallback={<div className="h-80 animate-pulse rounded-2xl bg-paper-2/50" />}>
            <Registration params={params} />
          </Suspense>
        </div>
      </div>
    </main>
  );
}