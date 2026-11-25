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
const display = "font-[family-name:var(--font-archivo)] font-black uppercase [font-stretch:125%] tracking-[-0.025em]";
const kicker = "font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3";

type Ev = { name: string; date: string | null; venue: string | null; theme: string | null };
type Mine = { event_id: string; checked_in: boolean; certificate_sent: boolean; events: Ev | null };

function DateChip({ date }: { date: string | null }) {
  return (
    <div className="grid w-14 shrink-0 place-items-center rounded-2xl border border-line py-2 text-center">
      <span className="font-mono text-[10px] tracking-[0.14em] text-signal">{date ? new Date(date).toLocaleDateString("en-IN", { month: "short" }).toUpperCase() : "TBA"}</span>
      <span className="text-[22px] leading-none font-semibold tabular-nums">{date ? new Date(date).getDate() : "—"}</span>
    </div>
  );
}

async function Portal() {
  await connection(); // session expiry + "upcoming" both depend on the current time
  const me = await currentStudent();
  if (!me) redirect("/student/login");

  const today = new Date().toISOString().slice(0, 10);
  const now = Date.parse(today); // day granularity is all the countdowns need
  const [{ data: mine }, { data: open }] = await Promise.all([
    db()
      .from("attendees")
      .select("event_id, checked_in, certificate_sent, events(name, date, venue, theme)")
      .eq("email", me.email)
      .returns<Mine[]>(),
    // Public fields only; events without a plan yet (no name) are not open.
    db().from("events").select("id, name, theme, date, venue").not("name", "is", null).gte("date", today).order("date").limit(30),
  ]);
  const list = (mine ?? []).filter((m) => m.events);
  const registered = new Set(list.map((m) => m.event_id));
  const myUpcoming = list.filter((m) => !m.events!.date || m.events!.date >= today).sort((a, b) => (a.events!.date ?? "").localeCompare(b.events!.date ?? ""));
  const myPast = list.filter((m) => m.events!.date && m.events!.date < today).sort((a, b) => b.events!.date!.localeCompare(a.events!.date!));
  const certs = myPast.filter((m) => m.checked_in);
  const discover = (open ?? []).filter((e) => !registered.has(e.id));
  const next = myUpcoming[0];
  const days = next?.events?.date ? Math.ceil((Date.parse(next.events.date) - now) / 86_400_000) : null;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-2">
            {me.usn ? `${me.usn} · ` : ""}
            {me.email}
          </p>
          <h1 className={`mt-4 text-[clamp(2.2rem,5vw,3.8rem)] leading-[0.92] ${display}`}>Hi, {me.name.split(" ")[0]}.</h1>
          {next && (
            <p className="mt-4 text-[15px] text-ink-2">
              Next up: <span className="text-ink">{next.events!.name}</span>
              {days != null && <span className="text-signal"> · {days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`}</span>}
            </p>
          )}
        </div>
        <form action={logout}>
          <button className="inline-flex h-10 items-center rounded-full border border-line px-5 text-[14px] transition-colors hover:border-ink">Log out</button>
        </form>
      </div>

      {/* stats */}
      <div className="mt-10 grid grid-cols-3 gap-3">
        {[
          ["Coming up", myUpcoming.length],
          ["Attended", myPast.filter((m) => m.checked_in).length],
          ["Certificates", certs.length],
        ].map(([l, v]) => (
          <div key={l} className="rounded-2xl border border-line bg-paper-2/40 p-5">
            <div className={kicker}>{l}</div>
            <div className={`mt-3 text-[clamp(1.8rem,4vw,2.6rem)] leading-none ${display}`}>{v}</div>
          </div>
        ))}
      </div>

      {/* in-page tabs */}
      <nav className="sticky top-0 z-10 -mx-6 mt-10 flex gap-1 overflow-x-auto bg-paper/85 px-6 py-3 backdrop-blur [scrollbar-width:none]">
        {[["#upcoming", "Upcoming"], ["#past", "Past events"], ["#certificates", "My certificates"]].map(([h, l]) => (
          <a key={h} href={h} className="shrink-0 rounded-full border border-line px-4 py-1.5 text-[13px] text-ink-2 transition-colors hover:border-ink hover:text-ink">{l}</a>
        ))}
      </nav>

      <section id="upcoming" className="mt-8 scroll-mt-20">
        <h2 className={kicker}>Upcoming — you&apos;re registered</h2>
        {myUpcoming.length ? (
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {myUpcoming.map((m) => {
              const d = m.events!.date ? Math.ceil((Date.parse(m.events!.date) - now) / 86_400_000) : null;
              return (
                <li key={m.event_id} className="flex items-start gap-4 rounded-2xl border border-line p-5 transition-colors hover:border-ink/40">
                  <DateChip date={m.events!.date} />
                  <div className="min-w-0">
                    <div className="truncate text-[18px] font-semibold tracking-[-0.01em]">{m.events!.name}</div>
                    <div className="mt-1 text-[13.5px] text-ink-2">{m.events!.venue}</div>
                    <div className="mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-signal">{d == null ? "Date TBA" : d === 0 ? "Today" : `In ${d} day${d === 1 ? "" : "s"}`}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-4 text-[15px] text-ink-2">Nothing booked yet — pick something below.</p>
        )}

        <h2 className={`${kicker} mt-12`}>Open for registration</h2>
        {discover.length ? (
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {discover.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-4 py-5">
                <div className="flex items-start gap-4">
                  <DateChip date={e.date} />
                  <div>
                    <div className="text-[18px] font-semibold tracking-[-0.01em]">{e.name}</div>
                    <div className="mt-1 text-[13.5px] text-ink-2">{fmt(e.date)}{e.venue ? ` · ${e.venue}` : ""}</div>
                    {e.theme && <div className="mt-1 text-[13px] text-ink-3">{e.theme}</div>}
                  </div>
                </div>
                <RegisterButton action={registerMe.bind(null, e.id)} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-[15px] text-ink-2">No other open events right now. Check back soon.</p>
        )}
      </section>

      <section id="past" className="mt-16 scroll-mt-20">
        <h2 className={kicker}>Past events</h2>
        {myPast.length ? (
          <ul className="mt-4 divide-y divide-line border-y border-line">
            {myPast.map((m) => (
              <li key={m.event_id} className="flex flex-wrap items-center justify-between gap-4 py-5">
                <div>
                  <div className="text-[18px] font-semibold tracking-[-0.01em]">{m.events!.name}</div>
                  <div className="mt-1 text-[13.5px] text-ink-2">{fmt(m.events!.date)}{m.events!.venue ? ` · ${m.events!.venue}` : ""}</div>
                </div>
                <span className={`rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-[0.12em] ${m.checked_in ? "bg-signal/15 text-signal" : "border border-line text-ink-3"}`}>{m.checked_in ? "Attended" : "Missed"}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-[15px] text-ink-2">Your history shows up here after your first event.</p>
        )}
      </section>

      <section id="certificates" className="mt-16 scroll-mt-20">
        <h2 className={kicker}>My certificates</h2>
        {certs.length ? (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {certs.map((m) => (
              <li key={m.event_id} className="group relative overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-paper-2 to-paper p-6">
                <span aria-hidden className="absolute -top-10 -right-10 size-32 rounded-full border-[10px] border-signal/15 transition-transform duration-500 group-hover:scale-110" />
                <div className={kicker}>Certificate of participation</div>
                <div className={`mt-3 text-[22px] leading-[1.05] ${display}`}>{m.events!.name}</div>
                <div className="mt-2 text-[13.5px] text-ink-2">{me.name} · {fmt(m.events!.date)}</div>
                <a href={`/api/certificate/${m.event_id}`} className="mt-5 inline-flex h-9 items-center gap-2 rounded-full bg-ink px-4 text-[13px] text-paper transition-transform duration-150 ease-out active:scale-[0.97]">
                  Download PDF <span aria-hidden>↓</span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-[15px] text-ink-2">Certificates appear here once you&apos;re checked in at an event.</p>
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
