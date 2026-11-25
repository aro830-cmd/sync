import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { db } from "@/lib/server";
import { currentStudent } from "@/lib/student";
import { logout, registerMe } from "@/app/actions";
import { RegisterButton } from "@/components/student/AuthForm";

export const metadata: Metadata = { title: "My events — Relay" };

const fmt = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "Date TBA";

type Mine = { event_id: string; checked_in: boolean; events: { name: string; date: string | null; venue: string | null } | null };

async function Portal() {
  await connection(); // session expiry + "upcoming" both depend on the current time
  const me = await currentStudent();
  if (!me) redirect("/student/login");

  const today = new Date().toISOString().slice(0, 10);
  const [{ data: mine }, { data: upcoming }] = await Promise.all([
    db()
      .from("attendees")
      .select("event_id, checked_in, events(name, date, venue)")
      .eq("email", me.email)
      .order("created_at", { ascending: false })
      .returns<Mine[]>(),
    // Public fields only; events without a plan yet (no name) are not open.
    db().from("events").select("id, name, theme, date, venue").not("name", "is", null).gte("date", today).order("date").limit(30),
  ]);
  const registered = new Set((mine ?? []).map((m) => m.event_id));
  const open = (upcoming ?? []).filter((e) => !registered.has(e.id));

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-2">
            {me.usn ? `${me.usn} · ` : ""}
            {me.email}
          </p>
          <h1 className="mt-4 font-[family-name:var(--font-archivo)] font-black uppercase [font-stretch:125%] text-[clamp(2.2rem,5vw,3.8rem)] leading-[0.92] tracking-[-0.025em]">
            Hi, {me.name.split(" ")[0]}.
          </h1>
        </div>
        <form action={logout}>
          <button className="inline-flex h-10 items-center rounded-full border border-line px-5 text-[14px] transition-colors hover:border-ink">
            Log out
          </button>
        </form>
      </div>

      <section className="mt-16">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">My registrations</h2>
        {mine?.length ? (
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {mine.map((m) => (
              <li key={m.event_id} className="flex flex-wrap items-center justify-between gap-4 py-5">
                <div>
                  <div className="text-[20px] font-semibold tracking-[-0.01em]">{m.events?.name ?? "Event"}</div>
                  <div className="mt-1 text-[14px] text-ink-2">
                    {fmt(m.events?.date ?? null)}
                    {m.events?.venue ? ` · ${m.events.venue}` : ""}
                  </div>
                </div>
                {m.checked_in ? (
                  <a
                    href={`/api/certificate/${m.event_id}`}
                    className="inline-flex h-9 items-center rounded-full bg-ink px-4 text-[13px] text-paper transition-transform duration-150 ease-out active:scale-[0.97]"
                  >
                    Download certificate
                  </a>
                ) : (
                  <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-2">Registered</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-[15px] text-ink-2">Nothing yet — pick an event below.</p>
        )}
      </section>

      <section className="mt-16">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">Upcoming events</h2>
        {open.length ? (
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {open.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-4 py-5">
                <div>
                  <div className="text-[20px] font-semibold tracking-[-0.01em]">{e.name}</div>
                  <div className="mt-1 text-[14px] text-ink-2">
                    {fmt(e.date)}
                    {e.venue ? ` · ${e.venue}` : ""}
                  </div>
                  {e.theme && <div className="mt-1 text-[13px] text-ink-3">{e.theme}</div>}
                </div>
                <RegisterButton action={registerMe.bind(null, e.id)} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-[15px] text-ink-2">No open events right now. Check back soon.</p>
        )}
      </section>
    </>
  );
}

export default function Page() {
  return (
    <main className="grain min-h-screen px-6 py-16 md:py-24">
      <div className="mx-auto max-w-4xl">
        <Link href="/" className="font-[family-name:var(--font-archivo)] text-2xl font-semibold tracking-[-0.02em]">Relay<sup className="text-[.45em] text-signal">®</sup></Link>
        <div className="mt-14">
          <Suspense fallback={<div className="h-80 animate-pulse rounded-2xl bg-paper-2/50" />}>
            <Portal />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
